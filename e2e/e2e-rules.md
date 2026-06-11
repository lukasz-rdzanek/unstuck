# E2E Testing Rules (Unstuck / Playwright)

The quality lever the agent reads before generating any E2E test. Constrains
output so generated tests look like the rest of this suite and are stable by
default. Pairs with `e2e/seed.spec.ts` (the worked exemplar). Sources: Playwright
Best Practices + `/10x-e2e`; tailored to Unstuck's stack and conventions.

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
- **Astro island timing:** `client:load`/`client:visible` components render their
  SSR markup before React attaches handlers, so an early click is a silent no-op
  (compounded by any in-flight guard). Drive toggles with an idempotent retry
  (`expect(async () => { if (await from.isVisible()) await from.click(); await
expect(to).toBeVisible({ timeout: 1000 }); }).toPass()`) — see `seed.spec.ts`.
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

## Unstuck conventions (so generated tests match the suite)

- **File placement:** one test per file in `e2e/<feature>.spec.ts`. Setup/lever
  files: `e2e/auth.setup.ts`, `e2e/seed.spec.ts`, `e2e/e2e-rules.md`,
  `e2e/setup/*` (Node helpers, e.g. the login-user seeder). E2E lives in `e2e/`,
  NOT under `src/` or `tests/` (those are unit/hermetic + integration).
- **Test naming:** bind the name to the risk, not the mechanism —
  `test('lesson completion persists after a page reload', ...)`, not
  `test('mark complete', ...)`. The file name is the fs-friendly scenario.
- **Locator inventory (current):** signin form `#email` / `#password` +
  `getByRole('button', { name: 'Sign in' })`; quiz widgets `getByTestId('quiz-
option' | 'quiz-submit' | 'quiz-result')`; lesson completion
  `getByRole('button', { name: 'Mark as complete' | 'Completed' })`.
- **Seeded fixtures (supabase/seed.sql, stable ids):** course
  `react-architecture-deep-dive`; lesson `server-components-streaming`
  (`b0000000-0000-0000-0000-000000000001`); test `streaming-basics-test`. All
  courses are free today, so any authenticated user has access (no enrollment
  step needed).
- **Run a single spec:** `npx playwright test e2e/<file>.spec.ts --project
chromium` (the `setup` dependency runs first and writes the auth state). Full
  suite: `npm run test:e2e`.

## Real vs mocked (Unstuck)

Internal boundaries stay **real** — Supabase auth, the Astro middleware gate,
the API routes, RLS, the `SECURITY DEFINER` grading. That is exactly where the
integration risk lives. Mock only expensive/non-deterministic **external** calls
(Workers AI / OpenRouter) at the network layer — and remember a server-side call
won't be intercepted by browser `page.route()`; mock it where the server calls out.

## Visual risks — DOM by default, deterministic tools over vision

DOM/accessibility-tree assertions are the default and prove function (element
exists, form works, data saved). For **visual** risks (layout, z-index,
animation, overlap, canvas) the Playwright MCP vision mode (`--caps=vision`,
configured in `.mcp.json`) is a _supplement_, not the default — it costs time and
money and vision models are unreliable. For visual **regression**, prefer
deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel) over a vision model.
Note: `context/foundation/test-plan.md` §7 explicitly de-scopes visual/snapshot
testing of the marketing + cosmic UI (brittle, low signal, user-directed) — so
there is intentionally no visual-regression suite here today.

## Test data / accounts

- Login user: `diagtest@local.dev` / `password123`. Locally it's a manually
  created account (survives `supabase start`, dies on `db reset`). In CI the
  `e2e` job mints it idempotently via the admin API (`e2e/setup/seed-e2e-user.mjs`)
  because the `supabase/seed.sql` users have empty passwords and can't log in.
- Auth state file: `playwright/.auth/user.json` (gitignored), produced by
  `e2e/auth.setup.ts`.
