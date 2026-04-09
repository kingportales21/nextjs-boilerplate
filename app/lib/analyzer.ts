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

⚠️ REGLA INQUEBRANTABLE — CERO ALUCINACIONES
Solo puedes describir cosas que REALMENTE ves u oyes en este video concreto. NO inventes nada. NO generes momentos "plausibles" a partir del título, del nombre del canal o de tu conocimiento general sobre Carwow. Todo lo que devuelvas debe salir literalmente del video que estás viendo.

Para cada momento DEBES incluir evidencia específica que solo podrías conocer habiendo visto el video:
- En el campo \`reason\`, incluye al MENOS UNA cita textual (verbatim) del audio o subtítulos entre comillas españolas «», con las palabras exactas que se dicen en ese momento.
- En el campo \`description\`, menciona al menos UN detalle visual concreto y verificable (qué coche se ve, qué color, qué gesto hace JF Calero, qué aparece en pantalla, dónde están grabando).

SI POR CUALQUIER MOTIVO NO PUEDES ACCEDER AL VIDEO (no te carga, está restringido geográficamente, es privado, falla la ingesta, lo que sea) — NO generes momentos imaginarios. En ese caso responde EXACTAMENTE con este JSON y nada más:

{ "moments": [], "error": "no_video_access" }

REGLAS PARA ELEGIR MOMENTOS
1. Cada momento debe ser autocontenido: entendible sin haber visto el resto del video.
2. Prioriza momentos con un pico claro de emoción (reacción de JF Calero, sorpresa, sonido espectacular del motor, resultado de drag race, frase pegadiza).
3. Redondea los límites a segundos enteros. Duración MÁXIMA 80 segundos — bajo NINGÚN concepto devuelvas clips de más de 80 segundos. Pueden ser más cortos (15, 20, 40 segundos) si el momento se sostiene solo; prioriza calidad sobre duración, no rellenes para llegar a 80. Arranca unos segundos ANTES del remate para dar contexto al espectador.
4. NO elijas intros, outros, menciones a patrocinadores, llamadas a suscribirse ni secciones promocionales.
5. Devuelve EXACTAMENTE 4 momentos, ordenados por score (mayor primero). Ni más ni menos: elige los 4 mejores del video. (Excepción: si no puedes acceder al video, devuelve el JSON de error de arriba.)
6. Puntúa cada momento de 0 a 100 según tu confianza de que funcionará como Short standalone.
7. Escribe \`title\`, \`description\` y \`reason\` en **español de España** (castellano), con el tono de Carwow España (cercano, directo, con gancho). Si mencionas al presentador, llámalo "JF Calero".

FORMATO DE RESPUESTA
Responde ÚNICAMENTE con JSON válido, sin bloques de código markdown ni comentarios, siguiendo este esquema:

{
  "videoDurationSec": number,     // duración TOTAL del video en segundos (lo más precisa posible)
  "videoTopic": string,           // 1 frase describiendo de qué va el video (evidencia de que lo has visto)
  "moments": [
    {
      "startSec": number,           // segundo de inicio del clip (DEBE ser < videoDurationSec)
      "endSec": number,             // segundo de fin del clip (DEBE ser <= videoDurationSec)
      "title": string,              // gancho estilo titular, máx 60 caracteres
      "description": string,        // 1-2 frases describiendo qué pasa, CON detalle visual concreto
      "score": number,              // 0-100
      "reason": string              // por qué es viral, INCLUYENDO al menos una cita verbatim entre «»
    }
  ]
}

Bajo NINGÚN concepto devuelvas un momento cuyo startSec o endSec sea mayor que la duración real del video. Si no sabes la duración exacta, sé conservador.`;

function buildUserPrompt(metadata: VideoMetadata): string {
  return `Analiza este video CONCRETO de YouTube que te estoy adjuntando:

URL: ${metadata.videoUrl}
${metadata.title ? `Título: ${metadata.title}` : ""}
${metadata.author ? `Canal: ${metadata.author}` : ""}

Devuelve el JSON con \`videoDurationSec\`, \`videoTopic\` y los 4 mejores momentos para cortar como Shorts/TikToks/Reels.

⚠️ Recordatorio crítico:
- Solo describe lo que REALMENTE ves y oyes en ESTE video adjunto. No inventes.
- Cada \`reason\` debe contener una cita verbatim entre «» con palabras exactas del audio.
- Cada \`description\` debe incluir un detalle visual concreto (coche, color, gesto, lugar, lo que aparece en pantalla).
- NINGÚN timestamp puede ser mayor que \`videoDurationSec\`.
- Si no puedes acceder al video adjunto, devuelve exactamente { "moments": [], "error": "no_video_access" }.`;
}

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

