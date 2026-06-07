# Access-control & answer-key integration tests — Plan Brief

> Full plan: `context/changes/testing-access-control-rls/plan.md`
> Research: `context/changes/testing-access-control-rls/research.md`

## What & Why

Build integration tests on the local Supabase stack that pin three security invariants of the Unstuck quiz/course platform — the answer key never leaks (R1), no cross-user data access (R2), gated courses stay gated (R4) — exercised through the real GoTrue→PostgREST JWT path. The code is already correct; these tests are **regression armor** so a future migration can't silently undo a load-bearing security invariant (the answer-key invariant is one `create policy` from breaking, and nothing currently fails if it does).

## Starting Point

Production RLS + `SECURITY DEFINER` functions already enforce all three invariants. Test infra is sparse: a hermetic Vitest unit run (`npm run test`, which CI runs) and a local-only Playwright e2e. A manual `supabase/tests/rls_matrix.sql` probe exists but is un-run and tests at the `set role` layer, not the JWT path. No automated coverage of RLS-as-a-real-user exists yet.

## Desired End State

`npm run test:integration` proves R1/R2/R4 against a running local stack (failing fast with a readable message if it's down), while `npm run test`/CI stay hermetic and Docker-free. Each risk test has been proven able to fail; `rls_matrix.sql` is retired into the suite; test-plan §6 has a reusable harness recipe and §3 marks Phase 1 complete.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Harness shape | Separate Vitest `integration` project, `tests/integration/**/*.itest.ts` | Keeps `npm run test`/CI hermetic while sharing the `@`/`cloudflare:workers` aliases | Research |
| Auth seam | service_role for setup/teardown; anon-key + `signInWithPassword` JWT client for assertions | The risks need the real RLS-as-user path, not `set role` impersonation | Research |
| Phase decomposition | Layered per-risk (harness → R1 → R2 → R4 → close-out) | Each risk is independently nameable, committable, bisectable | Plan |
| State isolation | Per-run unique-id fixtures + FK-ordered service_role cleanup (no `pg`) | Zero new deps, reliable for read-denial assertions; never `db reset` | Plan |
| Already-correct code | `/10x-implement` + a "prove-it-fails" step per risk (break → red → revert) | Classic TDD red phase doesn't apply to characterization tests; this guards against vacuous green | Plan |
| `rls_matrix.sql` | Port its cells into the suite, then delete | Single automated source of truth (change.md: "fold/replace where it overlaps") | Plan |
| R1 probe breadth | All three paths: raw table, PostgREST embed, RPC payload | Each is a distinct way the answer key could leak; the invariant is high-stakes | Plan |

## Scope

**In scope:** Vitest project split + scripts; env/client/fixture/cleanup helpers; three risk `*.itest.ts` (R1/R2/R4) + a smoke test; cookbook entry; retiring `rls_matrix.sql`; status sync.

**Out of scope:** Any production/migration/RLS change; grading correctness & embedding immutability (Phase 2); hermetic stub-client service/API tests (Phase 3); CI wiring + Stryker (Phase 4); adding `pg`; committing new seed data.

## Architecture / Approach

A `globalSetup` discovers `{url, anonKey, serviceRoleKey}` from `npx supabase status -o json` and fails fast if the stack is down. A per-run fixture builder (service_role) mints two login-capable learners + a gated course and enrolls one; cleanup tears it down FK-ordered. Each risk test authenticates as a real user (JWT) and asserts denial against a hand-derived oracle (the seed answer key; the ownership/enrollment contract), with a control path proving the denial is scoped, not blanket.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Harness & fixtures | `integration` project, env/clients/fixtures/cleanup, smoke test, `test:integration` | Getting the project split right without disturbing the unit/CI run |
| 2. R1 — answer-key | Probe raw table + embed + RPC; prove-it-fails | Embed-probe shape (errors vs no-rows) — assertion written tolerant |
| 3. R2 — IDOR | Cross-user denial + own-path control + message surface | Not falsely asserting message read-denial (it's course-gated) |
| 4. R4 — course gate | Gated denial across tables+RPCs + enrolled control | Needs the gated fixture; enrolled control proves the gate |
| 5. Cookbook & close-out | §6 recipe, delete `rls_matrix.sql`, §3 status | Ensuring every old probe cell has a home before deleting |

**Prerequisites:** Local Supabase up (`npx supabase start`) with seed; `@supabase/supabase-js` (already installed).
**Estimated effort:** ~2–3 sessions across 5 phases (Phase 1 is the bulk; risk phases are incremental).

## Open Risks & Assumptions

- Cleanup must be FK-ordered and idempotent so an aborted run self-heals on the next run.
- The PostgREST embed for R1(b) may either error or return no option rows depending on relationship exposure — the assertion is written to accept both.
- These tests require the local stack; they are deliberately **not** in CI until Phase 4.

## Success Criteria (Summary)

- A learner (real JWT) gets zero `is_correct` from raw table, embed, and RPC — and the test demonstrably fails if an authenticated SELECT policy is added.
- User B is denied user A's own-only rows (and the message foreign-author INSERT), while B's own path works.
- A non-enrolled user is denied gated-course tables + RPCs (`no_access`), while the enrolled control succeeds.
