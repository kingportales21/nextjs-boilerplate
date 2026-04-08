/**
 * POST /api/analyze
 *
 * Input:  { url: string }
 * Output: { metadata, heatmap, moments, usedHeatmap, usedTranscript, model }
 *
 * Runs the full hybrid pipeline: metadata + Most Replayed heatmap + transcript
 * + Claude analysis. Returns the ranked viral moments for the given YouTube
 * video.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractVideoId, fetchVideoData, topHeatmapPeaks } from "@/app/lib/youtube";
import { buildAnnotatedTranscript, fetchVideoTranscript } from "@/app/lib/transcript";
import { analyzeViralMoments } from "@/app/lib/claude";

// The YouTube fetch + Claude call can easily go past the default 10s edge
// runtime limit, so force Node.js and raise the timeout budget.
export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({
  url: z.string().min(1, "url is required"),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const videoId = extractVideoId(parsed.data.url);
  if (!videoId) {
    return NextResponse.json(
      { error: "Could not extract a YouTube video ID from that URL." },
      { status: 400 },
    );
  }

  try {
    // Fetch YouTube metadata + heatmap and the transcript in parallel.
    const [videoData, transcript] = await Promise.all([
      fetchVideoData(videoId),
      // The transcript fetcher needs the length for unit detection, but we
      // don't have it yet — pass 0 and it will assume seconds. We'll rerun
      // the heuristic once metadata is available below.
      fetchVideoTranscript(videoId, 0),
    ]);

    // Now that we have the real length, re-evaluate whether the transcript
    // offsets look like milliseconds and rescale if needed.
    const rescaled = transcript
      ? rescaleIfNeeded(transcript, videoData.metadata.lengthSeconds)
      : null;

    const heatmapPeaks = videoData.heatmap
      ? topHeatmapPeaks(videoData.heatmap, 8)
      : null;

    const annotatedTranscript = rescaled
      ? buildAnnotatedTranscript(rescaled.segments, 15)
      : null;

    if (!heatmapPeaks && !annotatedTranscript) {
      return NextResponse.json(
        {
          error:
            "This video has no Most Replayed data and no transcript — there's nothing to analyze.",
        },
        { status: 422 },
      );
    }

    const analysis = await analyzeViralMoments({
      metadata: videoData.metadata,
      heatmapPeaks,
      annotatedTranscript,
    });

    return NextResponse.json({
      metadata: videoData.metadata,
      heatmap: videoData.heatmap,
      heatmapPeaks,
      transcriptAvailable: Boolean(annotatedTranscript),
      moments: analysis.moments,
      usedHeatmap: analysis.usedHeatmap,
      usedTranscript: analysis.usedTranscript,
      model: analysis.model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/analyze] failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type TranscriptLike = {
  segments: { start: number; duration: number; text: string }[];
  fullText: string;
  lang: string | null;
};

/**
 * Second-pass rescale: if the transcript offsets clearly exceed the real
 * video length, the library gave us milliseconds. Divide by 1000.
 */
function rescaleIfNeeded(transcript: TranscriptLike, lengthSec: number): TranscriptLike {
  if (lengthSec <= 0 || transcript.segments.length === 0) return transcript;
  const maxStart = transcript.segments[transcript.segments.length - 1].start;
  if (maxStart > lengthSec * 2) {
    return {
      ...transcript,
      segments: transcript.segments.map((s) => ({
        ...s,
        start: s.start / 1000,
        duration: s.duration / 1000,
      })),
    };
  }
  return transcript;
}
