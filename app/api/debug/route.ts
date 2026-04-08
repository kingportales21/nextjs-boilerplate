/**
 * GET /api/debug?v=VIDEO_ID
 * Diagnostic endpoint. Tries the InnerTube /player endpoint with both the
 * ANDROID and WEB clients and reports what each returns.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const PLAYER_URL =
  "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";

const ANDROID_VERSION = "20.10.38";
const ANDROID_CLIENT = {
  clientName: "ANDROID",
  clientVersion: ANDROID_VERSION,
  androidSdkVersion: 34,
  hl: "es",
  gl: "ES",
  userAgent: `com.google.android.youtube/${ANDROID_VERSION} (Linux; U; Android 14) gzip`,
};
const ANDROID_USER_AGENT = `com.google.android.youtube/${ANDROID_VERSION} (Linux; U; Android 14)`;

const WEB_CLIENT = {
  clientName: "WEB",
  clientVersion: "2.20240801.00.00",
  hl: "es",
  gl: "ES",
};

async function probe(
  videoId: string,
  clientName: string,
  clientCtx: Record<string, unknown>,
  userAgent: string,
) {
  let status = 0;
  let body: unknown = null;
  let fetchError: string | null = null;

  try {
    const res = await fetch(PLAYER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": userAgent,
      },
      body: JSON.stringify({ context: { client: clientCtx }, videoId }),
      cache: "no-store",
    });
    status = res.status;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 500);
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  const playability = (body as { playabilityStatus?: unknown })
    ?.playabilityStatus;
  const title = (body as { videoDetails?: { title?: string } })?.videoDetails
    ?.title;

  return {
    client: clientName,
    httpStatus: status,
    fetchError,
    title: title ?? null,
    playabilityStatus: playability ?? null,
  };
}

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("v");
  if (!videoId) {
    return NextResponse.json({ error: "Pass ?v=VIDEO_ID" }, { status: 400 });
  }

  const [android, web] = await Promise.all([
    probe(videoId, "ANDROID", ANDROID_CLIENT, ANDROID_USER_AGENT),
    probe(videoId, "WEB", WEB_CLIENT, "Mozilla/5.0"),
  ]);

  return NextResponse.json({ videoId, results: [android, web] });
}
