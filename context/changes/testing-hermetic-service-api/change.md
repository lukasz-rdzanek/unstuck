---
change_id: testing-hermetic-service-api
title: Hermetic service/API contract tests (test-plan Phase 3)
status: impl_reviewed
created: 2026-06-07
updated: 2026-06-07
archived_at: null
---

## Notes

Rollout **Phase 3** of `context/foundation/test-plan.md`: "Hermetic service/API tests" — **stubbed Supabase client + stubbed `cloudflare:workers` `env.AI` binding, no network, no Docker**. These run in the default `npm run test` (unit) project, NOT the integration project. This is a deliberate gear change from Phases 1–2 (which used the live local stack).

Risks covered:
- **R6** — service/API contract regressions: zod validation rejects bad input (400), error-degradation (e.g. the match endpoint returns `{match:null}` instead of 500ing the chat), operator gating on the backfill endpoint, best-effort/non-blocking posture.
- **R7** — auth open-redirect / session route-gating: `isSafeNext` rejects `//`, `/\`, absolute URLs (unit ✓ already); middleware redirects unauthenticated users off protected routes; signin maps errors to the right redirect.
- **R5 (match endpoint)** — the live `/api/lessons/[lessonId]/match-answer` route contract (degrade-to-`{match:null}`, two-layer gate), distinct from the SQL `match_lesson_answers` already covered in Phase 2.
- **Deferred SRS scheduling write-path** (from Phase 2): the practice/submit/reviews-rate handlers apply FSRS (`applyRating`) + upsert — invoke the handler with a stubbed client and assert the enrol branch (wrong→Again, correct-with-card→Good, correct-first-timer→not enrolled), session→user_id binding, due-advances. This is the hermetic home the Phase 2 research pointed to.

Risk response intent (prove via hermetic tests, oracle = the route/service contract NOT the implementation):
- Each route returns the right `{ok}`/`{error}` + HTTP status for: valid input, bad input (zod), unauthenticated, non-operator (where gated), and a failing dependency (degrade, never 500 the chat). Assert the contract, not the mock.
- Avoid over-mocking — stub only the seam (`createClient` / `astro:env` / `env.AI`), assert the handler's real branching, not that the mock was called.

Must challenge: "happy path returns 200 ⇒ done"; "mocking enough to make it green ⇒ it tests something". Avoid: asserting the mock instead of the handler; mirror tests; re-testing the `isSafeNext` regex only (already unit-covered) while ignoring the middleware gate.

Stack/seam: the unit project already aliases `cloudflare:workers` to a stub (`src/test/stubs/cloudflare-workers.ts`); Astro API routes export `GET/POST` handlers taking an `APIContext` — research must find how to invoke them hermetically (construct a Request + a stubbed `locals`/`createClient`). The `astro:env` seam is the open question (the unit vitest config does NOT resolve `astro:env/*`).

Next: research → plan → implement. After this phase, `/10x-test-plan` advances to Phase 4 (CI integration + Stryker).
