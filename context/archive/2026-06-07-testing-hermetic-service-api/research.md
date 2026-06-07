---
date: 2026-06-07T16:05:00+02:00
researcher: Lukasz Rdzanek
git_commit: 1132a9b360c264fe1ae51b91b82de0087d29a70d
branch: master
repository: Unstuck
topic: "Hermetic service/API contract tests (test-plan Phase 3): R6/R7/R5-endpoint + deferred SRS write-path; the Astro-handler stub seam"
tags: [research, codebase, hermetic-tests, api-routes, vi-mock, astro-env, middleware, auth-redirect, srs]
status: complete
last_updated: 2026-06-07
last_updated_by: Lukasz Rdzanek
---

# Research: Hermetic service/API contract tests (test-plan Phase 3)

**Date**: 2026-06-07T16:05:00+02:00
**Researcher**: Lukasz Rdzanek
**Git Commit**: 1132a9b360c264fe1ae51b91b82de0087d29a70d
**Branch**: master
**Repository**: Unstuck

## Research Question

Ground rollout **Phase 3** of `context/foundation/test-plan.md` (change `testing-hermetic-service-api`): hermetic (no-network, no-Docker) unit tests of services + API routes — R6 (contract regressions: validation, gating, graceful degradation), R7 (auth open-redirect / route-gating), R5 (the match *endpoint*), plus the SRS scheduling write-path deferred from Phase 2. The load-bearing unknown: **how to invoke Astro API route handlers hermetically** given the unit Vitest project doesn't resolve `astro:env/*`.

## Summary

