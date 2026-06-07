# Testing Baseline Implementation Plan

## Overview

Stand up the project's first automated test layer — the single gap blocking the 10xDevs Builder badge (and the foundation of the Champion CI/CD story, see `context/foundation/certification.md`). Two runners: **Vitest** for fast, dependency-free unit tests over the domain logic (runs in CI), and **Playwright** for one true end-to-end user-perspective flow ("take a test → see the score", runnable locally). A `test` step is added to `.github/workflows/ci.yml` so build + unit tests run automatically on every push/PR.

## Current State Analysis

- **No test infrastructure exists**: no runner, no config, no `test` script, no test deps (`vitest`/`playwright`/etc.). CI (`.github/workflows/ci.yml`) runs only `npm ci → astro sync → lint → build`.
- **Pure, unit-testable domain logic exists**:
  - `src/lib/srs.ts` — FSRS scheduling (`applyRating`, `emptyCardFields`); imports `ts-fsrs` (node-friendly).
  - `src/lib/video-embed.ts` — `parseVideoUrl` (provider + id parsing).
  - `src/lib/embeddings.ts` — `toVectorLiteral` (pure) + `EMBEDDING_DIM`/`EMBEDDING_MODEL` constants. **Gotcha:** this module imports `cloudflare:workers` at top level — Vitest must stub-alias that module or the import fails in node.
  - `isSafeNext` — open-redirect guard in `src/pages/api/auth/signin.ts:14`, currently **not exported**; extracting it to a util makes a security invariant testable.
- **Quiz grading is SQL** (`submit_test_attempt`, `supabase/migrations/20260606170000_tests_schema.sql`), not JS — it can only be exercised end-to-end (Playwright), not unit-tested.
- **Astro + Vitest**: `astro/config` exposes `getViteConfig`, which wires the `@/*` alias + Astro env for Vitest.
- **Local stack for e2e**: `astro dev` runs on workerd at `:4321` with local Supabase (Docker) — already used this session. A seeded test (`react-architecture-deep-dive/streaming-basics-test`) + a confirmed local user (`diagtest@local.dev` / `password123`) exist.

## Desired End State

`npm run test` runs a green Vitest suite over the domain logic; `npm run test:e2e` runs a green Playwright e2e of the take-a-test flow locally; CI runs lint + **test** + build automatically on push/PR. The mandatory Builder requirement ("≥1 test from the user's perspective") is satisfied by the Playwright e2e, and CI's automated quality gate now includes tests. Verify: CI badge green on a push; `npm run test` and `npm run test:e2e` pass locally.

### Key Discoveries:

- `src/lib/embeddings.ts` top-level `import { env } from "cloudflare:workers"` → needs a Vitest alias stub (`src/test/stubs/cloudflare-workers.ts`).
- `isSafeNext` (`src/pages/api/auth/signin.ts:14`) is the highest-value pure unit (security: open-redirect) but must be extracted to be importable.
- Grading is SQL-only → the user-perspective coverage of grading comes from the Playwright flow, not Vitest.
- `getViteConfig` (astro/config) is the supported way to give Vitest the `@/*` alias.

## What We're NOT Doing

- **No Playwright in CI** (this change) — e2e runs locally; CI-ifying it (Supabase + dev server in CI) is deferred to the CD change.
- **No automated deploy (CD)** and **no AI-assisted PR pipeline** — separate follow-on changes on the Champion path.
- **No coverage threshold/gate** — CI fails only on a failing test, not on a coverage %.
- **No DB/integration test harness** (pglite/testcontainers) for the SQL grading — covered by the e2e instead.
- **No broad unit tests of trivial utils** (`cn`, avatar-color) — low value.
- **No new app features** — test-only + a tiny `isSafeNext` extraction (behavior-preserving).

## Implementation Approach

Add Vitest first (config + the `cloudflare:workers` stub + scripts), do the small `isSafeNext` extraction, then write focused unit tests over the four domain units. Add Playwright second (config + one e2e spec driving the real take-a-test flow against the local stack). Finally wire `npm run test` into CI after the lint step. Each phase is independently green before the next.

