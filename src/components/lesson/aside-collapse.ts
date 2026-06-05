/**
 * Cross-island contract for the lesson aside-collapse state (UNS-19 Phase 3).
 *
 * Two islands share this state: `LessonAside` owns the collapse toggle UI, and
 * `LessonVideoPlayer`'s Expand button drives the same state to maximize the
 * video stage. They stay in sync via a shared localStorage key (source of truth
 * for each island's initial mount) plus a window `CustomEvent` broadcast.
 *
 * Echo-loop guard: `setCollapsedAndBroadcast` is the only writer that emits the
 * event; `onCollapsedChange` listeners apply the incoming value to their local
 * React state WITHOUT re-broadcasting. So a player-initiated toggle updates the
 * aside (and vice-versa) exactly once, never ping-ponging.
 *
 * All localStorage access is try/catch-wrapped — Safari private mode throws.
 */

export const COLLAPSED_STORAGE_KEY = "unstuck.lesson-aside.collapsed";
export const ASIDE_COLLAPSED_EVENT = "unstuck:aside-collapsed";

export interface AsideCollapsedDetail {
  collapsed: boolean;
}

export function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? "true" : "false");
  } catch {
    // Quota exceeded or private mode — silently swallow.
  }
}

/**
 * Persist the collapse value and broadcast it to the other island. The ONLY
 * function that dispatches the event — keeps the echo-loop guard simple.
 */
export function setCollapsedAndBroadcast(collapsed: boolean): void {
  writeCollapsed(collapsed);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AsideCollapsedDetail>(ASIDE_COLLAPSED_EVENT, { detail: { collapsed } }));
}

/**
 * Subscribe to collapse changes broadcast by the other island. The handler
 * must NOT re-broadcast (apply to local state only). Returns an unsubscribe.
 */
export function onCollapsedChange(handler: (collapsed: boolean) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  // We own the only dispatcher (setCollapsedAndBroadcast), so detail is always
  // a well-formed AsideCollapsedDetail — no runtime shape guard needed.
  const listener = (e: Event) => {
    handler((e as CustomEvent<AsideCollapsedDetail>).detail.collapsed);
  };
  window.addEventListener(ASIDE_COLLAPSED_EVENT, listener);
  return () => {
    window.removeEventListener(ASIDE_COLLAPSED_EVENT, listener);
  };
}
