---
change_id: testing-access-control-rls
title: Access-control & answer-key integration tests (test-plan Phase 1)
status: archived
created: 2026-06-07
updated: 2026-06-07
archived_at: 2026-06-07T14:43:43Z
---

## Notes

Rollout **Phase 1** of `context/foundation/test-plan.md`: "Access-control & answer-key integration" — **integration tests on the local Supabase stack**.

Risks covered:
- **R1** — a learner reads the quiz answer key (`question_options.is_correct`) via direct REST or a PostgREST embed.
- **R2** — cross-user (IDOR): user A reads/writes user B's `test_attempts` / `attempt_answers` / `messages` / `srs_*` / `lesson_completions`.
- **R4** — `has_course_access` bypass: gated/paid-course content reachable by a non-enrolled user.

Risk response intent (prove via integration tests, oracle = product behavior NOT the SQL):
- An authenticated non-operator client gets **zero** `is_correct` from every read path — raw `question_options` SELECT, a PostgREST embed/join, and the taking RPC (`get_test_questions`). Also assert `get_test_questions` / `match_lesson_answers` omit `is_correct`.
- A **second** seeded user cannot SELECT or UPDATE another user's own-only rows (attempts/answers/messages/SRS/completions); the only write path is the definer functions.
- A **gated-course fixture** (non-free course, no enrollment) denies a non-enrolled user lessons/messages/tests and returns no match from `match_lesson_answers`.

Must challenge: "logged in ⇒ owns the row"; "no authenticated SELECT policy on question_options stays true"; "all courses are free so gating is fine" (create the gated fixture). Avoid: asserting only the happy own-row/free-course path; oracle copied from the SQL.

Setup: local Supabase (`npx supabase start`); seed operator + two learners + a gated course; auth via gotrue tokens (REST) and/or psql via the `supabase_db_*` container; never `supabase db reset`. Fold/replace the manual `supabase/tests/rls_matrix.sql` probe where it overlaps.

Next: research → plan → implement (use `/10x-tdd` for test-first sub-phases). After this phase, `/10x-test-plan` advances to Phase 2 (grading/SRS).
