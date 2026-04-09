/**
 * Viral moment analyzer powered by Gemini.
 *
 * Gemini ingests the YouTube URL directly via `fileData.fileUri` and analyzes
 * the actual video (audio + frames + captions) on Google's infrastructure.
 * That sidesteps YouTube's datacenter-IP block on Vercel and lets us pick up
 * purely visual moments (reactions, drag race finishes, crashes) that a
 * transcript-only pipeline would miss.
 */

import { GoogleGenAI } from "@google/genai";
import type { VideoMetadata } from "./youtube";

export type ViralMoment = {
  /** Start of the suggested clip in seconds. */
  startSec: number;
  /** End of the suggested clip in seconds. */
  endSec: number;
  /** Short hook-style title (max ~60 chars). */
  title: string;
  /** One or two sentences describing what happens. */
  description: string;
  /** 0-100 confidence that this will perform as a short. */
  score: number;
  /** Why it's viral. */
  reason: string;
};

export type AnalysisResult = {
  moments: ViralMoment[];
  model: string;
};

const SYSTEM_PROMPT = `Eres un editor de video vertical especializado en contenido de automoción para el equipo de redes sociales de **Carwow España**. Tu trabajo es identificar los mejores momentos de un video largo de YouTube para cortarlos como Shorts / TikToks / Reels verticales (máximo 80 segundos cada uno, pueden ser más cortos si el momento lo pide).

CONTEXTO DEL CANAL
- Carwow España es la versión en castellano del canal británico Carwow.
- El presentador principal es **JF Calero** (Juan Francisco Calero), no Mat Watson (Mat es el del canal británico en inglés).
- El contenido típico incluye: reviews de coches, comparativas, drag races (carreras de aceleración), brake tests, vueltas rápidas, reacciones de JF Calero, chistes y frases icónicas en castellano, revelaciones de precios, tests 0-100, top speeds, sonido del motor, diseño, interior, y veredictos finales.
- El público hispanohablante valora especialmente: reacciones emocionales de JF Calero, resultados de drag races, sorpresas, momentos "madre mía", frases pegadizas en castellano y comparativas cara a cara.

INFORMACIÓN QUE TIENES
- Vas a recibir directamente el video de YouTube. Puedes ver la imagen, escuchar el audio y leer los subtítulos. Aprovecha las tres pistas:
  - Visual: caras de sorpresa, gestos, derrapes, momentos espectaculares, comparativas en pantalla.
  - Audio: gritos de "MADRE MÍA", risas, sonido del motor, frenazos, música que sube de intensidad.
  - Verbal: frases icónicas, revelaciones, chistes, conclusiones contundentes.

REGLAS PARA ELEGIR MOMENTOS
1. Cada momento debe ser autocontenido: entendible sin haber visto el resto del video.
2. Prioriza momentos con un pico claro de emoción (reacción de JF Calero, sorpresa, sonido espectacular del motor, resultado de drag race, frase pegadiza).
3. Redondea los límites a segundos enteros. Duración MÁXIMA 80 segundos — bajo NINGÚN concepto devuelvas clips de más de 80 segundos. Pueden ser más cortos (15, 20, 40 segundos) si el momento se sostiene solo; prioriza calidad sobre duración, no rellenes para llegar a 80. Arranca unos segundos ANTES del remate para dar contexto al espectador.
4. NO elijas intros, outros, menciones a patrocinadores, llamadas a suscribirse ni secciones promocionales.
5. Devuelve EXACTAMENTE 4 momentos, ordenados por score (mayor primero). Ni más ni menos: elige los 4 mejores del video.
6. Puntúa cada momento de 0 a 100 según tu confianza de que funcionará como Short standalone.
7. Escribe \`title\`, \`description\` y \`reason\` en **español de España** (castellano), con el tono de Carwow España (cercano, directo, con gancho). Si mencionas al presentador, llámalo "JF Calero".

FORMATO DE RESPUESTA
Responde ÚNICAMENTE con JSON válido, sin bloques de código markdown ni comentarios, siguiendo este esquema:

{
  "moments": [
    {
      "startSec": number,           // segundo de inicio del clip
      "endSec": number,             // segundo de fin del clip
      "title": string,              // gancho estilo titular, máx 60 caracteres
      "description": string,        // 1-2 frases describiendo qué pasa
      "score": number,              // 0-100
      "reason": string              // por qué es viral, citando lo que ves/oyes
    }
  ]
}`;

const USER_PROMPT = `Analiza este video de Carwow España e identifica los mejores momentos para cortar como Shorts/TikToks/Reels verticales. Devuelve el JSON con los momentos siguiendo el formato indicado.`;

export type AnalyzeOptions = {
  /**
   * When true, uses the fast (but less intelligent) flash model. Meant for
   * long videos that would otherwise time out on Vercel's 60s Hobby cap.
   * Default: false (uses the smart Pro model with a 45s internal timeout).
   */
  fast?: boolean;
};

/** Sentinel error that the route handler looks for to return a TIMEOUT code. */
export const GEMINI_TIMEOUT_ERROR = "GEMINI_TIMEOUT";

export async function analyzeViralMoments(
  metadata: VideoMetadata,
  options: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Configure it in your environment variables.",
    );
  }

  // Fast mode = flash (for long videos). Default = Pro (smarter, slower).
  // The Vercel env var GEMINI_MODEL is ignored on purpose: it used to be
  // pinned to gemini-2.5-flash and kept overriding the code.
  const model = options.fast
    ? "gemini-2.5-flash"
    : "gemini-3.1-pro-preview";
  const ai = new GoogleGenAI({ apiKey });

  const generatePromise = ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            fileData: {
              fileUri: metadata.videoUrl,
              mimeType: "video/*",
            },
          },
          { text: USER_PROMPT },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.4,
      responseMimeType: "application/json",
    },
  });

  // When using Pro, bail out at 45s so we can return a structured TIMEOUT
  // response before Vercel's 60s Hobby cap kills the function. The client
  // auto-retries with fast=true. Flash has no timeout (it's fast enough).
  const response = options.fast
    ? await generatePromise
    : await Promise.race<Awaited<typeof generatePromise>>([
        generatePromise,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(GEMINI_TIMEOUT_ERROR)),
            45_000,
          ),
        ),
      ]);

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return {
    moments: parseMomentsJson(text),
    model,
  };
}

function parseMomentsJson(raw: string): ViralMoment[] {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Gemini returned non-JSON output: ${(err as Error).message}\n${raw.slice(0, 400)}`,
    );
  }

  const list = (parsed as { moments?: unknown })?.moments;
  if (!Array.isArray(list)) {
    throw new Error("Gemini response did not contain a 'moments' array.");
  }

  const result: ViralMoment[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const startSec = Number(m.startSec);
    const endSec = Number(m.endSec);
    if (Number.isNaN(startSec) || Number.isNaN(endSec) || endSec <= startSec) {
      continue;
    }
    // Hard cap the clip length at 80 seconds regardless of what Gemini returns.
    const safeStart = Math.max(0, startSec);
    const safeEnd = Math.min(endSec, safeStart + 80);
    result.push({
      startSec: safeStart,
      endSec: Math.max(safeStart + 1, safeEnd),
      title: String(m.title ?? "").slice(0, 80),
      description: String(m.description ?? ""),
      score: Math.max(0, Math.min(100, Number(m.score ?? 0))),
      reason: String(m.reason ?? ""),
    });
  }

  result.sort((a, b) => b.score - a.score);
  return result.slice(0, 4);
}
