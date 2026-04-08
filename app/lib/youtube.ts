/**
 * YouTube helpers: video ID parsing, metadata fetch, and Most Replayed
 * (heatmap) extraction by scraping the watch page.
 *
 * YouTube's "Most Replayed" heatmap is not exposed through the public Data
 * API, so we fetch the watch HTML and walk the embedded `ytInitialData`
 * structure to reach the heatmap markers.
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

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
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

/** Browser-like headers so YouTube returns the full HTML with initial data. */
const BROWSER_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  // CONSENT cookie bypasses the EU consent wall that otherwise blocks the
  // watch page from rendering the initial data payload.
  Cookie: "CONSENT=YES+cb; SOCS=CAI",
};

/** Fetch the raw watch page HTML. */
async function fetchWatchHtml(videoId: string): Promise<string> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: BROWSER_HEADERS,
    // Don't cache - we want fresh heatmap data.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`YouTube responded with ${res.status} for video ${videoId}`);
  }
  return res.text();
}

/**
 * Pull a balanced JSON object out of a larger string, starting from the
 * first `{` after `startIdx`. Needed because the YouTube HTML embeds the
 * initial data as a raw JS object literal we can't split with a simple regex.
 */
function extractJsonObject(source: string, startIdx: number): string | null {
  const first = source.indexOf("{", startIdx);
  if (first === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = first; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(first, i + 1);
    }
  }
  return null;
}

/** Pull both ytInitialData and ytInitialPlayerResponse out of the HTML. */
type InitialPayloads = {
  initialData: unknown | null;
  playerResponse: unknown | null;
};

function extractInitialPayloads(html: string): InitialPayloads {
  const out: InitialPayloads = { initialData: null, playerResponse: null };

  const dataMarker = html.indexOf("ytInitialData");
  if (dataMarker !== -1) {
    const raw = extractJsonObject(html, dataMarker);
    if (raw) {
      try {
        out.initialData = JSON.parse(raw);
      } catch {
        // Some pages include trailing JS we can't recover from — swallow.
      }
    }
  }

  const playerMarker = html.indexOf("ytInitialPlayerResponse");
  if (playerMarker !== -1) {
    const raw = extractJsonObject(html, playerMarker);
    if (raw) {
      try {
        out.playerResponse = JSON.parse(raw);
      } catch {
        // ignore — we still try initialData.
      }
    }
  }

  return out;
}

/**
 * Recursively walk an unknown JSON structure and collect the first array
 * of objects that look like heatmap markers. The exact path YouTube uses
 * changes over time, so a resilient walk beats hardcoding keys.
 */
type RawMarker = {
  startMillis?: string | number;
  durationMillis?: string | number;
  intensityScoreNormalized?: number;
};

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
        typeof m.intensityScoreNormalized === "number" ? m.intensityScoreNormalized : 0;
      return { startSec: start, durationSec: duration, intensity };
    })
    .filter((m) => m.durationSec > 0);
}

/**
 * Reduce a noisy heatmap into a small set of distinct peaks.
 *
 * YouTube returns ~100 evenly-spaced markers; we want the local maxima so
 * that downstream prompts to the LLM stay focused on real hotspots instead
 * of the whole curve.
 */
export function topHeatmapPeaks(heatmap: HeatmapMarker[], count = 8): HeatmapMarker[] {
  if (heatmap.length === 0) return [];
  // Find local maxima (markers where both neighbors have lower intensity).
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

type RawPlayerResponse = {
  videoDetails?: {
    videoId?: string;
    title?: string;
    author?: string;
    lengthSeconds?: string;
    shortDescription?: string;
    thumbnail?: { thumbnails?: Array<{ url?: string; width?: number }> };
  };
};

function buildMetadata(videoId: string, playerResponse: unknown): VideoMetadata {
  const details = (playerResponse as RawPlayerResponse | null)?.videoDetails;
  const thumbs = details?.thumbnail?.thumbnails ?? [];
  const best = thumbs.reduce<{ url: string; width: number } | null>((acc, t) => {
    if (!t?.url) return acc;
    const width = t.width ?? 0;
    if (!acc || width > acc.width) return { url: t.url, width };
    return acc;
  }, null);

  return {
    videoId,
    title: details?.title ?? "",
    author: details?.author ?? "",
    lengthSeconds: Number(details?.lengthSeconds ?? 0),
    description: details?.shortDescription ?? "",
    thumbnailUrl: best?.url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

/**
 * Fetch metadata + heatmap for a video. `heatmap` is null when YouTube has
 * not published Most Replayed data yet (new or low-traffic videos).
 */
export async function fetchVideoData(videoId: string): Promise<VideoData> {
  const html = await fetchWatchHtml(videoId);
  const { initialData, playerResponse } = extractInitialPayloads(html);

  const metadata = buildMetadata(videoId, playerResponse);
  if (!metadata.title) {
    throw new Error(
      "Could not parse video metadata. The video may be private, age-restricted or unavailable.",
    );
  }

  // Heatmap can live in either payload depending on the page variant.
  const raw =
    findHeatmapMarkers(initialData) ?? findHeatmapMarkers(playerResponse) ?? null;
  const heatmap = raw ? normalizeHeatmap(raw) : null;

  return { metadata, heatmap };
}
