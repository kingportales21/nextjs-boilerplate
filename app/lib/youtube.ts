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

// Public web client version. YouTube doesn't require authentication for
// these endpoints — this is what the YouTube web app itself uses.
const WEB_CLIENT = {
  clientName: "WEB",
  clientVersion: "2.20240801.00.00",
  hl: "es",
  gl: "ES",
};

async function innertubePost(
  endpoint: "player" | "next",
  videoId: string,
): Promise<unknown> {
  const url = `${INNERTUBE_BASE}/${endpoint}?prettyPrint=false`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YouTube-Client-Name": "1",
      "X-YouTube-Client-Version": WEB_CLIENT.clientVersion,
      Origin: "https://www.youtube.com",
      Referer: `https://www.youtube.com/watch?v=${videoId}`,
    },
    body: JSON.stringify({
      context: { client: WEB_CLIENT },
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
 * `heatmap` is null when YouTube has not published Most Replayed data yet
 * (new or low-traffic videos).
 */
export async function fetchVideoData(videoId: string): Promise<VideoData> {
  // player → metadata; next → heatmap. Run both in parallel.
  const [playerData, nextData] = await Promise.all([
    innertubePost("player", videoId),
    innertubePost("next", videoId),
  ]);

  const metadata = buildMetadata(videoId, playerData);
  if (!metadata.title) {
    throw new Error(
      "Could not parse video metadata. The video may be private, age-restricted or unavailable.",
    );
  }

  // Heatmap can appear in either response depending on the YouTube variant.
  const raw =
    findHeatmapMarkers(nextData) ??
    findHeatmapMarkers(playerData) ??
    null;
  const heatmap = raw ? normalizeHeatmap(raw) : null;

  return { metadata, heatmap };
}
