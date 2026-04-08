/**
 * YouTube helpers: video ID parsing, metadata fetch, and Most Replayed
 * heatmap extraction.
 *
 * Uses the YouTube InnerTube API (the same internal API the web client uses)
 * instead of HTML scraping. HTML scraping is unreliable on cloud providers
 * like Vercel because YouTube blocks or redirects requests from datacenter
 * IPs. InnerTube POST requests work reliably from server environments.
 */

export type HeatmapMarker = {
  /** Start of the marker, in seconds. */
  startSec: number;
  /** Duration of the marker, in seconds. */
  durationSec: number;
  /** Intensity, normalized 0-1 (1 = the most replayed point of the video). */
  intensity: number;
};

export type VideoMetadata = {
  videoId: string;
  title: string;
  author: string;
  lengthSeconds: number;
  description: string;
  thumbnailUrl: string;
};

export type VideoData = {
  metadata: VideoMetadata;
  heatmap: HeatmapMarker[] | null;
};

// --------------------------------------------------------------------------
// Video ID parsing
// --------------------------------------------------------------------------

/**
 * Extract a YouTube video ID from any common URL form.
 * Returns null if the input is not a recognizable YouTube URL.
 */
export function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com"
    ) {
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }
      const shortsMatch = u.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shortsMatch) return shortsMatch[1];
      const embedMatch = u.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch) return embedMatch[1];
    }
    return null;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// InnerTube API
// --------------------------------------------------------------------------

const INNERTUBE_BASE = "https://www.youtube.com/youtubei/v1";

// We use the ANDROID client because the WEB client is blocked from datacenter
// IPs (Vercel, AWS, etc.) with a "LOGIN_REQUIRED / Inicia sesión para
// confirmar que no eres un bot" error since 2024. The mobile clients are
// treated more leniently and don't require a session for public videos.
//
// This is the same client used internally by the `youtube-transcript`
// library, which we know works from server environments.
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

// Fallback web client used only for fetching the heatmap from /next when
// ANDROID doesn't return one. WEB is more likely to expose Most Replayed.
const WEB_VERSION = "2.20240801.00.00";
const WEB_CLIENT = {
  clientName: "WEB",
  clientVersion: WEB_VERSION,
  hl: "es",
  gl: "ES",
};

type ClientContext = Record<string, unknown>;

async function innertubePost(
  endpoint: "player" | "next",
  videoId: string,
  client: ClientContext,
  userAgent: string,
): Promise<unknown> {
  const url = `${INNERTUBE_BASE}/${endpoint}?prettyPrint=false`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": userAgent,
    },
    body: JSON.stringify({
      context: { client },
      videoId,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `YouTube InnerTube /${endpoint} returned ${res.status} for video ${videoId}`,
    );
  }
  return res.json();
}

/** Returns true if the player response indicates the video can't be played. */
function isUnplayable(playerData: unknown): boolean {
  const status = (playerData as { playabilityStatus?: { status?: string } })
    ?.playabilityStatus?.status;
  if (!status) return false;
  return status !== "OK";
}

// --------------------------------------------------------------------------
// Heatmap helpers (shared between HTML and InnerTube paths)
// --------------------------------------------------------------------------

type RawMarker = {
  startMillis?: string | number;
  durationMillis?: string | number;
  intensityScoreNormalized?: number;
};

/**
 * Recursively walk an unknown JSON structure and collect the first array of
 * objects that look like heatmap markers. The exact path YouTube uses shifts
 * across API versions, so a resilient walk is more robust than hardcoded keys.
 */
function findHeatmapMarkers(node: unknown): RawMarker[] | null {
  if (!node || typeof node !== "object") return null;

  if (Array.isArray(node)) {
    if (
      node.length > 0 &&
      node.every(
        (m) =>
          m &&
          typeof m === "object" &&
          "intensityScoreNormalized" in (m as object) &&
          "startMillis" in (m as object),
      )
    ) {
      return node as RawMarker[];
    }
    for (const item of node) {
      const found = findHeatmapMarkers(item);
      if (found) return found;
    }
    return null;
  }

  for (const value of Object.values(node as Record<string, unknown>)) {
    const found = findHeatmapMarkers(value);
    if (found) return found;
  }
  return null;
}

function normalizeHeatmap(raw: RawMarker[]): HeatmapMarker[] {
  return raw
    .map((m) => {
      const start = Number(m.startMillis ?? 0) / 1000;
      const duration = Number(m.durationMillis ?? 0) / 1000;
      const intensity =
        typeof m.intensityScoreNormalized === "number"
          ? m.intensityScoreNormalized
          : 0;
      return { startSec: start, durationSec: duration, intensity };
    })
    .filter((m) => m.durationSec > 0);
}

