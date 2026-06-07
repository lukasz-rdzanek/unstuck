---
change_id: testing-grading-srs-integration
title: Grading & SRS integration tests (test-plan Phase 2)
status: archived
created: 2026-06-07
updated: 2026-06-07
archived_at: 2026-06-07T15:42:22Z
---

## Notes

Rollout **Phase 2** of `context/foundation/test-plan.md`: "Grading & SRS integration" — **integration tests on the local Supabase stack**, reusing the Phase 1 harness (`tests/integration/`, see test-plan §6 cookbook).

Risks covered:
- **R3** — quiz grading wrong: `submit_test_attempt` all-or-nothing / sorted-set equality / single-vs-multi / zero-correct / cross-question option ids.
- **R5** — answer-matching leaks across courses, or `set_message_embedding` mutates a message body / author (immutability breach).
- **R2** (attempts/SRS own-only) — reinforced under the grading + SRS-scheduling lens.

Risk response intent (prove via integration tests, oracle = product behavior NOT the SQL):
- Scores match an **independent** hand-computed truth table per answer set: multi-correct exact-set match, partial selection fails, empty selection fails, a question with zero correct options is never "correct", foreign/cross-question option ids are ignored. Assert the persisted `test_attempts.score`/`passed` AND the per-question rows, not just the RPC return.
- `match_lesson_answers` never returns a row from another course; `set_message_embedding` changes only `embedding`, only when NULL, and never `body`/`author_id`.
- SRS scheduling (`grade_question` / the FSRS rate path) advances state per an independent expectation (e.g. a correct answer pushes `due` forward; reps/lapses move as the algorithm dictates) — oracle from FSRS/PRD, not from re-reading the row.

Must challenge: "final status 200 ⇒ graded right"; set-equality vs subset; "definer fn = safe" (cross-course join leak); "the column scope holds" without attempting to overwrite body. Avoid: oracle copied from the SQL; happy-path single-correct only; trusting `set_message_embedding`'s column scope without an overwrite attempt.

Reuse: Phase 1 harness — `tests/integration/setup/{supabase-env,clients,fixtures}.ts`, `npm run test:integration`, per-run fixtures + cascade cleanup, prove-it-fails discipline, never `supabase db reset`. New fixtures likely needed: a second course for cross-course match isolation; messages with embeddings for the match/immutability tests.

Next: research → plan → implement (use `/10x-tdd` for test-first sub-phases where the first red assertion is nameable). After this phase, `/10x-test-plan` advances to Phase 3 (hermetic service/API tests).
