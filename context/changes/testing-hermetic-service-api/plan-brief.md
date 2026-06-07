# Hermetic service/API contract tests (test-plan Phase 3) — Plan Brief

> Full plan: `context/changes/testing-hermetic-service-api/plan.md`
> Research: `context/changes/testing-hermetic-service-api/research.md`

## What & Why

Hermetic unit tests (no network/Docker/live stack) of the Astro API routes + middleware, pinning their contracts: R6 (validation, gating, graceful-degradation posture), R7 (auth open-redirect / route-gating wiring), R5 (the match *endpoint*'s degrade contract), and the SRS enrol-branch logic deferred from Phase 2. The code is already correct; these are regression armor at the layer Phases 1–2 couldn't reach. Phase 3 of the `test-plan.md` rollout.

## Starting Point

Phases 1–2 shipped 49 **integration** tests against the live local Supabase stack. There is **zero** coverage of the API route handlers, the middleware gate, or the auth redirect logic. `isSafeNext` and FSRS math are already unit-tested. No precedent exists for invoking Astro handlers in a test.

## Desired End State

`npm run test` (the hermetic, CI-safe unit project) includes route/middleware/SRS tests proving each contract — degrade-to-`{match:null}`, the backfill operator-gate ladder, resend anti-enumeration, the signin open-redirect sink, the middleware gate, and the SRS enrol branches — each demonstrably able to fail. A reusable `makeApiContext` harness exists; test-plan §6 documents it.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Handler stub seam | `vi.mock("@/lib/supabase")` | Bypasses the unresolved `astro:env/client` import AND supplies the fake client every assertion needs | Research |
| astro:env risk | vi.mock first, **alias-stub fallback** | The bare-specifier mock for `astro:env/server` (backfill) may not register; Phase 1 verifies, falls back if needed — keeps the unit tripwire intact | Research/Plan |
| Scope breadth | High-signal depth + cross-cutting `it.each` | match-answer/backfill/resend/signin/middleware/SRS get depth; trivial routes get cheap baseline coverage | Plan |
| R7 focus | The **wiring** (signin sink + middleware gate), not the regex | `isSafeNext` is already exhaustively unit-tested — re-testing it is a vibe-test | Research |
| isProtectedRoute | **Export** + pure boundary test | Cheapest, highest-density R7 test; export is test-enablement, no behavior change | Plan |
| SRS oracle | Capture-the-upsert-payload (branch + session→user_id) | FSRS math is unit-covered; the value is the enrol-branch decision, not the numbers | Research |
| Stale AGENTS.md | Fix in close-out | The doc's `PROTECTED_ROUTES` array mention diverged from the code's `isProtectedRoute()` | Plan |
| Phase shape | Layered by risk (5 phases) + prove-it-fails | Mirrors the proven Phases 1–2 flow | Plan |

## Scope

**In scope:** `makeApiContext` + fake-Supabase harness; R6 tests (match-answer, backfill, resend, cross-cutting contract sweep, swallow-vs-fatal posture); R7 (signin sink, middleware gate, isProtectedRoute export+test); SRS enrol branches (submit/grade/rate); §6 cookbook; AGENTS.md fix.

**Out of scope:** re-testing isSafeNext / FSRS math; integration/live-stack; CI wiring + Stryker (Phase 4); handler client-injection refactor; exhaustive coverage of trivial routes.

## Architecture / Approach

`vi.mock("@/lib/supabase")` replaces the client at the module boundary (also dodging `astro:env`); a `makeApiContext()` factory builds the thin `APIContext` slice handlers read; a fake-Supabase builder captures `.upsert()` payloads and configures `.rpc()`/`.auth` outcomes. Tests assert the **contract** (status + shape + redirect Location + which branch ran), never the mock. Co-located as `src/pages/api/**/*.test.ts` + `src/middleware.test.ts`, running in the existing unit project.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Harness | makeApiContext + fake-supabase + **astro:env mock verified** | The bare-specifier mock — verified first, alias fallback |
| 2. R6 contracts | match-answer degrade, backfill gate, resend anti-enum, cross-cutting sweep | Asserting the mock vs the handler's real branching |
| 3. R7 | signin open-redirect sink + middleware gate + isProtectedRoute | Faking enough APIContext for middleware without over-building |
| 4. SRS branches | submit 3-way / grade / rate enrol logic via captured upserts | Not re-testing FSRS math |
| 5. Cookbook & close-out | §6 recipe, AGENTS.md fix, §3 status | — |

**Prerequisites:** none beyond the repo (hermetic — no stack). Phases 1–2 harness is reference, not a dependency.
**Estimated effort:** ~2 sessions across 5 phases (Phase 1 de-risks the harness; risk phases are incremental).

## Open Risks & Assumptions

- `vi.mock("astro:env/server")` on a bare specifier may not register — Phase 1 verifies; alias-stub fallback ready.
- The fake-Supabase builder must cover each route's call shape; keep it minimal-but-sufficient to avoid asserting the mock.
- Middleware testing needs a faked `APIContext` (url/locals/redirect/cookies) — heavier than pure-handler tests.

## Success Criteria (Summary)

- match-answer returns `{match:null}`/200 (never 500) when its dependency throws — and a test fails if that degrades to a 500 expectation.
- backfill enforces 401→503→403→200; resend never reveals email existence; the signin sink sends `next=//evil.com` to `/`.
- submit does NOT enrol a correct first-timer; grade/rate map ratings correctly; rate treats DB errors as fatal — all via captured upsert payloads, with FSRS math untouched.
