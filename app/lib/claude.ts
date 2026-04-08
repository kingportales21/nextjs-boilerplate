/**
 * Claude-backed viral moment analyzer.
 *
 * Combines three signals into a single ranked list of candidate clips:
 *   1. YouTube Most Replayed heatmap peaks (real user behavior).
 *   2. Full timestamped transcript (narrative / semantic content).
 *   3. Video metadata (title, channel, description) for topical context.
 *
 * Claude is asked to return strict JSON so the UI can render it directly.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { HeatmapMarker, VideoMetadata } from "./youtube";
import { formatTime } from "./transcript";

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
  /** Why it's viral — which signals supported this pick. */
  reason: string;
  /** Short excerpt from the transcript that anchors the moment. */
  transcriptExcerpt: string;
  /** Which of the three signals contributed. */
  signals: {
    heatmap: boolean;
    transcript: boolean;
    metadata: boolean;
  };
};

export type AnalysisResult = {
  moments: ViralMoment[];
  usedHeatmap: boolean;
  usedTranscript: boolean;
  model: string;
};

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-6";

const SYSTEM_PROMPT = `Eres un editor de video vertical especializado en contenido de automoción para el equipo de redes sociales de **Carwow España**. Tu trabajo es identificar los mejores momentos de un video largo de YouTube para cortarlos como Shorts / TikToks / Reels verticales (20-60 segundos cada uno).

CONTEXTO DEL CANAL
- Carwow España es la versión en castellano del canal británico Carwow.
- El contenido típico incluye: reviews de coches, comparativas, drag races (carreras de aceleración), brake tests, vueltas rápidas, reacciones del presentador, chistes y frases icónicas, revelaciones de precios, tests 0-100, top speeds, sonido del motor, diseño, interior, y veredictos finales.
- El público hispanohablante valora especialmente: reacciones emocionales del presentador, resultados de drag races, sorpresas, momentos "OMG", frases pegadizas en español y comparativas cara a cara.

ENTRADA QUE RECIBIRÁS
- Metadatos del video (título, canal, descripción).
- Los picos del "Most Replayed" (heatmap) de YouTube, si están disponibles. Son los momentos exactos donde los espectadores reales rebobinaron o volvieron a ver — trátalos como la señal MÁS FUERTE de viralidad.
- Un transcript con marcas de tiempo del video.

REGLAS PARA ELEGIR MOMENTOS
1. Cada momento debe ser autocontenido: entendible sin haber visto el resto del video.
2. Prioriza momentos donde un pico del heatmap coincida con un fragmento narrativamente fuerte del transcript (reacciones, remates, revelaciones, resultados de drag race, sorpresas, frases icónicas).
3. Redondea los límites a segundos enteros. Duración entre 20 y 60 segundos. Arranca unos segundos ANTES del remate para dar contexto al espectador.
4. NO elijas intros, outros, menciones a patrocinadores, llamadas a suscribirse ni secciones promocionales.
5. Devuelve entre 3 y 6 momentos, ordenados por score (mayor primero). Si el video realmente tiene menos momentos fuertes, devuelve menos.
6. Puntúa cada momento de 0 a 100 según tu confianza de que funcionará como Short standalone.
7. Escribe \`title\`, \`description\` y \`reason\` en **español de España** (castellano), con el tono de Carwow España (cercano, directo, con gancho).
8. El \`transcriptExcerpt\` debe ser una cita literal del transcript original (sin traducir).

FORMATO DE RESPUESTA
Responde ÚNICAMENTE con JSON válido, sin bloques de código markdown ni comentarios, siguiendo este tipo TypeScript:

{
  "moments": Array<{
    "startSec": number,
    "endSec": number,
    "title": string,               // gancho estilo titular, máx 60 caracteres, en castellano
    "description": string,         // 1-2 frases en castellano describiendo qué pasa
    "score": number,               // 0-100
    "reason": string,              // por qué es viral, citando las señales, en castellano
    "transcriptExcerpt": string,   // cita literal del transcript original
    "signals": {
      "heatmap": boolean,          // true si un pico del heatmap respalda esta elección
      "transcript": boolean,       // true si el contenido del transcript lo respalda
      "metadata": boolean          // true si el título/descripción del video lo respalda temáticamente
    }
  }>
}`;