## Critical Implementation Details

- **`cloudflare:workers` in unit tests**: any module transitively importing `cloudflare:workers` (today: `embeddings.ts`) fails to import under node/Vitest. Add `resolve.alias` in `vitest.config.ts` mapping `cloudflare:workers` → a local stub exporting an empty `env`. This is the load-bearing config detail.
- **Vitest env is `node`**: the chosen units are pure logic (no DOM) — set `environment: "node"`; no jsdom/happy-dom dependency needed.
- **Playwright auth**: the e2e signs in through the real UI form (browser sets the `Origin` header, so Astro's CSRF check passes); no programmatic token. Local Supabase must be running (`npx supabase start`) — documented as a prereq, not started by Playwright's `webServer` (which only starts `npm run dev`).
- **e2e is local-only this change**: CI runs Vitest only. Don't add Playwright to `ci.yml` here.

## Phase 1: Vitest setup + unit tests (domain logic)

### Overview

Install Vitest, configure it for Astro (`@/*` alias + `cloudflare:workers` stub), add scripts, extract `isSafeNext`, and write unit tests for the four domain units.

### Changes Required:

#### 1. Vitest dependency + scripts

**File**: `package.json`

**Intent**: Add the runner and the npm scripts CI + devs will call.

**Contract**: add `vitest` (devDependency); scripts `test` = `vitest run`, `test:watch` = `vitest`. (`test` is non-watch for CI.)

#### 2. Vitest config

**File**: `vitest.config.ts`

**Intent**: Give Vitest the Astro-aware config + the binding stub so domain modules import cleanly.

**Contract**: use `getViteConfig` from `astro/config`; `test.environment = "node"`, `test.include = ["src/**/*.test.ts"]`; `resolve.alias["cloudflare:workers"] = <abs path to the stub>`.

#### 3. cloudflare:workers stub

**File**: `src/test/stubs/cloudflare-workers.ts`

**Intent**: Satisfy the top-level import in `embeddings.ts` under node.

**Contract**: `export const env = {};`

#### 4. Extract `isSafeNext`

**File**: `src/lib/safe-next.ts` (new) + `src/pages/api/auth/signin.ts` (import from it)

**Intent**: Make the open-redirect guard importable + unit-testable without behavior change.

**Contract**: move the `isSafeNext` function + its doc comment to `src/lib/safe-next.ts` as a named export; `signin.ts` imports it. Regex/logic unchanged (`/^\/(?![/\\])/`).

#### 5. Unit tests

**Files**: `src/lib/srs.test.ts`, `src/lib/video-embed.test.ts`, `src/lib/safe-next.test.ts`, `src/lib/embeddings.test.ts`

**Intent**: Cover the meaningful domain logic + the security guard.

**Contract**:
- `srs.test.ts` — `emptyCardFields` returns a valid new-card shape; `applyRating` advances/retreats due date sensibly (e.g. rating 1=Again → near-term, rating 3/4 → further out; reps/lapses move correctly).
- `video-embed.test.ts` — `parseVideoUrl` parses YouTube + Vimeo URLs → `{provider, id}`; returns null/handles unrecognized input.
- `safe-next.test.ts` — accepts `"/courses/x"`; rejects `"//evil.com"`, `"/\\evil.com"`, `"https://evil.com"`, `""`, non-strings.
- `embeddings.test.ts` — `toVectorLiteral([0.1,0.2])` → `"[0.1,0.2]"`; `EMBEDDING_DIM === 768`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- `npm run test` shows the four suites green; `signin` still redirects safely (open-redirect guard unchanged after extraction).

---

## Phase 2: Playwright e2e — take a test → see the score (local)

### Overview

Add Playwright and one end-to-end spec that drives the real take-a-test user flow against the local stack. This is the mandatory "user-perspective" test.

### Changes Required:

#### 1. Playwright dependency + script

**File**: `package.json`

**Intent**: Add the e2e runner + script.

**Contract**: add `@playwright/test` (devDependency); script `test:e2e` = `playwright test`.

#### 2. Playwright config

**File**: `playwright.config.ts`

**Intent**: Run specs against the local dev server.

**Contract**: `testDir = "e2e"`, `use.baseURL = "http://localhost:4321"`, `webServer = { command: "npm run dev", url: "http://localhost:4321", reuseExistingServer: true }`, single chromium project.

#### 3. e2e spec — take a test

**File**: `e2e/test-taking.spec.ts`

**Intent**: Verify a learner can sign in, take the seeded test, submit, and see a graded result — exercising `submit_test_attempt` end-to-end.

**Contract**: sign in via the UI form (`diagtest@local.dev` / `password123`) → navigate to `/courses/react-architecture-deep-dive/tests/streaming-basics-test` → select an option per question → click Submit → assert the result panel shows a `%` and a Passed/Not-yet state. No Workers AI / Realtime involved.

### Success Criteria:

#### Automated Verification:

- E2E passes locally: `npm run test:e2e` (with `npx supabase start` + local stack up)

#### Manual Verification:

- The spec drives the full flow and the score panel asserts correctly; re-running is stable.

---

## Phase 3: CI test stage

### Overview

Wire Vitest into CI so build + unit tests run automatically on every push/PR.

### Changes Required:

#### 1. Add a test step to CI

**File**: `.github/workflows/ci.yml`

**Intent**: Run the unit suite automatically as a quality gate alongside lint + build.

**Contract**: add a `- run: npm run test` step after the `npm run lint` step (before or after `npm run build`). Vitest units need no Supabase/secrets, so the step runs clean. Do NOT add Playwright here.

### Success Criteria:

#### Automated Verification:

- CI workflow is valid YAML and includes the `npm run test` step.
- On push, the CI run executes lint + test + build and passes (verify the Actions run).

#### Manual Verification:

- The GitHub Actions run for the pushing commit shows the test step green.

---

## Testing Strategy

### Unit Tests (Vitest):
- FSRS scheduling (`srs.ts`), video URL parsing (`video-embed.ts`), open-redirect guard (`safe-next.ts`), vector literal + dim (`embeddings.ts`).

### E2E (Playwright, local):
- Take-a-test → graded result (exercises the SQL grading path through the UI).

### Manual Testing Steps:
1. `npm run test` → four green suites.
2. `npx supabase start` (if down) → `npm run test:e2e` → green.
3. Push a branch/commit → GitHub Actions runs lint + test + build green.

## Performance Considerations

Vitest units are pure + sub-second; no external deps → fast CI. Playwright is local-only, so it doesn't slow CI.

## Migration Notes

`isSafeNext` extraction is behavior-preserving (same regex). No data/schema changes.

## References

- Certification assessment / Champion path: `context/foundation/certification.md`
- Grading under test (SQL): `supabase/migrations/20260606170000_tests_schema.sql`
- Quiz UI exercised by the e2e: `src/components/test/TestQuiz.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest setup + unit tests (domain logic)

#### Automated

- [x] 1.1 Unit tests pass: `npm run test` — b786585
- [x] 1.2 Type check passes: `npx astro check` — b786585
- [x] 1.3 Lint passes: `npm run lint` — b786585
- [x] 1.4 Build succeeds: `npm run build` — b786585

#### Manual

- [x] 1.5 Four suites green; signin open-redirect guard unchanged after extraction — b786585

### Phase 2: Playwright e2e — take a test → see the score (local)

#### Automated

- [x] 2.1 E2E passes locally: `npm run test:e2e` (local stack up) — 85d7db9

#### Manual

- [x] 2.2 Spec drives sign-in → take test → submit → score panel asserts; stable on re-run — 85d7db9

### Phase 3: CI test stage

#### Automated

- [x] 3.1 ci.yml valid + includes `npm run test` step
- [ ] 3.2 CI run executes lint + test + build and passes

#### Manual

- [ ] 3.3 GitHub Actions run shows the test step green
