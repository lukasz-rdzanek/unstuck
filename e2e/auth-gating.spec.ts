import { test, expect } from "@playwright/test";

// R7 (test-plan.md §2) — auth / session route-gating. An UNauthenticated visitor
// to a protected route must be redirected to signin, never served the protected
// content. Exercises the full path through the Astro middleware:
// isProtectedRoute(pathname) → no session cookie → redirect to
// /auth/signin?next=<original path>. Pure browser-level: middleware + cookie +
// redirect can't be proven by an isolated unit test.
//
// Runs ANONYMOUS — override the project's authenticated storageState with an
// empty session.
test.use({ storageState: { cookies: [], origins: [] } });

const PROTECTED = "/courses/react-architecture-deep-dive/lessons/server-components-streaming";

test("unauthenticated visitor is redirected from a protected lesson to signin", async ({ page }) => {
  await page.goto(PROTECTED);

  // Risk-tied: redirected to signin, carrying the original path as ?next so the
  // user lands back where they wanted after logging in.
  await expect(page).toHaveURL(/\/auth\/signin\?next=/);
  await expect(page).toHaveURL(
    new RegExp(`next=${encodeURIComponent(PROTECTED).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  );
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  // And the protected content is NOT leaked behind the redirect.
  await expect(page.getByRole("button", { name: "Mark as complete" })).toBeHidden();
});
