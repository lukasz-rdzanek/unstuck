import { test as setup } from "@playwright/test";

// Auth setup project (testing-e2e). Logs the local learner in ONCE through the
// real signin form and saves the cookie session to playwright/.auth/user.json,
// so feature specs start authenticated via `storageState` instead of driving
// the login UI in every test (which wastes time and couples them to the signin
// page). The signin + auth-gating flows are the only specs that touch login.
//
// Prereq: local Supabase up + the `diagtest@local.dev` account present.
const authFile = "playwright/.auth/user.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/auth/signin");
  await page.locator("#email").fill("diagtest@local.dev");
  await page.locator("#password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/"); // server redirect on success → session cookie set
  await page.context().storageState({ path: authFile });
});
