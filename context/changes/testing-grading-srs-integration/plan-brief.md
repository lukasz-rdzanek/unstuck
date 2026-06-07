# Grading & answer-matching integration tests (test-plan Phase 2) — Plan Brief

> Full plan: `context/changes/testing-grading-srs-integration/plan.md`
> Research: `context/changes/testing-grading-srs-integration/research.md`

## What & Why

Integration tests on the local Supabase stack that pin two correctness invariants via the real JWT path: **R3** quiz grading (`submit_test_attempt`) and **R5** answer-matching (`match_lesson_answers` cross-course isolation + `set_message_embedding` immutability). The code is already correct; these tests are regression armor so a future migration can't silently break grading math or leak answers across courses. Phase 2 of the `test-plan.md` rollout, reusing the Phase 1 harness.

## Starting Point

Production definer functions already enforce grading + matching. Phase 1 shipped `tests/integration/` (env discovery, client tiers, fixtures + cascade cleanup, prove-it-fails) and 32 access-control tests. `npm run test:integration` exists; `npm run test`/CI stay hermetic. No automated coverage of grading correctness or match isolation yet.

## Desired End State

`npm run test:integration` proves R3 + R5 (grading truth table, cross-course match fence, embedding immutability), each demonstrably able to fail; `npm run test`/CI unchanged; test-plan §6 gains the grading-oracle + crafted-vector recipes and §3 marks Phase 2 complete.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| SRS scheduling | **Deferred to Phase 3** | `grade_question` is read-only; scheduling lives in Astro handlers, not definer fns — not a clean integration target; FSRS math already unit-tested, `srs_*` RLS already covered by Phase 1 | Research |
| R3 oracle source | Seed test `f1…001` truth table **+** a zero-correct fixture question | Reuses a stable known oracle; the seed has no zero-correct question (a real grading branch) | Plan |
| R5(b) assertion scope | **Only** column-scope / null-only / single-row | F1: `set_message_embedding` has no per-call access gate today — asserting cross-course write-denial would fail against correct current behavior | Research |
| R5(a) match depth | Cross-course trap + enrolled control + threshold floor + exclude_message/author | Covers the isolation invariant AND the filters a regression would silently break; skips low-value seed-boost/cap ranking | Plan |
| Vectors | Crafted 768-dim literals (no Workers AI) | RPCs take `vector(768)` args; the seam is `toVectorLiteral`, so tests feed deterministic vectors | Research |
| Phase shape | Layered per-risk (5 phases) + prove-it-fails each | Mirrors the proven Phase 1 flow; independently committable/bisectable | Plan |

## Scope

**In scope:** fixture extensions (zero-correct question; 2nd/3rd free course + embedded trap message; NULL + pre-set embedding messages; vector helper); `grading.itest.ts`; `match-isolation.itest.ts`; `embedding-immutability.itest.ts`; §6 cookbook + §3 status.

**Out of scope:** SRS scheduling write-path (Phase 3 hermetic); cross-course embedding write-denial (deferred F1); production/migration/RLS changes; `pg` dep; Stryker/CI wiring (Phase 4); Workers AI / real embeddings; new committed seed data.

## Architecture / Approach

Reuse the Phase 1 harness; extend the shared fixture builder with grading + embedding fixtures. Each risk test authenticates as a real user and asserts against a hand-derived oracle: grading = a 6-row truth table read back from persisted `test_attempts`/`attempt_answers`; match isolation = "target course only, even when another course's message ranks higher" using crafted vectors; immutability = before/after column snapshot around `set_message_embedding`. Crafted vectors decouple R5 from Workers AI.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Fixture extensions | zero-correct question, 2 embedded-message courses, NULL+set messages, vector helper | char_length≥40 footgun; keeping existing suite green |
| 2. R3 grading | truth table + zero-correct + persistence assertions | oracle independence (not mirroring the SQL) |
| 3. R5(a) match isolation | cross-course trap + threshold + exclude filters | crafting vectors with the right relative cosine |
| 4. R5(b) embedding immutability | column-scope/null-only/single-row | not over-asserting the deferred F1 gate |
| 5. Cookbook & close-out | §6 recipe, §3 status complete | — |

**Prerequisites:** Local Supabase up (`npx supabase start`); Phase 1 harness (shipped).
**Estimated effort:** ~1–2 sessions across 5 phases (Phase 1 is the bulk; risk phases incremental).

## Open Risks & Assumptions

- Crafted-vector cosine ordering must be verified empirically (the trap must actually rank higher than courseA's message) — a fixture-tuning step in Phase 3.
- Fixture embedded messages must have `body` length ≥ 40 or `match_lesson_answers` drops them.
- SRS write-path stays uncovered until Phase 3 (accepted).

## Success Criteria (Summary)

- Grading scores/passed/per-question match an independent truth table (incl. zero-correct, foreign-id, superset/partial), verified on the persisted rows — and a test demonstrably fails if an expectation is inverted.
- `match_lesson_answers(courseA)` never returns another course's message even when it ranks higher; threshold + exclude filters hold.
- `set_message_embedding` changes only `embedding`, only from NULL, only the target row.
