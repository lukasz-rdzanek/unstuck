# Hermetic service/API contract tests (test-plan Phase 3) — Implementation Plan

## Overview

Add **hermetic unit tests** (no network, no Docker, no live Supabase/Workers AI) of the Astro API routes + middleware, pinning their contracts:

- **R6** — service/API contract regressions: zod validation, auth/operator gating, and the **graceful-degradation posture** (which routes swallow dependency failures → still 200, which treat them as fatal → 500).
- **R7** — auth open-redirect / session route-gating: the signin redirect **sink** and the middleware **gate** (the wiring, not the already-tested `isSafeNext` regex).
- **R5 (endpoint)** — the `match-answer` route's degrade-to-`{match:null}` contract (distinct from the SQL `match_lesson_answers` covered in Phase 2).
- **Deferred SRS write-path** (from Phase 2) — the enrol-branch logic in submit/grade/rate handlers.

These characterize **already-correct** behavior; the job is regression-pinning. Test code + a small test harness only, plus a one-line `isProtectedRoute` export (test-enablement) and an AGENTS.md doc fix. Runs in the existing **unit** Vitest project (`npm run test`), so it's CI-safe and hermetic — a different layer from Phases 1–2 (which used the live stack).

## Current State Analysis

- **The seam** ([research.md]): every route is `export const POST: APIRoute = async (context) => …` and obtains its client via `createClient(request.headers, cookies)` from [`src/lib/supabase.ts`](../../../src/lib/supabase.ts) (which imports `astro:env/client`). `vi.mock("@/lib/supabase")` both bypasses the unresolved `astro:env` import and supplies a fake client. No handler reads the client off `locals`; `locals.user` is the only middleware-produced value.
- **Per-route contracts** are fully tabled in research.md (status codes + shapes for valid/bad/unauth/non-operator/dependency-failure). Headlines: match-answer degrade ([`match-answer.ts:36-72`](../../../src/pages/api/lessons/[lessonId]/match-answer.ts)), backfill gate ladder ([`backfill.ts:35-86`](../../../src/pages/api/embeddings/backfill.ts)), resend anti-enumeration ([`resend.ts`](../../../src/pages/api/auth/resend.ts)).
- **R7**: `isSafeNext` is fully unit-covered ([`src/lib/safe-next.test.ts`](../../../src/lib/safe-next.test.ts)) — do not duplicate. The gap is the signin sink ([`signin.ts:44`](../../../src/pages/api/auth/signin.ts)) + the middleware gate ([`middleware.ts:55-58`](../../../src/middleware.ts)). `isProtectedRoute` is module-private.
- **SRS**: submit's 3-way enrol branch ([`submit.ts:83-121`](../../../src/pages/api/tests/[testId]/submit.ts)), grade ([`grade.ts:67-88`](../../../src/pages/api/practice/[questionId]/grade.ts)), rate ([`rate.ts:62-89`](../../../src/pages/api/reviews/[lessonId]/rate.ts)). FSRS math is unit-covered ([`src/lib/srs.test.ts`](../../../src/lib/srs.test.ts)) — do not re-test.
- **Infra**: unit project ([`vitest.config.ts:14-37`](../../../vitest.config.ts)) includes `src/**/*.test.ts`, aliases `@` + `cloudflare:workers` stub, deliberately NOT `astro:env`. `strictTypeChecked` lint. Full grounding: `context/changes/testing-hermetic-service-api/research.md`.

## Desired End State

- `npm run test` includes new hermetic route/middleware/SRS tests; CI stays green, no Docker, no live stack.
- Each risk test **proven able to fail** (invert/break → red → revert).
- `isProtectedRoute` exported + pure-tested; AGENTS.md auth-flow note corrected.
- `test-plan.md` §6 has a Phase-3 hermetic recipe; §3 Phase 3 reads `complete`.

### Key Discoveries:

- `vi.mock("@/lib/supabase")` is the universal seam; backfill needs `vi.mock("astro:env/server")`; embedding routes mock `@/lib/embeddings`.
- **Residual risk**: `vi.mock` on the bare `astro:env/server` specifier may not register without the module resolving — Phase 1 verifies, with an alias-stub fallback.
- Posture asymmetry is the real R6 surface: match-answer/submit/grade **swallow** (still 200), rate/backfill-list/grade-RPC are **fatal** (500).
- R7's value is the wiring (sink + gate), not the regex.
- SRS oracle = capture-the-upsert-payload (branch + session→user_id), not FSRS numbers.

