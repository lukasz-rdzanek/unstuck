# E2E Testing Rules (Unstuck / Playwright)

The quality lever the agent reads before generating any E2E test. Constrains
output so generated tests are stable by default. Pairs with `e2e/seed.spec.ts`
(the worked exemplar). Source: Playwright Best Practices + `/10x-e2e`.

## Rules block

- Use `getByRole`, `getByLabel`, `getByText` as primary locators. Fall back to
  `getByTestId` only when accessibility attributes are ambiguous (e.g. the quiz
  widgets expose `data-testid="quiz-option|quiz-submit|quiz-result"`).
- Never use CSS selectors, XPath, or DOM structure to locate elements.
- Each test must be independently runnable — no shared state between tests.
  Playwright runs them in parallel, in random order.
- Never use `page.waitForTimeout()`. Wait for concrete state:
  `expect(locator).toBeVisible()`, `page.waitForURL()`, `page.waitForResponse()`.
  Optimistic-UI flows (e.g. MarkCompleteButton) flip the UI before the server
  responds — `await waitForResponse('**/api/.../complete')` BEFORE asserting
  persistence, or a reload races the write and the test flakes.
- Assert the **business outcome**, not implementation details. Control question
  for every assertion: _would it fail if the test-plan.md risk materialized?_ If
  not, it's decorative — fix it.
- Authenticate via `storageState`, never through the UI inside a feature test.
  Login (`auth.setup.ts`) and the signin/auth-gating flows are the only tests
  that touch the login UI; gating tests run anonymous via
  `test.use({ storageState: { cookies: [], origins: [] } })`.
- Unique test data where the domain allows (`Date.now()` suffix). For per-user
  booleans (lesson completion) that can't be made unique, normalize state at the
  start and clean up at the end (toggle back) — and **never** `supabase db reset`
  (it wipes the local `diagtest@local.dev` account). See [[feedback-no-db-reset]].

## Real vs mocked (Unstuck)

Internal boundaries stay **real** — Supabase auth, the Astro middleware gate,
the API routes, RLS, the `SECURITY DEFINER` grading. That is exactly where the
integration risk lives. Mock only expensive/non-deterministic **external** calls
(Workers AI / OpenRouter) at the network layer — and remember a server-side call
won't be intercepted by browser `page.route()`; mock it where the server calls out.

## Test data / accounts

- Local user: `diagtest@local.dev` / `password123` (enrolled in
  `react-architecture-deep-dive`). Created in local auth, not seed.sql — survives
  `supabase start`, dies on `db reset`.
- Auth state file: `playwright/.auth/user.json` (gitignored), produced by
  `e2e/auth.setup.ts`.