/**
 * Reduce a noisy heatmap into a small set of distinct peaks.
 * YouTube returns ~100 evenly-spaced markers; we extract local maxima so
 * the LLM prompt focuses on real hotspots.
 */
export function topHeatmapPeaks(
  heatmap: HeatmapMarker[],
  count = 8,
): HeatmapMarker[] {
  if (heatmap.length === 0) return [];
  const peaks: HeatmapMarker[] = [];
  for (let i = 0; i < heatmap.length; i++) {
    const prev = heatmap[i - 1]?.intensity ?? -Infinity;
    const next = heatmap[i + 1]?.intensity ?? -Infinity;
    if (heatmap[i].intensity >= prev && heatmap[i].intensity >= next) {
      peaks.push(heatmap[i]);
    }
  }
  const sorted = peaks.length > 0 ? peaks : [...heatmap];
  sorted.sort((a, b) => b.intensity - a.intensity);
  return sorted.slice(0, count).sort((a, b) => a.startSec - b.startSec);
}

// --------------------------------------------------------------------------
// Metadata builder
// --------------------------------------------------------------------------

type RawVideoDetails = {
  videoId?: string;
  title?: string;
  author?: string;
  lengthSeconds?: string;
  shortDescription?: string;
  thumbnail?: { thumbnails?: Array<{ url?: string; width?: number }> };
};

function buildMetadata(
  videoId: string,
  playerData: unknown,
): VideoMetadata {
  const details = (
    playerData as { videoDetails?: RawVideoDetails } | null
  )?.videoDetails;

  const thumbs = details?.thumbnail?.thumbnails ?? [];
  const best = thumbs.reduce<{ url: string; width: number } | null>(
    (acc, t) => {
      if (!t?.url) return acc;
      const width = t.width ?? 0;
      if (!acc || width > acc.width) return { url: t.url, width };
      return acc;
    },
    null,
  );

  return {
    videoId,
    title: details?.title ?? "",
    author: details?.author ?? "",
    lengthSeconds: Number(details?.lengthSeconds ?? 0),
    description: details?.shortDescription ?? "",
    thumbnailUrl:
      best?.url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

// --------------------------------------------------------------------------
// Public entry point
// --------------------------------------------------------------------------

/**
 * Fetch metadata + heatmap for a video via the InnerTube API.
 *
 * Strategy:
 *   - Use the ANDROID client for `/player` (metadata). The WEB client is
 *     blocked from datacenter IPs, but ANDROID still works without auth.
 *   - Try `/next` with ANDROID for the heatmap. If ANDROID doesn't return
 *     one (it usually doesn't — Most Replayed is a desktop feature), fall
 *     back to the WEB client. WEB may return LOGIN_REQUIRED, in which case
 *     we just return null heatmap and let the analyzer work without it.
 */
export async function fetchVideoData(videoId: string): Promise<VideoData> {
  const playerData = await innertubePost(
    "player",
    videoId,
    ANDROID_CLIENT,
    ANDROID_USER_AGENT,
  );

  if (isUnplayable(playerData)) {
    const status = (playerData as { playabilityStatus?: { status?: string; reason?: string } })
      ?.playabilityStatus;
    throw new Error(
      `YouTube refused to serve this video (${status?.status ?? "UNKNOWN"})${
        status?.reason ? `: ${status.reason}` : ""
      }`,
    );
  }

  const metadata = buildMetadata(videoId, playerData);
  if (!metadata.title) {
    throw new Error(
      "Could not parse video metadata. The video may be private, age-restricted or unavailable.",
    );
  }

  // Try to get the heatmap. ANDROID rarely includes it, so we try the WEB
  // client too. Both calls are best-effort: the analyzer still works without
  // the heatmap (just less precise).
  const heatmap = await fetchHeatmap(videoId);

  return { metadata, heatmap };
}

async function fetchHeatmap(videoId: string): Promise<HeatmapMarker[] | null> {
  // First try ANDROID (most reliable, but rarely returns heatmap data).
  try {
    const androidNext = await innertubePost(
      "next",
      videoId,
      ANDROID_CLIENT,
      ANDROID_USER_AGENT,
    );
    const raw = findHeatmapMarkers(androidNext);
    if (raw) return normalizeHeatmap(raw);
  } catch {
    // ignore — fall through to WEB
  }

  // Fall back to WEB client (more likely to include heatmap, but may be
  // blocked from datacenter IPs with LOGIN_REQUIRED).
  try {
    const webNext = await innertubePost(
      "next",
      videoId,
      WEB_CLIENT,
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    );
    const raw = findHeatmapMarkers(webNext);
    if (raw) return normalizeHeatmap(raw);
  } catch {
    // ignore — analyzer works without heatmap
  }

  return null;
}
