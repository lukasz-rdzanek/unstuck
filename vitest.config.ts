import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Two Vitest projects (testing-access-control-rls Phase 1):
//   - "unit"        — pure domain logic, node env, hermetic. `npm run test` runs
//                     ONLY this project, so CI stays fast and needs no Docker.
//   - "integration" — RLS + SECURITY DEFINER functions against the LOCAL Supabase
//                     stack via the real GoTrue→PostgREST JWT path. `npm run
//                     test:integration` runs ONLY this project; a globalSetup
//                     fails fast if the stack is down.
//
// Both share the same resolve.alias: the `@/*` path alias and a stub for the
// `cloudflare:workers` virtual module (imported at top level by
// src/lib/embeddings.ts), so modules load cleanly under node.
//
// Tripwire for future authors: this config does NOT resolve Astro's `astro:env/*`
// virtual modules. Integration tests must NOT import src/lib/supabase.ts (it reads
// astro:env/client) — construct @supabase/supabase-js clients directly instead
// (see tests/integration/setup/clients.ts).
const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  "cloudflare:workers": fileURLToPath(new URL("./src/test/stubs/cloudflare-workers.ts", import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["tests/integration/**"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.itest.ts"],
          globalSetup: ["./tests/integration/setup/global-setup.ts"],
          // Real DB round-trips + admin-API user creation are slower than unit
          // tests; give hooks (fixture setup/teardown) generous headroom.
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
