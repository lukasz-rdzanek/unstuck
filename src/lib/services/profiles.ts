/**
 * Read-side helpers for profile-derived display fields.
 *
 * `profiles` rows are own-only by RLS for write (insert/update gated to
 * `auth.uid() = id`), but SELECT is broader so authored content (chat
 * messages, future comments) can display author display_names without
 * blowing up RLS. For our own-id lookups here, we still pass the
 * caller's userId explicitly — defensive against bugs that would query
 * the wrong row.
 */

import type { createClient } from "@/lib/supabase";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

// PGRST116: ".single()" found no rows — treated as a normal not-found, not
// a service error worth logging. Matches the convention in courses.ts.
const NOT_FOUND_CODE = "PGRST116";

/**
 * Resolve a display name for the given user. Falls back to the
 * email-local-part if the profile row has no display_name; falls back
 * to null if no email was provided. Use this on any page that needs
 * to show "who is signed in" — currently the lesson page (chat
 * attribution) and AppTopbar (username pill).
 *
 * Returns null on hard miss so callers can decide their own final
 * fallback ("Learner", "Guest", etc.) at the rendering site.
 */
export async function getDisplayNameOrFallback(
  supabase: SupabaseClient,
  userId: string,
  emailFallback: string | null,
): Promise<string | null> {
  const { data, error } = await supabase.from("profiles").select("display_name").eq("id", userId).single();
  if (error) {
    // Distinguish "no profile row" (expected — signup trigger races,
    // legacy accounts, etc.) from a real Supabase failure (network,
    // RLS denial, schema drift). Silent fallback for the former; log
    // the latter so it surfaces in Worker logs.
    if (error.code !== NOT_FOUND_CODE) {
      console.error("[profiles] getDisplayNameOrFallback failed:", error.message);
    }
    return emailFallback ? (emailFallback.split("@")[0] ?? null) : null;
  }
  // display_name is NOT NULL in schema (signup trigger seeds a default),
  // so generated types give it as `string` — no further fallback needed.
  return data.display_name;
}