type AnalyzeInput = {
  metadata: VideoMetadata;
  heatmapPeaks: HeatmapMarker[] | null;
  annotatedTranscript: string | null;
};

export async function analyzeViralMoments(input: AnalyzeInput): Promise<AnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local before analyzing.",
    );
  }

  const client = new Anthropic({ apiKey });
  const userPrompt = buildUserPrompt(input);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content.");
  }

  const moments = parseMomentsJson(textBlock.text, input.metadata.lengthSeconds);

  return {
    moments,
    usedHeatmap: (input.heatmapPeaks?.length ?? 0) > 0,
    usedTranscript: Boolean(input.annotatedTranscript),
    model: MODEL,
  };
}

function buildUserPrompt({
  metadata,
  heatmapPeaks,
  annotatedTranscript,
}: AnalyzeInput): string {
  const parts: string[] = [];

  parts.push("VIDEO METADATA");
  parts.push(`- Title: ${metadata.title}`);
  parts.push(`- Channel: ${metadata.author}`);
  parts.push(`- Length: ${formatTime(metadata.lengthSeconds)} (${metadata.lengthSeconds}s)`);
  if (metadata.description) {
    const trimmed = metadata.description.slice(0, 800);
    parts.push(`- Description: ${trimmed}${metadata.description.length > 800 ? "…" : ""}`);
  }
  parts.push("");

  parts.push("MOST REPLAYED HEATMAP PEAKS");
  if (heatmapPeaks && heatmapPeaks.length > 0) {
    for (const peak of heatmapPeaks) {
      const pct = Math.round(peak.intensity * 100);
      parts.push(
        `- ${formatTime(peak.startSec)} (${peak.startSec.toFixed(0)}s) — intensity ${pct}/100`,
      );
    }
  } else {
    parts.push("- (not available for this video)");
  }
  parts.push("");

  parts.push("TIMESTAMPED TRANSCRIPT");
  if (annotatedTranscript) {
    parts.push(annotatedTranscript);
  } else {
    parts.push("(no transcript available — rely on heatmap and metadata only)");
  }
  parts.push("");

  parts.push(
    "Devuelve ahora el objeto JSON. No lo envuelvas en markdown ni añadas comentarios.",
  );
  return parts.join("\n");
}

function parseMomentsJson(raw: string, videoLength: number): ViralMoment[] {
  // Strip accidental code fences if Claude added them despite the instructions.
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }

  // Grab the first JSON object in case the model added any stray text.
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
      `Claude returned non-JSON output: ${(err as Error).message}\n${raw.slice(0, 400)}`,
    );
  }

  const list = (parsed as { moments?: unknown })?.moments;
  if (!Array.isArray(list)) {
    throw new Error("Claude response did not contain a 'moments' array.");
  }

  const result: ViralMoment[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const startSec = clampNumber(m.startSec, 0, videoLength || Infinity);
    const endSec = clampNumber(m.endSec, startSec + 1, videoLength || Infinity);
    if (Number.isNaN(startSec) || Number.isNaN(endSec) || endSec <= startSec) continue;

    result.push({
      startSec,
      endSec,
      title: String(m.title ?? "").slice(0, 80),
      description: String(m.description ?? ""),
      score: Math.max(0, Math.min(100, Number(m.score ?? 0))),
      reason: String(m.reason ?? ""),
      transcriptExcerpt: String(m.transcriptExcerpt ?? ""),
      signals: {
        heatmap: Boolean((m.signals as Record<string, unknown> | undefined)?.heatmap),
        transcript: Boolean(
          (m.signals as Record<string, unknown> | undefined)?.transcript,
        ),
        metadata: Boolean(
          (m.signals as Record<string, unknown> | undefined)?.metadata,
        ),
      },
    });
  }

  result.sort((a, b) => b.score - a.score);
  return result;
}

function clampNumber(value: unknown, min: number, max: number): number {
  const n = Number(value);
  if (Number.isNaN(n)) return NaN;
  return Math.max(min, Math.min(max, n));
}
