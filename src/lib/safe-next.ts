/**
 * Same-origin path guard for `?next=` redirects: accepts a single leading `/`
 * followed by neither `/` nor `\`. Rejecting `\` matters because browsers
 * normalize backslash → forward-slash in Location, so `/\evil.com` would
 * otherwise survive a `startsWith("//")` check and resolve to
 * `https://evil.com/`. See: `new URL("/\\evil.com", "https://x").origin`.
 *
 * Extracted from the signin route so the open-redirect invariant is unit-tested.
 */
export function isSafeNext(next: unknown): next is string {
  return typeof next === "string" && /^\/(?![/\\])/.test(next);
}
