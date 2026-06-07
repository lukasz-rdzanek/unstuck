import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Plain Vitest config (NOT astro's getViteConfig — that loads the Cloudflare
// vite plugin, which rejects Vitest's `resolve.external` and fails at startup).
// The unit suite is pure domain logic, so we only need the `@/*` path alias and
// a stub for the `cloudflare:workers` virtual module (imported at top level by
// src/lib/embeddings.ts) so those modules load cleanly under node.
//
// Tripwire for future authors: this config does NOT resolve Astro's `astro:env/*`
// virtual modules. To unit-test a module that imports them (e.g. src/lib/supabase.ts),
// add another alias stub here or switch that suite to astro's getViteConfig.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "cloudflare:workers": fileURLToPath(new URL("./src/test/stubs/cloudflare-workers.ts", import.meta.url)),
    },
  },
});