/** Sentinel error when Gemini reports it couldn't actually watch the video. */
export const GEMINI_NO_VIDEO_ACCESS_ERROR = "GEMINI_NO_VIDEO_ACCESS";

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

  // Fast mode = flash (for long videos). Default = 2.5 Pro (smarter).
  // We deliberately stick to the 2.5 family because it's the only one that
  // officially supports YouTube URL ingestion via fileData.fileUri. Gemini
  // 3.1 Pro preview was trying to cope with the YouTube URL but didn't
  // actually ingest the video and was hallucinating plausible-sounding
  // Carwow moments based purely on the prompt.
  // The Vercel env var GEMINI_MODEL is ignored on purpose: it used to be
  // pinned to gemini-2.5-flash and kept overriding the code.
  const model = options.fast ? "gemini-2.5-flash" : "gemini-2.5-pro";
  const ai = new GoogleGenAI({ apiKey });

  const generatePromise = ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            // No mimeType here on purpose: "video/*" is a wildcard, not a
            // valid MIME type, and causes the Gemini API to silently reject
            // the fileData (which was the root cause of hallucinations —
            // Gemini never actually saw the video). Google's own docs for
            // YouTube URL ingestion show no mimeType.
            fileData: {
              fileUri: metadata.videoUrl,
            },
          },
          { text: buildUserPrompt(metadata) },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      // Low temperature to keep the model grounded in what it actually
      // sees/hears in the video and minimize creative hallucinations.
      temperature: 0.2,
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

  // Log a truncated version of the raw response so we can debug hallucinations
  // and ingest failures from Vercel's function logs.
  console.log(
    "[analyzer] Gemini raw response (truncated):",
    text.slice(0, 1500),
  );

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

  const parsedObj = parsed as {
    error?: unknown;
    moments?: unknown;
    videoDurationSec?: unknown;
    videoTopic?: unknown;
  };

  // Anti-hallucination guardrail: if Gemini reports it couldn't watch the
  // video, surface a specific error instead of silently returning nothing.
  if (
    typeof parsedObj.error === "string" &&
    parsedObj.error === "no_video_access"
  ) {
    throw new Error(GEMINI_NO_VIDEO_ACCESS_ERROR);
  }

  const list = parsedObj.moments;
  if (!Array.isArray(list)) {
    throw new Error("Gemini response did not contain a 'moments' array.");
  }

  // Gemini's declared video duration (if any). We use it to reject any
  // moment with a timestamp beyond the real video length, which is a
  // telltale sign of hallucination.
  const rawDuration = Number(parsedObj.videoDurationSec);
  const videoDurationSec =
    Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : undefined;

  console.log(
    "[analyzer] videoDurationSec=%s videoTopic=%s momentCount=%d",
    videoDurationSec,
    typeof parsedObj.videoTopic === "string"
      ? parsedObj.videoTopic.slice(0, 120)
      : "(none)",
    list.length,
  );

  const result: ViralMoment[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const startSec = Number(m.startSec);
    const endSec = Number(m.endSec);
    if (Number.isNaN(startSec) || Number.isNaN(endSec) || endSec <= startSec) {
      continue;
    }
    // Reject any moment whose start is beyond the declared video duration —
    // that's hallucination by definition.
    if (videoDurationSec !== undefined && startSec >= videoDurationSec) {
      console.warn(
        "[analyzer] dropping hallucinated moment (startSec %d >= duration %d): %s",
        startSec,
        videoDurationSec,
        m.title,
      );
      continue;
    }
    // Hard cap the clip length at 80 seconds regardless of what Gemini returns.
    const safeStart = Math.max(0, startSec);
    let safeEnd = Math.min(endSec, safeStart + 80);
    // Clamp end to the declared video duration too.
    if (videoDurationSec !== undefined) {
      safeEnd = Math.min(safeEnd, videoDurationSec);
    }
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
