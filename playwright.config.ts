import { defineConfig, devices } from "@playwright/test";

// E2E config (testing-baseline). Runs locally against `npm run dev` (Astro on
// workerd at :4321) with the local Supabase stack up (`npx supabase start`).
// Not wired into CI in this change — see context/foundation/certification.md.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4321",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:4321",
    reuseExistingServer: true,
    // dev opens a remote connection for the AI binding on boot — allow time.
    timeout: 120_000,
  },
});
