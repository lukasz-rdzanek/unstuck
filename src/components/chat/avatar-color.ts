/**
 * Stable HSL avatar color derived from a display name. Same input → same
 * color across sessions and rerenders. Uses a djb2-style hash for spread.
 */

const NEUTRAL = "hsl(220, 10%, 50%)";

export function avatarColor(displayName: string | null | undefined): string {
  if (!displayName) return NEUTRAL;

  let hash = 5381;
  for (let i = 0; i < displayName.length; i++) {
    hash = ((hash << 5) + hash + displayName.charCodeAt(i)) | 0; // hash*33 + c, force int32
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}
