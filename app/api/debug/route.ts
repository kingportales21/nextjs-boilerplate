/**
 * GET /api/debug?v=VIDEO_ID
 * Temporary diagnostic endpoint. Returns the raw InnerTube player response
 * so we can see exactly what YouTube sends back from this server environment.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("v");
  if (!videoId) {
    return NextResponse.json({ error: "Pass ?v=VIDEO_ID" }, { status: 400 });
  }

  const url = `https://www.youtube.com/youtubei/v1/player?prettyPrint=false`;

  let status = 0;
  let body: unknown = null;
  let fetchError: string | null = null;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-YouTube-Client-Name": "1",
        "X-YouTube-Client-Version": "2.20240801.00.00",
        Origin: "https://www.youtube.com",
        Referer: `https://www.youtube.com/watch?v=${videoId}`,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20240801.00.00",
            hl: "es",
            gl: "ES",
          },
        },
        videoId,
      }),
      cache: "no-store",
    });

    status = res.status;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 2000);
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    videoId,
    httpStatus: status,
    fetchError,
    // Only surface the fields we care about to keep the response readable
    hasVideoDetails: Boolean((body as Record<string, unknown>)?.videoDetails),
    title: (body as { videoDetails?: { title?: string } })?.videoDetails?.title ?? null,
    playabilityStatus: (body as { playabilityStatus?: unknown })?.playabilityStatus ?? null,
    // Full response truncated to first 3000 chars for inspection
    rawSnippet: JSON.stringify(body).slice(0, 3000),
  });
}
