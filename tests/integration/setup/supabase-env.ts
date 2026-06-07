import { execFileSync } from "node:child_process";

// Discovers the LOCAL Supabase stack's URL + keys at runtime from
// `npx supabase status -o json`, so nothing secret is committed and the harness
// is zero-config when the stack is up. The service_role key is used ONLY for
// fixture setup/teardown (it bypasses RLS); the anon key drives the real,
// RLS-gated assertion path. See tests/integration/setup/clients.ts.

export interface SupabaseLocalEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

let cached: SupabaseLocalEnv | null = null;

export function getSupabaseLocalEnv(): SupabaseLocalEnv {
  if (cached !== null) {
    return cached;
  }

  let raw: string;
  try {
    raw = execFileSync("npx", ["supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error("Local Supabase not running — run `npx supabase start` (integration tests need it).");
  }

  // `supabase status` may print non-JSON notice lines around the object (CLI
  // upgrade notices, "Stopped services: …"); slice from the first `{` to the
  // last `}` to parse robustly.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Could not parse `supabase status -o json` output — is the stack up?");
  }

  const parsed = JSON.parse(raw.slice(start, end + 1)) as {
    API_URL?: string;
    ANON_KEY?: string;
    SERVICE_ROLE_KEY?: string;
  };

  if (
    typeof parsed.API_URL !== "string" ||
    typeof parsed.ANON_KEY !== "string" ||
    typeof parsed.SERVICE_ROLE_KEY !== "string"
  ) {
    throw new Error("`supabase status` JSON missing API_URL / ANON_KEY / SERVICE_ROLE_KEY.");
  }

  cached = { url: parsed.API_URL, anonKey: parsed.ANON_KEY, serviceRoleKey: parsed.SERVICE_ROLE_KEY };
  return cached;
}
