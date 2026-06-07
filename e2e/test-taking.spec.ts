import { test, expect } from "@playwright/test";

// User-perspective e2e (testing-baseline): a signed-in learner takes the seeded
// quiz and sees a graded result. Exercises the full path through the
// submit_test_attempt SECURITY DEFINER grading (SQL) via the real UI.
//
// Prereqs (local): `npx supabase start` + seeded data; the dev server is started
// by playwright.config.ts. Uses the local diagtest account + the seeded
// "streaming-basics-test" in the react-architecture-deep-dive course.
const EMAIL = "diagtest@local.dev";
const PASSWORD = "password123";
const TEST_PATH = "/courses/react-architecture-deep-dive/tests/streaming-basics-test";

test("learner signs in, takes a test, and sees a graded result", async ({ page }) => {
  // Sign in via the real form (native POST → server redirect).
  await page.goto("/auth/signin");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("http://localhost:4321/");

  // Open the test, answer a question, submit.
  await page.goto(TEST_PATH);
  await expect(page.getByTestId("quiz-submit")).toBeVisible();
  await page.getByTestId("quiz-option").first().click();
  await page.getByTestId("quiz-submit").click();

  // The graded result panel appears with a percentage + pass/fail copy.
  const result = page.getByTestId("quiz-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText("%");
  await expect(result).toContainText(/Passed|to pass/);
});
