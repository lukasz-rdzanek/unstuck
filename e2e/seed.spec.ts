import { test, expect, type Locator } from "@playwright/test";

// SEED EXEMPLAR (testing-e2e) — every generated E2E test is modeled on this one.
// What the seed shows is what the generator produces, so it demonstrates the
// patterns deliberately: role-based locators, wait-for-state (not time), a
// risk-tied name, a self-contained normalize → act → assert → reload → cleanup,
// and the Astro-island gotchas this app actually has. Authenticated via project
// storageState (no UI login here).
//
// Risk (browser-level): a learner marks a lesson complete, the UI flips, but the
// completion is LOST after a page reload — i.e. it never survived the full
// auth → POST /api/lessons/:id/complete → DB → SSR re-render path. The Unstuck
// analog of the flagship "flashcards gone after refresh" risk; no unit test
// covers it because it only exists once those real boundaries integrate.
//
// Island gotchas this seed encodes for the generator:
//  1. MarkCompleteButton is `client:load`: the SSR button is visible before
//     React attaches onClick, so an early click is a no-op.
//  2. The component has a synchronous in-flight guard: a click while a previous
//     fetch is still pending is ignored.
//  Both mean a single click can silently do nothing — so we drive the toggle
//  with an idempotent RETRY (click only while the source state still shows) that
//  settles once the click actually registers.

const LESSON = "/courses/react-architecture-deep-dive/lessons/server-components-streaming";

// Toggle a MarkCompleteButton from `from` → `to`, retrying through hydration and
// the in-flight guard; a no-op if already in `to`. Idempotent: only clicks while
// `from` is showing, so a late click can't bounce the state back.
async function toggleTo(from: Locator, to: Locator) {
  await expect(async () => {
    if (await from.isVisible()) await from.click();
    await expect(to).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
}

test("lesson completion persists after a page reload", async ({ page }) => {
  await page.goto(LESSON);

  const markBtn = page.getByRole("button", { name: "Mark as complete" });
  const completedBtn = page.getByRole("button", { name: "Completed" });
  await expect(markBtn.or(completedBtn)).toBeVisible(); // island present (SSR)

  // Normalize to incomplete — a prior run may have left it complete.
  await toggleTo(completedBtn, markBtn);

  // Act: mark complete, and wait for the server write to settle before reloading
  // (the flip is optimistic — a bare reload would race the POST and flake).
  const postSettled = page.waitForResponse(
    (r) => r.url().includes("/complete") && r.request().method() === "POST" && r.ok(),
  );
  await toggleTo(markBtn, completedBtn);
  await postSettled;

  // Risk-tied assertion: after a real SSR reload the completion must still be
  // there — proves it persisted through API → DB → server render, not just in
  // optimistic client state.
  await page.reload();
  await expect(completedBtn).toBeVisible();

  // Cleanup: toggle back to incomplete so the test is re-runnable.
  await toggleTo(completedBtn, markBtn);
});
