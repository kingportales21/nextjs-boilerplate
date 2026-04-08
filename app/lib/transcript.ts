/**
 * Transcript helpers. Wraps the `youtube-transcript` package with a small
 * normalization layer so the rest of the code only deals with seconds and
 * plain strings.
 *
 * Note: `offset` from the library is already in seconds for v1.3.x, but the
 * field was historically milliseconds in older releases. We detect the unit
 * by comparing the first offset against the video length to stay robust.
 */

import { YoutubeTranscript } from "youtube-transcript";

export type TranscriptSegment = {
  /** Start offset in seconds. */
  start: number;
  /** Duration in seconds. */
  duration: number;
  text: string;
};

export type TranscriptResult = {
  segments: TranscriptSegment[];
  /** Concatenated plain text (useful for prompt preview). */
  fullText: string;
  lang: string | null;
};

/**
 * Fetch the transcript for a video. Tries English first, then falls back to
 * any language available. Returns null if the video has no captions at all.
 */
export async function fetchVideoTranscript(
  videoId: string,
  lengthSeconds: number,
): Promise<TranscriptResult | null> {
  // Carwow España publishes in Spanish, so prefer Spanish tracks. Fall back
  // to English (the main Carwow UK channel) and finally any available track.
  const rawSegments =
    (await tryFetch(videoId, "es")) ??
    (await tryFetch(videoId, "es-ES")) ??
    (await tryFetch(videoId, "en")) ??
    (await tryFetch(videoId));
  if (!rawSegments || rawSegments.length === 0) return null;

  // The library sometimes returns offset in ms and sometimes in seconds.
  // If the maximum offset blows past the video length in seconds, we treat
  // the values as milliseconds.
  const maxOffset = Math.max(...rawSegments.map((s) => s.offset ?? 0));
  const looksLikeMs = lengthSeconds > 0 && maxOffset > lengthSeconds * 2;
  const scale = looksLikeMs ? 1 / 1000 : 1;

  const segments: TranscriptSegment[] = rawSegments.map((s) => ({
    start: (s.offset ?? 0) * scale,
    duration: (s.duration ?? 0) * scale,
    text: decodeBasicEntities(s.text ?? "").trim(),
  }));

  return {
    segments,
    fullText: segments.map((s) => s.text).join(" "),
    lang: rawSegments[0]?.lang ?? null,
  };
}

type RawSegment = { text?: string; duration?: number; offset?: number; lang?: string };

async function tryFetch(videoId: string, lang?: string): Promise<RawSegment[] | null> {
  try {
    const result = await YoutubeTranscript.fetchTranscript(
      videoId,
      lang ? { lang } : undefined,
    );
    return result as RawSegment[];
  } catch {
    return null;
  }
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&amp;#39;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n/g, " ");
}

/**
 * Build a compact, timestamp-annotated transcript suitable for feeding to an
 * LLM. Groups every ~15 seconds into a single line with a leading timestamp
 * to keep the token count low while preserving alignment with video time.
 */
export function buildAnnotatedTranscript(
  segments: TranscriptSegment[],
  windowSec = 15,
): string {
  if (segments.length === 0) return "";
  const lines: string[] = [];
  let bucketStart = Math.floor(segments[0].start / windowSec) * windowSec;
  let bucketText: string[] = [];

  const flush = () => {
    if (bucketText.length > 0) {
      lines.push(`[${formatTime(bucketStart)}] ${bucketText.join(" ").trim()}`);
    }
  };

  for (const seg of segments) {
    const segBucket = Math.floor(seg.start / windowSec) * windowSec;
    if (segBucket !== bucketStart) {
      flush();
      bucketStart = segBucket;
      bucketText = [];
    }
    if (seg.text) bucketText.push(seg.text);
  }
  flush();
  return lines.join("\n");
}

export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
