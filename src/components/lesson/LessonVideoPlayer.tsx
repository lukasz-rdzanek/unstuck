import { useEffect, useRef } from "react";
import type PlyrType from "plyr";
import "plyr/dist/plyr.css";
import { readCollapsed, setCollapsedAndBroadcast, onCollapsedChange } from "./aside-collapse";

interface Props {
  provider: "youtube" | "vimeo";
  videoId: string;
  title: string;
}

// Cinema-mode toggle icons (UNS-19). The button is injected into Plyr's control
// bar, whose DOM is imperative (not React), so these are raw SVG markup strings
// rather than lucide components. A custom screen-rectangle with horizontal
// arrows inside conveys "resize the stage on the X axis" — two phases:
//   WIDEN  (panel open): arrows point OUTWARD → "click to widen the video"
//   NARROW (panel hidden, wide): arrows point INWARD → "click to shrink back"
// This horizontal-resize metaphor is distinct from Plyr's fullscreen
// corner-arrows. 18px matches Plyr's --plyr-control-icon-size.
const ICON_ATTRS =
  'aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const WIDEN_SVG = `<svg ${ICON_ATTRS}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/></svg>`;
const NARROW_SVG = `<svg ${ICON_ATTRS}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m4 8 4 4-4 4"/><path d="m20 8-4 4 4 4"/></svg>`;

/** Paint the injected cinema-mode button to reflect the current collapsed state. */
function paintCinemaButton(btn: HTMLButtonElement | null, collapsed: boolean): void {
  if (!btn) return;
  btn.setAttribute(
    "aria-label",
    collapsed ? "Exit cinema mode (restore lesson panel)" : "Cinema mode (collapse lesson panel)",
  );
  btn.setAttribute("aria-pressed", collapsed ? "true" : "false");
  btn.innerHTML =
    (collapsed ? NARROW_SVG : WIDEN_SVG) +
    `<span class="plyr__tooltip" role="tooltip">${collapsed ? "Exit cinema mode" : "Cinema mode"}</span>`;
}

/**
 * Lesson video player (UNS-19). Wraps the YouTube/Vimeo embed in Plyr for a
 * unified, cosmic-themed control bar: play/pause, scrub, volume, playback
 * speed, captions (off by default), PiP, a cinema-mode toggle, and fullscreen.
 * No autoplay. Plyr's `storage` persists volume + speed + quality across
 * lessons. Quality switching is real on Vimeo; on YouTube the menu shows but
 * the IFrame API is auto-only (~2018+), so a selection biases rather than
 * forces the rendition.
 *
 * The cinema-mode button collapses the lesson aside (maximizing the video
 * stage) via the shared ./aside-collapse contract — it's injected into Plyr's
 * control bar just left of fullscreen, since Plyr's `controls` array only
 * accepts built-in control names.
 *
 * Plyr's JS touches `document` at import time, so it's loaded DYNAMICALLY inside
 * the effect — this island is server-rendered for `client:load` (no `document`
 * on the server), and a static top-level import would crash SSR. The player is
 * destroy()'d on unmount so instances don't leak across navigations.
 */
export default function LessonVideoPlayer({ provider, videoId, title }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cinemaBtnRef = useRef<HTMLButtonElement | null>(null);

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

      // Inject the cinema-mode button into the control bar once Plyr has built
      // its UI (for embeds the controls are created on `ready`). Placed just
      // left of fullscreen so it sits in the utility cluster, not floating.
      player.once("ready", () => {
        if (cancelled || !player) return;
        const controls = player.elements.controls;
        const fullscreenBtn = player.elements.buttons.fullscreen as HTMLElement | undefined;
        if (!controls) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "plyr__controls__item plyr__control unstuck-cinema-toggle";
        // Read storage (source of truth) on click so the handler never holds a
        // stale value; the broadcast repaints this button + syncs the aside.
        btn.addEventListener("click", () => {
          setCollapsedAndBroadcast(!readCollapsed());
        });
        cinemaBtnRef.current = btn;
        paintCinemaButton(btn, readCollapsed());

        if (fullscreenBtn?.parentNode === controls) {
          controls.insertBefore(btn, fullscreenBtn);
        } else {
          controls.appendChild(btn);
        }
      });
    });

    return () => {
      cancelled = true;
      // Explicitly remove the injected button (and its click listener) rather
      // than relying on Plyr's destroy() to GC the orphan.
      cinemaBtnRef.current?.remove();
      cinemaBtnRef.current = null;
      player?.destroy();
    };
  }, [provider, videoId]);

  // Repaint the cinema button when collapse is toggled from the aside's own
  // control (or from this button's own broadcast). The listener applies state
  // without re-broadcasting — echo-loop guard lives in ./aside-collapse.
  useEffect(
    () =>
      onCollapsedChange((c) => {
        paintCinemaButton(cinemaBtnRef.current, c);
      }),
    [],
  );

  return (
    <div
      // Cap the 16:9 stage so its height never exceeds the viewport when the
      // aside collapses and the column goes full-width. Width drives height in
      // a 16:9 box, so we bound max-width to the width that yields a height of
      // (100vh − chrome): W = H · 16/9. ~13rem ≈ topbar + page/lesson padding +
      // breadcrumb row. mx-auto centers the capped player in the wide column so
      // toggling the panel is jitter-free and never needs a scroll to see it.
      className="border-border bg-card/40 mx-auto mb-6 w-full max-w-[min(100%,calc((100vh-13rem)*16/9))] overflow-hidden rounded-2xl border backdrop-blur-xl"
      role="region"
      aria-label={title}
    >
      <div ref={hostRef} data-plyr-provider={provider} data-plyr-embed-id={videoId} />
    </div>
  );
}