## What We're NOT Doing

- No re-testing `isSafeNext` vectors (covered) or FSRS math (covered).
- No production behavior change — the only non-test edits are the `isProtectedRoute` export (test-enablement, no behavior change) and the AGENTS.md doc fix.
- No integration/live-stack tests, no `vitest.config` project change, no CI/Stryker wiring (Phase 4).
- No exhaustive per-scenario coverage of trivial routes (signout always-redirects, signup, verify-otp) — they get cross-cutting `it.each` baseline coverage, not depth.
- No client-injection refactor of handlers (rejected — production change).

## Implementation Approach

Layered by risk, mirroring Phases 1–2: build + de-risk the harness first (Phase 1, including the astro:env verification), then one phase per risk family (R6 → R7 → SRS), each co-located as `src/pages/api/**/*.test.ts` (and `src/*.test.ts` for middleware) depending only on the harness, then close-out (cookbook + doc fix + status). Each risk phase ends with **prove-it-fails** (invert an assertion or break the stub) to guard against vacuous green on already-correct code.

## Critical Implementation Details

- **astro:env verification (Phase 1, load-bearing):** confirm a test that `vi.mock("@/lib/supabase")` can import a handler without the real `astro:env/client` loading, AND that `vi.mock("astro:env/server", () => ({ OPERATOR_USER_ID: … }))` registers for backfill. If the bare-specifier mock fails to resolve, add an `astro:env/server` (+ `/client`) alias stub under `src/test/stubs/` to the unit project — but prefer vi.mock so the tripwire stays intact for non-route unit tests.
- **`as unknown as APIContext`** for the fake context (satisfies strictTypeChecked without filling the full interface); fake Supabase typed `Partial<SupabaseClient<Database>> as unknown as …` (mirrors `tests/integration/setup/clients.ts`).
- **`vi.spyOn(console, "error"/"warn")`** in degrade-path tests to keep output clean (no-console is warn-only, won't fail lint).

## Phase 1: Harness + astro:env verification

### Overview

Build the hermetic harness and de-risk the astro:env mock before any route test depends on it.

### Changes Required:

#### 1. API-context factory

**File**: `src/test/harness/api-context.ts`

**Intent**: Provide `makeApiContext({ method, url, body, headers, locals, params })` that assembles only the `APIContext` fields handlers read and returns it cast as `APIContext`.

**Contract**: Returns an object with `request` (a real `Request`), `locals` (`{ user }`), `params`, `cookies` (stub get/set), and `redirect(url, status?)` → `Response` with `Location` header. JSON bodies via `JSON.stringify` + content-type; form routes via `FormData`/`URLSearchParams`. `return … as unknown as APIContext`.

#### 2. Fake Supabase builder

**File**: `src/test/harness/fake-supabase.ts`

**Intent**: A declarative builder for a fake `SupabaseClient` covering the call shapes routes use, so each test stays readable.

**Contract**: Exposes `.auth` (signInWithPassword/signUp/signOut/resend/verifyOtp/getUser), chainable `.from().select().eq()/.in()/.maybeSingle()/.single()`, `.upsert()` (records payload for assertion), `.delete().eq()`, `.rpc()`. Each returns caller-configured `{data,error}`. Typed `Partial<SupabaseClient<Database>> as unknown as SupabaseClient<Database>`.

#### 3. astro:env mock verification + smoke test

**File**: `src/test/harness/harness.test.ts` (or co-located on one trivial route, e.g. `signout`)

**Intent**: Prove the seam works hermetically before building on it: a handler imported under `vi.mock("@/lib/supabase")` loads and runs; `vi.mock("astro:env/server")` registers. If the bare-specifier mock fails, add the alias-stub fallback and re-verify.

**Contract**: One smoke test invoking a real handler (e.g. `signout` → asserts `redirect("/")`) through `makeApiContext` + mocked supabase. Passing proves: handler import doesn't pull `astro:env/client`, the context factory works, the redirect helper is asserted correctly.

### Success Criteria:

#### Automated Verification:

- Smoke/harness test passes: `npm run test -- harness` (or the chosen smoke file)
- Full unit run green: `npm run test`
- Type check + lint pass: `npx tsc --noEmit` && `npm run lint`

#### Manual Verification:

- Confirm which astro:env approach was used (vi.mock vs alias fallback) and that the unit-project tripwire for `astro:env` is preserved for non-route tests (i.e. a plain unit test importing `src/lib/supabase.ts` without the mock still fails to resolve — the tripwire still bites).

**Implementation Note**: Pause for manual confirmation before Phase 2.

---

## Phase 2: R6 — service/API contracts

### Overview

Pin the contract + degradation posture of the high-signal routes, with a cross-cutting sweep for the rest.

### Changes Required:

#### 1. match-answer contract (R5 endpoint)

**File**: `src/pages/api/lessons/[lessonId]/match-answer.test.ts`

**Intent**: Pin the degrade-to-`{match:null}` posture — the chat must never 500 over a missing suggestion.

**Contract**: no user → `unauthenticated`/401; missing lesson / bad JSON / bad shape → `missing_lesson_id`/`invalid_json`/`invalid_request`/400; **embed or match throws → `{ok:true, match:null}`/200**; null course → `{ok:true,match:null}`/200; happy path → `{ok:true, match}`/200. Stub `@/lib/supabase` + `@/lib/services/answer-match` (+ `@/lib/embeddings`).

#### 2. backfill operator gate (R6 headline)

**File**: `src/pages/api/embeddings/backfill.test.ts`

**Intent**: Pin the fail-closed gate ladder + per-row-failure accounting.

**Contract**: gate order — no user→401; `OPERATOR_USER_ID` unset (mock `astro:env/server` → undefined)→`backfill_disabled`/503; non-operator→`forbidden`/403; operator→`{ok:true, embedded, failed, remaining}`/200. list RPC error→`list_failed`/500 (fatal); a per-row embed/set failure → counted in `failed`, loop continues (non-fatal). Stub supabase rpc + embeddings.

#### 3. resend anti-enumeration

**File**: `src/pages/api/auth/resend.test.ts`

**Intent**: Pin the security contract that resend never reveals whether an email exists.

**Contract**: bad email → `{error}`/400; success / unknown-email / already-confirmed / supabase-unconfigured → **identical `{ok:true}`/200**; `over_email_send_rate_limit` → `{error:"rate_limited", retryAfterSeconds}`/429. Stub `auth.resend` to each outcome.

#### 4. Cross-cutting contract sweep + posture

**File**: `src/pages/api/**/*.test.ts` (complete, submit, grade, rate; reuse for signin/signup/verify-otp where JSON-shaped)

**Intent**: Cheap baseline coverage of the shared invariants + the swallow-vs-fatal posture asymmetry.

**Contract**: parameterized (`it.each`) over the JSON routes: no user → `unauthenticated`/401; missing param → `missing_*`/400; bad body → `invalid_json`/400; `createClient`→null → `supabase_not_configured`/500. Plus posture: submit/grade SRS-upsert throw → still 200 (swallowed); rate load/upsert error → `load_failed`/`save_failed`/500 (fatal). (The SRS *enrol-branch* logic itself is Phase 4.)

#### 5. Prove-it-fails (manual, reverted)

**Intent**: Confirm the degrade assertion isn't vacuous.

**Contract**: temporarily make match-answer's error stub assert a 500 expectation (or invert the `{match:null}` assertion) → red → revert.

### Success Criteria:

#### Automated Verification:

- R6 tests pass: `npm run test -- match-answer backfill resend` (+ the cross-cutting file)
- Full unit run green: `npm run test`
- Type check + lint pass.

#### Manual Verification:

- Prove-it-fails performed on the match-answer degrade contract.

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: R7 — auth redirect / route-gating

### Overview

Pin the open-redirect sink and the middleware gate — the wiring `isSafeNext`'s unit test can't reach.

### Changes Required:

#### 1. Export isProtectedRoute

**File**: `src/middleware.ts`

**Intent**: Make the route-boundary matcher unit-testable.

**Contract**: add `export` to `isProtectedRoute` (no behavior change). No other edit.

#### 2. isProtectedRoute boundary test

**File**: `src/middleware.test.ts` (or `src/lib/...` co-located)

**Intent**: Pin the protected-route patterns + near-misses against regex drift.

**Contract**: `/dashboard`, `/courses/x/lessons/y`, `/courses/x/tests/y`, `/courses/x/practice` → true; near-misses (`/courses/x/lessons` no trailing slash, `/courses/x/practice/sub`, a public path) → false. Document `/dashboardfoo` prefix behavior as intended.

#### 3. signin redirect sink + middleware gate

**File**: `src/pages/api/auth/signin.test.ts`, `src/middleware.test.ts`

**Intent**: Pin the actual open-redirect protection + the unauth gate.

**Contract**: signin success with `next=//evil.com` or `/\evil.com` → `redirect("/")`; safe `next` → that path; missing `next` → `/`. Error/zod-fail path: unsafe `next` dropped from the error redirect, safe preserved. Middleware: unauth + protected → `redirect("/auth/signin?next=" + encoded path)`; authed or non-protected → falls through (`next()` called). Stub `@/lib/supabase` (`signInWithPassword`/`getUser`).

#### 4. Prove-it-fails (manual, reverted)

**Intent**: Confirm the open-redirect assertion is real.

**Contract**: temporarily expect signin to honor `next=//evil.com` → red → revert.

### Success Criteria:

#### Automated Verification:

- R7 tests pass: `npm run test -- signin middleware`
- Full unit run green: `npm run test`
- Type check + lint pass.

#### Manual Verification:

- Prove-it-fails performed on the signin open-redirect sink.

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: SRS enrol branches (deferred from Phase 2)

### Overview

Pin the enrol-branch decisions + session→user_id binding via capture-the-upsert-payload — not the FSRS math.

### Changes Required:

#### 1. submit enrol-branch test

**File**: `src/pages/api/tests/[testId]/submit.test.ts`

**Intent**: Pin the 3-way branch, especially the load-bearing skip.

**Contract**: stub `submit_test_attempt` to return mixed perQuestion + a fake `srs_question_state` fixture: **correct first-timer (no card) → NO upsert row**; wrong → upsert row with `user_id === session`, `reps ≥ 1`; correct WITH card → upsert row; mixed batch → exactly the expected row count. Schedule upsert throw → response still 200 with grading result. `user_id` always from session, never request body.

#### 2. grade + rate handler tests

**File**: `src/pages/api/practice/[questionId]/grade.test.ts`, `src/pages/api/reviews/[lessonId]/rate.test.ts`

**Intent**: Pin grade's always-reschedule + rating mapping, and rate's raw-rating + fatal-error posture.

**Contract**: grade — correct→Good(3)/wrong→Again(1) (spy `applyRating` args), first-timer correct → still upserts (contrast with submit); upsert throw → still 200. rate — raw rating 1..4 passed unchanged to `applyRating`; upsert binds session user_id + path lesson_id (`onConflict user_id,lesson_id`); **load error → 500 `load_failed`; upsert error → 500 `save_failed`** (fatal).

#### 3. Prove-it-fails (manual, reverted)

**Intent**: Confirm the skip-branch assertion is real.

**Contract**: temporarily expect an upsert for the correct-first-timer case → red → revert.

### Success Criteria:

#### Automated Verification:

- SRS tests pass: `npm run test -- submit grade rate`
- Full unit run green: `npm run test`
- Type check + lint pass.

#### Manual Verification:

- Prove-it-fails performed on the submit correct-first-timer skip branch.

**Implementation Note**: Pause for manual confirmation before Phase 5.

---

## Phase 5: Cookbook, doc fix & close-out

### Overview

Capture the hermetic recipe, fix the stale doc, sync status.

### Changes Required:

#### 1. Cookbook entry

**File**: `context/foundation/test-plan.md` (§6)

**Intent**: Fill the Phase-3 TBD with the hermetic recipe future work reuses.

**Contract**: replace the "Hermetic: stubbed Supabase client + Workers AI" bullet with: the `vi.mock("@/lib/supabase")` seam (+ astro:env/server + embeddings mocks), the `makeApiContext`/fake-supabase harness, the swallow-vs-fatal posture lens, the capture-the-upsert-payload SRS pattern, and "isSafeNext/FSRS already unit-covered — don't duplicate." Point to the new test files.

#### 2. Fix stale AGENTS.md note

**File**: `AGENTS.md`

**Intent**: Correct the auth-flow description to match the code.

**Contract**: replace the `PROTECTED_ROUTES` array mention with `isProtectedRoute()` + the regex-pattern reality (dashboard prefix + lessons/tests/practice patterns); keep it brief.

#### 3. Rollout status sync

**File**: `context/foundation/test-plan.md` (§3 table)

**Intent**: Reflect Phase 3 shipped.

**Contract**: set §3 Phase-3 Status cell to `complete`.

### Success Criteria:

#### Automated Verification:

- Full unit run green: `npm run test`
- Lint + type check pass.

#### Manual Verification:

- §6 cookbook entry is concrete enough for Phase 4 (CI/Stryker) and future contributors to reuse the hermetic harness without re-reading test source.

**Implementation Note**: Final phase — after automated verification, pause for manual confirmation, then the implement epilogue closes the change.

---

## Testing Strategy

### Unit (hermetic) tests — the deliverable:

- `match-answer.test.ts`, `backfill.test.ts`, `resend.test.ts` + a cross-cutting contract file (R6/R5).
- `signin.test.ts`, `middleware.test.ts` (R7).
- `submit.test.ts`, `grade.test.ts`, `rate.test.ts` (SRS branches).
- `src/test/harness/*` (factory + fake client + smoke).

### Oracle rule:

Assert the route/middleware **contract** (status + shape + redirect Location + which branch ran), never the mock or the implementation. `isSafeNext` and FSRS math are already unit-covered — excluded. Each risk phase is proven able to fail.

### What stays out:

Integration/live-stack (Phases 1–2), CI wiring + Stryker (Phase 4).

## Performance Considerations

Hermetic tests are in-process and fast (no I/O) — they join the default `npm run test` run with negligible cost.

## Migration Notes

No DB migrations. The only non-test edits are an `export` keyword (middleware) and an AGENTS.md line.

## References

- Research: `context/changes/testing-hermetic-service-api/research.md`
- Phase 1–2 harness precedent: `context/archive/2026-06-07-testing-access-control-rls/`, `…-testing-grading-srs-integration/`
- Deferred SRS source: `context/archive/2026-06-07-testing-grading-srs-integration/research.md` (Open Question #1)
- Rollout: `context/foundation/test-plan.md` (§2 R5/R6/R7, §3 Phase 3, §6 cookbook)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Harness + astro:env verification

#### Automated

- [x] 1.1 Smoke/harness test passes: `npm run test -- harness` — 7bd7673
- [x] 1.2 Full unit run green: `npm run test` — 7bd7673
- [x] 1.3 Type check + lint pass — 7bd7673

#### Manual

- [x] 1.4 astro:env approach confirmed (vi.mock vs alias) + tripwire preserved for non-route unit tests — 7bd7673

### Phase 2: R6 — service/API contracts

#### Automated

- [x] 2.1 R6 tests pass: `npm run test -- match-answer backfill resend` (+ cross-cutting) — baaee79
- [x] 2.2 Full unit run green: `npm run test` — baaee79
- [x] 2.3 Type check + lint pass — baaee79

#### Manual

- [x] 2.4 Prove-it-fails: match-answer degrade contract flips red when inverted; revert restores green — baaee79

### Phase 3: R7 — auth redirect / route-gating

#### Automated

- [x] 3.1 R7 tests pass: `npm run test -- signin middleware` — d03a5be
- [x] 3.2 Full unit run green: `npm run test` — d03a5be
- [x] 3.3 Type check + lint pass — d03a5be

#### Manual

- [x] 3.4 Prove-it-fails: signin open-redirect sink flips red when inverted; revert restores green — d03a5be

### Phase 4: SRS enrol branches

#### Automated

- [x] 4.1 SRS tests pass: `npm run test -- submit grade rate`
- [x] 4.2 Full unit run green: `npm run test`
- [x] 4.3 Type check + lint pass

#### Manual

- [x] 4.4 Prove-it-fails: submit correct-first-timer skip flips red when an upsert is expected; revert restores green

### Phase 5: Cookbook, doc fix & close-out

#### Automated

- [ ] 5.1 Full unit run green: `npm run test`
- [ ] 5.2 Lint + type check pass

#### Manual

- [ ] 5.3 §6 cookbook entry is concrete enough for Phase 4 + contributors to reuse the harness
