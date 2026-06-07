import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit-only Vitest config for Stryker (testing-ci-stryker Phase 2).
//
// Stryker's vitest-runner needs a SINGLE top-level test config — NOT the
// `projects` array in vitest.config.ts — and it must NEVER boot the integration
// `globalSetup` (that starts Docker/Supabase per mutant: catastrophically slow
// and out of scope). So this config mirrors only the "unit" project: node env,
// the hermetic `src/**/*.test.ts` set, and the SAME resolve.alias block
// (`@/*` + the `cloudflare:workers` stub) so modules load cleanly under node.
//
// Keep this in sync with the "unit" project in vitest.config.ts. Drive mutation
// scope from the CLI (`stryker run --mutate "<path>"`), not from here.
const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  "cloudflare:workers": fileURLToPath(new URL("./src/test/stubs/cloudflare-workers.ts", import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  test: {
    name: "unit",
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["tests/integration/**"],
  },
});
