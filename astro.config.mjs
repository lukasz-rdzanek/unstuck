// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare(),
  env: {
    schema: {
      // Supabase URL + anon key are exposed to both server (SSR client) and
      // client (Realtime WebSocket). The anon key is gated by RLS, which is
      // the standard Supabase pattern. `context: "client"` makes them
      // accessible from astro:env/client AND astro:env/server.
      SUPABASE_URL: envField.string({ context: "client", access: "public", optional: true }),
      SUPABASE_KEY: envField.string({ context: "client", access: "public", optional: true }),
    },
  },
});
