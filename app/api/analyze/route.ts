/**
 * POST /api/analyze
 *
 * Input:  { url: string }
 * Output: { metadata, moments, model }
 *
 * Validates the YouTube URL, fetches lightweight metadata via oEmbed and
 * sends the YouTube URL to Gemini for direct video analysis. Gemini fetches
 * the video itself through Google's infrastructure (no scraping needed).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractVideoId, fetchVideoMetadata } from "@/app/lib/youtube";
import { analyzeViralMoments } from "@/app/lib/analyzer";

// Gemini video analysis can take a while on long videos. Force Node runtime
// and raise the duration budget so it isn't cut off mid-call.
export const runtime = "nodejs";
export const maxDuration = 300;

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
    const metadata = await fetchVideoMetadata(videoId);
    const analysis = await analyzeViralMoments(metadata);

    return NextResponse.json({
      metadata,
      moments: analysis.moments,
      model: analysis.model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/analyze] failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
