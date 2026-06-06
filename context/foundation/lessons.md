# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Quiz answer-key protection — enable-not-force RLS + definer-owned functions

- **Context:** `question_options.is_correct` (the quiz answer key) — `supabase/migrations/20260606170000_tests_schema.sql`. Learner reads of options go through `get_test_questions` / `get_due_practice_questions`; grading through `submit_test_attempt` / `grade_question`.
- **Problem:** The answer key is protected by a non-obvious, load-bearing invariant: `question_options` has RLS **ENABLED but NOT FORCED**, with **no `authenticated`/`anon` SELECT policy** — so learners are denied direct reads while the `SECURITY DEFINER` functions (owned by `postgres` = the table owner) bypass RLS to read `is_correct`. A future migration that adds an `authenticated` SELECT policy on `question_options`, recreates those functions under a non-owner role, exposes `is_correct` via a view/embed, or adds `FORCE`, would silently **leak the answer key** (or break grading).
- **Rule:** Keep `question_options` RLS **ENABLE-only** (never `FORCE`, never an `authenticated`/`anon` SELECT policy). Learner option-reads must go through the definer functions that omit `is_correct`; grading stays inside the definer functions. Any change to `question_options` or the test/practice grading functions must preserve owner-owned `SECURITY DEFINER` + no-authenticated-SELECT.
- **Applies to:** future migrations/refactors touching `question_options`, the quiz grading/taking `SECURITY DEFINER` functions, or any new answer-bearing tables. See [[unstuck-production]] for the prod deploy path and [[feedback-no-db-reset]] for migration hygiene (`migration up`, never `db reset`).
