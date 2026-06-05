/**
 * Convert a lesson's `video_url` (a natural watch URL pasted by the
 * operator) into an iframe-ready embed URL plus the bare provider video
 * `id`. Supports YouTube and Vimeo; anything else returns
 * `{ embedSrc: null, provider: "unknown", id: null }` so the lesson page
 * can render a fallback block.
 *
 * `embedSrc` powers the plain-iframe fallback; `id` + `provider` drive the
 * Plyr player (which takes provider + id, not an embed URL).
 */

export interface VideoEmbed {
  embedSrc: string | null;
  provider: "youtube" | "vimeo" | "unknown";
  id: string | null;
}

const UNKNOWN: VideoEmbed = { embedSrc: null, provider: "unknown", id: null };

export function parseVideoUrl(url: string): VideoEmbed {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return UNKNOWN;
  }

  const host = parsed.hostname.replace(/^www\./, "");

  // YouTube watch: youtube.com/watch?v=ID(&t=…)
  if (host === "youtube.com" || host === "m.youtube.com") {
    if (parsed.pathname === "/watch") {
      const id = parsed.searchParams.get("v");
      if (id) return { embedSrc: `https://www.youtube.com/embed/${id}`, provider: "youtube", id };
    }
    // Already-embed: youtube.com/embed/ID
    if (parsed.pathname.startsWith("/embed/")) {
      const id = parsed.pathname.slice("/embed/".length).split("/")[0];
      if (id) return { embedSrc: `https://www.youtube.com${parsed.pathname}`, provider: "youtube", id };
    }
  }

  // YouTube short URL: youtu.be/ID
  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1).split("/")[0];
    if (id) return { embedSrc: `https://www.youtube.com/embed/${id}`, provider: "youtube", id };
  }

  // Vimeo watch: vimeo.com/<numeric-id>
  if (host === "vimeo.com") {
    const id = parsed.pathname.slice(1).split("/")[0];
    if (id && /^\d+$/.test(id)) {
      return { embedSrc: `https://player.vimeo.com/video/${id}`, provider: "vimeo", id };
    }
  }

  // Vimeo player: player.vimeo.com/video/ID — pass through
  if (host === "player.vimeo.com" && parsed.pathname.startsWith("/video/")) {
    const id = parsed.pathname.slice("/video/".length).split("/")[0];
    if (id) return { embedSrc: `https://player.vimeo.com${parsed.pathname}`, provider: "vimeo", id };
  }

  return UNKNOWN;
}
