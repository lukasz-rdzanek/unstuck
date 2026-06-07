import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { getSupabaseLocalEnv } from "./supabase-env";

// Three client tiers for integration tests. Clients are built directly from
// @supabase/supabase-js (NOT src/lib/supabase.ts, which reads astro:env and
// can't load under Vitest) and typed with the generated Database schema so the
// strict-type-checked lint passes without `any`.

export type DbClient = SupabaseClient<Database>;

const baseAuth = { persistSession: false, autoRefreshToken: false } as const;

/**
 * service_role client — bypasses RLS. Use for fixture setup/teardown ONLY,
 * never as the client under assertion (it would defeat the test).
 */
export function serviceClient(): DbClient {
  const env = getSupabaseLocalEnv();
  return createClient<Database>(env.url, env.serviceRoleKey, { auth: baseAuth });
}

/** anon client — unauthenticated, RLS applies as the `anon` role. */
export function anonClient(): DbClient {
  const env = getSupabaseLocalEnv();
  return createClient<Database>(env.url, env.anonKey, { auth: baseAuth });
}

/**
 * Authenticated client for a specific user via the real GoTrue password grant.
 * Every request carries the user's JWT, so PostgREST applies RLS as that user —
 * this is the path R1/R2/R4 must prove.
 */
export async function authedClientFor(email: string, password: string): Promise<DbClient> {
  const env = getSupabaseLocalEnv();
  const signInClient = createClient<Database>(env.url, env.anonKey, { auth: baseAuth });
  const { data, error } = await signInClient.auth.signInWithPassword({ email, password });
  if (error !== null) {
    throw new Error(`Failed to sign in test user ${email}: ${error.message}`);
  }
  // On success the discriminated result guarantees a non-null session.
  return createClient<Database>(env.url, env.anonKey, {
    auth: baseAuth,
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}
