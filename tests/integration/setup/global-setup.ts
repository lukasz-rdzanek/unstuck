import { getSupabaseLocalEnv } from "./supabase-env";

// Vitest globalSetup for the `integration` project. Runs ONCE before the suite
// and fails fast with a readable message if the local Supabase stack is down,
// so a developer without Docker gets a clear instruction instead of a pile of
// connection timeouts. Mirrors the Playwright e2e prereq (npx supabase start).
export default async function setup(): Promise<void> {
  const env = getSupabaseLocalEnv(); // throws a readable error if the CLI/stack is down

  let res: Response;
  try {
    res = await fetch(`${env.url}/auth/v1/health`, { headers: { apikey: env.anonKey } });
  } catch {
    throw new Error(`Local Supabase not reachable at ${env.url} — run \`npx supabase start\`.`);
  }

  if (!res.ok) {
    throw new Error(`Local Supabase health check failed (${res.status}) — run \`npx supabase start\`.`);
  }
}