The unknown is resolved: **`vi.mock("@/lib/supabase")` is the seam.** Every target handler is `export const POST: APIRoute = async (context) => …` and obtains its DB client by calling `createClient(context.request.headers, context.cookies)` from [`src/lib/supabase.ts`](../../../src/lib/supabase.ts). Mocking that module both (a) prevents its top-level `astro:env/client` import from ever loading (so the unit project's deliberate non-resolution of `astro:env` is sidestepped) and (b) hands the test a fake Supabase client — which is what every assertion needs. No production code change, no `vitest.config` change: handler tests co-locate as `src/pages/api/**/*.test.ts` and run in the existing **unit** project (`npm run test`, CI-safe, hermetic). Two extra per-route mocks: `vi.mock("astro:env/server")` for backfill (it imports `OPERATOR_USER_ID` directly) and `vi.mock("@/lib/embeddings")` (or set the stubbed `env.AI`) for the two embedding routes.

The work is **test code + a small test harness only** (`makeApiContext()` factory + an optional typed fake-Supabase builder). The headline targets, by signal: **match-answer** (degrade-to-`{match:null}`, never 500), **backfill** (401→503→403→200 operator-gate ladder; per-row failure non-fatal vs list failure fatal), **resend** (anti-enumeration: identical `{ok:true}` across success/unknown/already-confirmed + distinct 429), the **SRS enrol branches** in submit/grade/rate, and the **R7 open-redirect sink** in signin (`next=//evil.com` → `/`). `isSafeNext` is already fully unit-tested — Phase 3 must NOT re-test it.

**One thing to verify empirically in the harness phase:** whether `vi.mock("astro:env/server")` works on a bare virtual specifier without an alias; if Vitest can't register the mock, fall back to an `astro:env/server` alias stub (mirroring the existing `cloudflare:workers` stub). This is the one residual risk.

## Detailed Findings

### The hermetic harness (the resolved unknown)

- **Handler shape** ([`src/pages/api/lessons/[lessonId]/match-answer.ts:36`](../../../src/pages/api/lessons/[lessonId]/match-answer.ts), [`embeddings/backfill.ts:35`](../../../src/pages/api/embeddings/backfill.ts), [`auth/signin.ts:13`](../../../src/pages/api/auth/signin.ts)): `export const POST: APIRoute = async (context) => …`, one `APIContext` arg. Handlers read only `locals.user?.id`, `params.<x>`, `request.json()`/`request.formData()`, `cookies` (forwarded to `createClient`), and `redirect` (auth routes). **No handler reads `locals.runtime.env`** ([`src/env.d.ts`](../../../src/env.d.ts) App.Locals = `user`, `displayName`, `theme`).
- **The seam**: every handler calls `createClient(request.headers, cookies)` from `src/lib/supabase.ts` (match-answer:52, backfill:50, signin:27). `src/lib/supabase.ts:3` imports `astro:env/client`, which the unit project does NOT resolve (tripwire at [`vitest.config.ts:16-19`](../../../vitest.config.ts)). **`vi.mock("@/lib/supabase", () => ({ createClient: () => fakeClient }))`** solves both problems at once. Return `null` from the mock to exercise each route's `supabase_not_configured`/500 branch.
- **Extra mocks**: backfill imports `OPERATOR_USER_ID` from `astro:env/server` directly ([`backfill.ts:3`](../../../src/pages/api/embeddings/backfill.ts) — the only `astro:env/server` use in the repo) → `vi.mock("astro:env/server", () => ({ OPERATOR_USER_ID: "<uuid>" }))` (or `undefined` to hit the 503 fail-closed branch). match-answer + backfill transitively import `cloudflare:workers` via [`src/lib/embeddings.ts:11`](../../../src/lib/embeddings.ts) (already aliased to [`src/test/stubs/cloudflare-workers.ts`](../../../src/test/stubs/cloudflare-workers.ts)); mock `@/lib/embeddings` (fake `embedText`) or `@/lib/services/answer-match` to control/throw.
- **`makeApiContext` factory** (net-new, suggest `src/test/harness/api-context.ts`): assemble only what handlers read — `request: new Request(url, {method, headers, body})`, `locals: { user }`, `params`, `cookies` (stub get/set), `redirect: (url, status?) => new Response(null, {status: status ?? 302, headers: {Location: url}})` — and `return … as unknown as APIContext` (satisfies `strictTypeChecked` without filling the full interface). For JSON routes pass `JSON.stringify(body)` + `Content-Type: application/json`; a non-JSON body hits the `invalid_json` branch. Auth routes use `FormData`/`URLSearchParams`.
- **Fake Supabase** (optional `src/test/harness/fake-supabase.ts`): typed `Partial<SupabaseClient<Database>> as unknown as …` (mirrors how `tests/integration/setup/clients.ts` stays strict-lint-clean) exposing `.auth`, chainable `.from().select().eq()/.in()/.maybeSingle()/.single()`, `.upsert()` (capture payload), `.rpc()`.
- **No precedent**: existing unit tests (`src/lib/*.test.ts`) test pure helpers only; integration tests build real clients. Phase 3 is net-new ground. `no-console` is warn-only (handlers `console.error` on degrade paths — `vi.spyOn(console,…)` to keep output clean).
- **All target routes are pure handlers** — none call `next()`; `locals.user` is the only middleware-produced value, supplied directly by the fake context. The **middleware itself** (`onRequest`) is separately testable with a faked context + mocked `createClient`.

### R6 / R5 — route contract table (oracle = the contract, not the impl)

All JSON routes inline an identical `jsonResponse` helper + `UUID_RE` (duplicated, not shared — assert each route independently). All export `prerender = false`.

| Route | Validation → 400 | Auth/operator gate | Dependency-failure contract | Stub |
|---|---|---|---|---|
| **match-answer** (R5) | `invalid_json`; `invalid_request` (zod: question 1..4000, excludeMessageId uuid); `missing_lesson_id` | no user → `unauthenticated`/401 | **any throw (embed/RPC/course) → `{ok:true, match:null}`/200**, logged; null course → `{ok:true,match:null}`/200. **Never 500s the chat.** | createClient, `@/lib/services/answer-match`, `@/lib/embeddings` |
| **backfill** (R6) | bad batchSize falls back to 50 (no 400) | no user→401; `OPERATOR_USER_ID` unset→`backfill_disabled`/**503**; non-operator→`forbidden`/**403** | list RPC error → `list_failed`/**500** (fatal); per-row embed/set error → counted in `failed`, `continue` (non-fatal) | createClient, astro:env/server, embeddings, rpc |
| **submit** | `invalid_json`; `invalid_answers`; `missing_test_id` | no user→401 | `submit_test_attempt` error → `grade_failed`/**500** (fatal); **SRS upsert block try/catch → swallowed, still 200** | createClient, rpc, from/upsert, `@/lib/srs` |
| **grade** | `invalid_json`; `invalid_selection`; `missing_question_id` | no user→401 | `grade_question` error → `grade_failed`/500 (fatal); **reschedule upsert swallowed, still 200** | createClient, rpc, from/upsert, srs |
| **rate** | `invalid_json`; `invalid_rating` (int 1..4); `missing_lesson_id` | no user→401 | **load error → `load_failed`/500 (FATAL); upsert error → `save_failed`/500 (FATAL)** — opposite posture from grade/submit | createClient, from/maybeSingle/upsert, srs |
| **complete** (POST/DELETE) | `missing_lesson_id` | no user→401 | upsert/delete error → `save_failed`/`delete_failed`/500; idempotent (`onConflict user_id,lesson_id`; delete-missing = ok) | createClient, from/upsert/delete |
| **signin** (form) | zod → redirect `/auth/signin?error=…` | — | maps `email_not_confirmed`→`error=unconfirmed`; **success → `redirect(isSafeNext(next) ? next : "/")`** | createClient, auth.signInWithPassword |
| **signup** (form) | zod (password min 6) → redirect | — | no `next` param → no open-redirect surface | createClient, auth.signUp |
| **signout** | — | — | always `redirect("/")` even if unconfigured | createClient, auth.signOut |
| **resend** | `email` invalid → `{error}`/400 | — | **anti-enumeration: success / unknown / already-confirmed all → `{ok:true}`/200**; rate-limited → `{error:"rate_limited", retryAfterSeconds}`/**429**; unconfigured → `{ok:true}`/200 | createClient, auth.resend |
| **verify-otp** (form) | token `^\d{6}$`, email → redirect `error=format_invalid`/`email_invalid` | — | verify error → redirect `error=<code>` (otp_expired/invalid_otp); success → `/` | createClient, auth.verifyOtp |

**Cross-cutting `it.each` candidates** (every JSON route): no user → `unauthenticated`/401; missing param → `missing_*`/400; bad body → `invalid_json`/400; `createClient`→null → `supabase_not_configured`/500. Auth form routes (signin/signup/verify-otp) break the JSON pattern — assert **redirect Location + query params** instead.

### R7 — auth redirect / route-gating

- **Already covered (SKIP):** [`src/lib/safe-next.test.ts`](../../../src/lib/safe-next.test.ts) exhaustively tests `isSafeNext` — `//evil.com`, `/\evil.com`, absolute URLs, bare hosts, empty, non-strings. The regex `/^\/(?![/\\])/` ([`safe-next.ts:11`](../../../src/lib/safe-next.ts)) is fully pinned. **Do not add more `isSafeNext(...)` cases** (redundant-copies anti-pattern).
- **The gap is the WIRING, not the function:**
  1. **Signin success sink** ([`signin.ts:44`](../../../src/pages/api/auth/signin.ts)): `redirect(isSafeNext(next) ? next : "/")`. The single highest-value assertion — `next=//evil.com` → `/`, safe `next` → that path. A regression dropping the `isSafeNext` wrapper passes every existing test yet reopens the vuln (mutation-survivable line). Hermetic: stub `signInWithPassword`→`{error:null}`, assert `Location`.
  2. **Signin error-path `next` propagation** (signin.ts:23,30,40): unsafe `next` dropped, safe preserved across the four redirect sites.
  3. **Middleware gate** ([`src/middleware.ts:55-58`](../../../src/middleware.ts)): unauth + protected route → `redirect("/auth/signin?next=" + encodeURIComponent(pathname+search))`; authed or non-protected → `next()`. Hermetic: fake context + `vi.mock("@/lib/supabase")` so `getUser()` returns user/null.
  4. **`isProtectedRoute` boundary cases** ([`middleware.ts:5-15`](../../../src/middleware.ts)): `/dashboard*` prefix + three regexes (`/courses/x/tests/`, `/courses/x/practice`, `/courses/x/lessons/`). Cheapest as a **pure** test IF the function is exported (currently module-private).
- **Stale doc**: AGENTS.md says extend a `PROTECTED_ROUTES` array; the code uses `isProtectedRoute()` + regexes. The docs diverged — worth an AGENTS.md fix (out of test scope; note for the plan).

### Deferred SRS write-path (from Phase 2) — hermetic home

- **submit.ts 3-way enrol branch** ([`submit.ts:83-121`](../../../src/pages/api/tests/[testId]/submit.ts)): wrong → `applyRating(card ?? empty, 1/*Again*/)` enrol; correct WITH card → `applyRating(card, 3/*Good*/)`; **correct first-timer → `return []` (NOT enrolled)** — the load-bearing skip (line 109). Upsert only if `rows.length>0`, `onConflict user_id,question_id`, try/catch non-fatal.
- **grade.ts** ([`grade.ts:67-88`](../../../src/pages/api/practice/[questionId]/grade.ts)): always reschedules — correct→Good(3)/wrong→Again(1); **first-timer correct DOES enrol** (contrast with submit). Non-fatal.
- **rate.ts** ([`rate.ts:62-89`](../../../src/pages/api/reviews/[lessonId]/rate.ts)): raw 1..4 rating passed straight to `applyRating`; **load AND upsert errors are FATAL (500)** — opposite of grade/submit.
- **Already covered (SKIP):** [`src/lib/srs.test.ts`](../../../src/lib/srs.test.ts) pins FSRS math (reps increment, due ordering, fresh-card invariants). Phase 3 must NOT assert FSRS numbers.
- **Hermetic oracle = branch decision + session→user_id binding**, captured via a fake `.upsert()` that records its payload. Assert: correct-first-timer → no upsert (submit); wrong → one row, `user_id === session`, `reps ≥ 1`; rating mapping (spy `applyRating` args, correct→3/wrong→1); schedule failure non-fatal (submit/grade still 200) vs fatal (rate 500). NOT the FSRS output.

## Code References

- `src/pages/api/lessons/[lessonId]/match-answer.ts:36-72` — R5 degrade contract.
- `src/pages/api/embeddings/backfill.ts:35-86` — operator-gate ladder + per-row non-fatal.
- `src/pages/api/auth/{signin,resend,verify-otp}.ts` — redirect/anti-enumeration contracts.
- `src/pages/api/{tests/[testId]/submit,practice/[questionId]/grade,reviews/[lessonId]/rate}.ts` — SRS enrol branches.
- `src/lib/supabase.ts:3` — the `astro:env/client` import = the `vi.mock` seam.
- `src/lib/safe-next.ts` + `src/lib/safe-next.test.ts` — isSafeNext (already covered).
- `src/middleware.ts:5-60` — `isProtectedRoute` + gate/redirect.
- `src/lib/srs.ts` + `src/lib/srs.test.ts` — FSRS (already covered).
- `vitest.config.ts:16-19` — unit project, no astro:env resolution (tripwire).
- `src/test/stubs/cloudflare-workers.ts` — existing virtual-module stub precedent.

## Architecture Insights

- **The handler→`createClient` boundary is the universal seam.** Because every route gets its client the same way (and none read it off `locals`), one `vi.mock("@/lib/supabase")` pattern unlocks all of them — and incidentally bypasses the `astro:env` problem without aliasing. This is why Phase 3 needs no production change and no config change.
- **Posture asymmetry is the regression surface, not the happy path.** match-answer/submit/grade *swallow* dependency failures (degrade, still 200); rate/backfill-list/grade-RPC are *fatal* (500). The valuable tests pin which way each route fails — a "best-effort-ing" or "fatal-ing" mistake is exactly the regression hermetic tests catch.
- **R7's value moved from the function to the wiring.** The regex is pinned; the open-redirect risk now lives at the *call site* (signin:44) and the *middleware gate*. Test the wiring, not the regex.
- **SRS hermetic ≠ FSRS math.** The oracle is the enrol-branch decision + session binding (capture-the-upsert-payload), not scheduling numbers — those have a ts-fsrs oracle and are unit-covered.
- **Two tiny production-adjacent decisions for the plan:** (1) export `isProtectedRoute` to unit-test it purely (test-enablement, no behavior change) vs test via middleware context; (2) the stale AGENTS.md `PROTECTED_ROUTES` mention (doc fix, optional).

## Historical Context (from prior changes)

- `context/archive/2026-06-07-testing-access-control-rls/` — Phase 1 harness (integration); the `cloudflare:workers` stub + vitest project split this phase reuses.
- `context/archive/2026-06-07-testing-grading-srs-integration/` — Phase 2; **explicitly deferred the SRS scheduling write-path to this phase** (research Open Question #1). The grading RPC is integration-covered; the *handler enrol branches* are this phase.
- `context/archive/2026-06-07-ai-answer-matching/` — match-answer route + the F1 grant note (the SQL match is Phase-2 integration-covered; the *endpoint degrade contract* is R5 here).
- `context/foundation/lessons.md` — answer-key invariant; [[feedback-no-db-reset]] (n/a here — hermetic, no DB).

## Related Research

- `context/archive/2026-06-07-testing-grading-srs-integration/research.md` — the SRS-scoping correction that created this phase's SRS slice.
- `context/foundation/test-plan.md` §2 (R5/R6/R7), §3 Phase 3, §6 cookbook (Phase-3 TBD).

## Open Questions

1. **`vi.mock("astro:env/server")` on a bare specifier** — confirm in the harness phase that Vitest registers the mock without the real virtual module resolving. If not, fall back to an `astro:env/server` (and possibly `astro:env/client`) alias stub in the unit project, mirroring `cloudflare:workers`. This is the one residual harness risk; resolve it first.
2. **Export `isProtectedRoute`?** — exporting enables a cheap pure test of the route-boundary regexes; alternative is testing only via the full middleware context. Plan decides (lean: export — minimal, test-enabling).
3. **Scope breadth** — 11 routes + middleware + 3 SRS handlers is large. Plan should prioritize by signal (match-answer, backfill, resend, signin/middleware R7, the 3 SRS enrol branches) and decide how exhaustively to cover the lower-value routes (signout, signup, verify-otp, complete) — cross-cutting `it.each` makes the cheap ones nearly free.
