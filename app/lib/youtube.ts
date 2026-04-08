/**
 * YouTube helpers: video ID parsing and lightweight metadata via oEmbed.
 *
 * We don't scrape the YouTube watch page or call the InnerTube API directly
 * any more — both are blocked from Vercel datacenter IPs since 2024 with a
 * "LOGIN_REQUIRED / Inicia sesión para confirmar que no eres un bot" wall.
 *
 * Instead:
 *   - Metadata (title, channel, thumbnail) comes from the public oEmbed
 *     endpoint, which is meant for embedders and works without auth.
 *   - The actual video content is analyzed by Gemini, which fetches the
 *     YouTube URL directly through Google's own infrastructure (see
 *     analyzer.ts). That includes audio, video frames and any captions.
 */

export type VideoMetadata = {
  videoId: string;
  videoUrl: string;
  title: string;
  author: string;
  thumbnailUrl: string;
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

/** Build the canonical watch URL from a video ID. */
export function buildWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Fetch lightweight metadata via the public oEmbed endpoint.
 * This endpoint is meant for sites embedding YouTube videos and is not
 * subject to the same bot-detection wall as the watch page.
 *
 * Falls back to a minimal metadata object built from the video ID alone if
 * oEmbed itself becomes unreachable, so the analyzer always has something
 * to work with.
 */
export async function fetchVideoMetadata(videoId: string): Promise<VideoMetadata> {
  const fallback: VideoMetadata = {
    videoId,
    videoUrl: buildWatchUrl(videoId),
    title: "",
    author: "",
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };

  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      buildWatchUrl(videoId),
    )}&format=json`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    return {
      videoId,
      videoUrl: buildWatchUrl(videoId),
      title: data.title ?? "",
      author: data.author_name ?? "",
      thumbnailUrl: data.thumbnail_url ?? fallback.thumbnailUrl,
    };
  } catch {
    return fallback;
  }
}
