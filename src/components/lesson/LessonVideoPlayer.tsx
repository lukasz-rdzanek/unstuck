import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import type PlyrType from "plyr";
import "plyr/dist/plyr.css";
import { readCollapsed, setCollapsedAndBroadcast, onCollapsedChange } from "./aside-collapse";

interface Props {
  provider: "youtube" | "vimeo";
  videoId: string;
  title: string;
}

/**
 * Lesson video player (UNS-19). Wraps the YouTube/Vimeo embed in Plyr for a
 * unified, cosmic-themed control bar: play/pause, scrub, volume, playback
 * speed, captions (off by default), PiP, fullscreen. No autoplay. Plyr's
 * `storage` persists volume + speed + quality across lessons. Quality switching
 * is real on Vimeo; on YouTube the menu shows but the IFrame API is auto-only
 * (~2018+), so a selection biases rather than forces the rendition.
 *
 * Plyr's JS touches `document` at import time, so it's loaded DYNAMICALLY inside
 * the effect — this island is server-rendered for `client:load` (no `document`
 * on the server), and a static top-level import would crash SSR. The player is
 * destroy()'d on unmount so instances don't leak across navigations.
 */
export default function LessonVideoPlayer({ provider, videoId, title }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  // Expand button ↔ lesson aside (UNS-19 P3). `collapsed` mirrors the shared
  // aside state: true → aside collapsed, video stage maximized. Initial value
  // from the shared localStorage key; kept in sync with aside-initiated toggles
  // via the broadcast listener (which never re-broadcasts → no echo loop).
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed());
  useEffect(() => onCollapsedChange(setCollapsed), []);

  const toggleExpand = () => {
    const next = !collapsed;
    setCollapsed(next);
    setCollapsedAndBroadcast(next); // persist + notify the aside
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let player: PlyrType | null = null;
    let cancelled = false;

    void import("plyr").then(({ default: Plyr }) => {
      if (cancelled || !host.isConnected) return;
      player = new Plyr(host, {
        ratio: "16:9",
        autoplay: false,
        controls: [
          "play-large",
          "play",
          "progress",
          "current-time",
          "mute",
          "volume",
          "captions",
          "settings",
          "pip",
          "fullscreen",
        ],
        // Quality works on Vimeo; on YouTube the menu shows but the API is
        // auto-only (~2018+), so selection biases rather than forces.
        settings: ["quality", "speed", "captions"],
        quality: { default: 720, options: [2160, 1440, 1080, 720, 480, 360, 240] },
        speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] },
        captions: { active: false, update: true },
        storage: { enabled: true, key: "plyr" }, // persists volume + speed + quality
        // Minimize YouTube's embed chrome (title/related/annotations). YT does
        // not allow embeds to fully remove its branding or end-screen cards.
        youtube: { noCookie: true, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3 },
        tooltips: { controls: true },
      });
    });

    return () => {
      cancelled = true;
      player?.destroy();
    };
  }, [provider, videoId]);

  return (
    <div
      // Cap the 16:9 stage so its height never exceeds the viewport when the
      // aside collapses and the column goes full-width. Width drives height in
      // a 16:9 box, so we bound max-width to the width that yields a height of
      // (100vh − chrome): W = H · 16/9. ~13rem ≈ topbar + page/lesson padding +
      // breadcrumb row. mx-auto centers the capped player in the wide column so
      // toggling the panel is jitter-free and never needs a scroll to see it.
      className="border-border bg-card/40 relative mx-auto mb-6 w-full max-w-[min(100%,calc((100vh-13rem)*16/9))] overflow-hidden rounded-2xl border backdrop-blur-xl"
      role="region"
      aria-label={title}
    >
      <div ref={hostRef} data-plyr-provider={provider} data-plyr-embed-id={videoId} />
      {/* Expand/Restore — desktop only (the aside-collapse grid rule is lg+).
          Top-left so it never overlaps Plyr's bottom-right control cluster.
          z-10 sits above the embed; Plyr's own UI manages its own stacking. */}
      <button
        type="button"
        onClick={toggleExpand}
        aria-label={collapsed ? "Restore lesson panel" : "Expand video — collapse lesson panel"}
        title={collapsed ? "Restore panel" : "Expand video"}
        className="bg-card/60 border-border text-foreground/90 hover:bg-card/90 absolute top-3 left-3 z-10 hidden size-9 items-center justify-center rounded-xl border backdrop-blur-xl transition-colors lg:inline-flex"
      >
        {collapsed ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </button>
    </div>
  );
}
