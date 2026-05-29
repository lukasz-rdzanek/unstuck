import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/client";
import type { Database } from "@/lib/db/database.types";

/**
 * Browser-side Supabase client for use inside React islands (chat panel,
 * realtime subscriptions). Built from @supabase/ssr's createBrowserClient
 * — NOT bare @supabase/supabase-js — because the SSR cookie session must
 * propagate into the Realtime WebSocket handshake. A bare client would
 * open the socket as the `anon` role and the
 * `to authenticated using (has_course_access(...))` SELECT policy on
 * `messages` would deliver zero events (REST fetch would still work via
 * cookies, hiding the breakage).
 *
 * Returns null when env vars are missing (dev without Supabase
 * configured). Named `createClientBrowser` (not `createBrowserClient`)
 * to avoid name-collision when both this module and `@supabase/ssr` are
 * imported in the same file.
 */
export function createClientBrowser() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    realtime: { params: { eventsPerSecond: 10 } },
  });
}
