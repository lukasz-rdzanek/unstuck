# Course Learning Loop (Tests + Summary + Spaced Re-quizzing) Implementation Plan

## Overview

Build the `LEARN → REVIEW → TEST` learning loop on Unstuck. **Tests** are graded multiple-choice quizzes (2–6 options per question, single or multiple correct, all-or-nothing grading, a percentage score against an author-set pass threshold, unlimited retakes with stored attempts) attachable to a **chapter** (end of part) or a **course** (end of course). **Review** is an author-written **summary** shown as an optional pre-test recap. **Spaced re-quizzing** re-points the existing FSRS engine at the *questions a learner got wrong*, auto-graded from correctness. Tests ship first because they define the question/answer model the rest depends on.

## Current State Analysis

- **No quiz/test concept exists** — the question/option/answer/attempt model is net-new.
- **Attach points exist**: `chapters (id, course_id, slug, title, position)` and `courses` — a `tests` table keyed by `course_id` + nullable `chapter_id` covers both end-of-part and end-of-course tests.
- **Author model**: no author UI (instructor role deferred per PRD); content is **operator-seeded via SQL** (the established pattern — chat seeds, `docs/operator/*` recipes) with writes restricted to `service_role` by RLS.
- **Security precedent**: a `SECURITY DEFINER` helper (`has_course_access`) already gates chat RLS — the same mechanism protects quiz answers (below).
- **Write/read patterns** (from `spaced-repetition-review` this session): API routes with `export const prerender = false` + zod + `context.locals.user`; read-only services `(supabase, …ids, userId)`; own-only RLS via `auth.uid()`; optimistic islands; `migration up` (never `db reset`) locally; `.dev.vars` prod-build gotcha; types via `npx supabase gen types typescript --local`.
- **FSRS engine already built** (`spaced-repetition-review`): `src/lib/srs.ts` (`emptyCardFields`, `applyRating`, card↔row mapping) + `srs_review_state` + `/api/reviews/rate`. The helper is card-shape-agnostic, so it re-applies to a question-scoped card table. The card PK is `(user_id, lesson_id)` → re-quizzing needs a new `(user_id, question_id)` table.

## Desired End State

An operator seeds a test (questions + options + a summary) on a chapter or course. A signed-in learner sees a "Review & test" entry there, optionally reads the summary, takes the quiz (radios for single-answer, checkboxes for multi), submits, and sees their **score + pass/fail** with per-question right/wrong feedback — and can retake. Questions they miss are scheduled by FSRS and resurface on a per-course "practice" surface until they stick. **Answer keys never reach the browser.** Verify: take a test → score is correct for single + multi questions → wrong questions appear in practice, scheduled forward when answered correctly; a second user can't read another's attempts; the answer key is absent from all client payloads.

### Key Discoveries:

- **Answer-leak risk is the load-bearing security constraint**: `question_options.is_correct` must never be SELECT-able by learners. Grading + taking-reads go through `SECURITY DEFINER` functions (like `has_course_access`), so the key stays in Postgres.
- `tests`/`chapters`/`courses` give a clean attach model; `test_attempts` + per-question correctness feed re-quizzing.
- The FSRS helper (`src/lib/srs.ts`) is reusable as-is for question cards — only a new state table + auto-grade mapping (correct→Good, wrong→Again) are new.

## What We're NOT Doing

- No author/instructor UI — tests are operator-seeded via SQL (PRD non-goal).
- No hard gating — pass/fail is informational; it does not lock lessons/chapters.
- No partial credit — multi-correct questions are all-or-nothing.
- No AI-generated summaries or AI question generation (operator-authored markdown only).
- No timed tests, no question/option shuffling, no per-question explanations beyond right/wrong (v1).
- No migration of the paused lesson-level `srs_review_state` data — re-quizzing starts fresh at the question level; the interim lesson-review UI is retired in Phase 3.

## Implementation Approach

Bottom-up, Tests first. Phase 1 lays the schema + secure grading (the model). Phase 2 is the learner-facing quiz + summary. Phase 3 re-points FSRS at wrong questions. Phase 4 ships. Phases 1–2 are a coherent shippable unit (Tests); Phase 3 is a follow-on.

## Critical Implementation Details

- **Answer key must never reach the client.** `question_options.is_correct` is sensitive. Base tables `questions`/`question_options` get **no `authenticated` SELECT**; learners read taking-data (options *without* `is_correct`) through a `SECURITY DEFINER` function (or a definer view exposing only `id, question_id, body, position`), and grading runs in a `SECURITY DEFINER` function `submit_test_attempt(test_id, answers)` that reads `is_correct`, computes the score, writes the attempt, and returns score/passed + per-question correctness (+ correct-option ids for post-submit feedback). This mirrors the existing `has_course_access` definer pattern. `tests` (title/summary/threshold) and `questions` (prompt/multi/position) are non-sensitive and may be exposed gated by course access.
- **All-or-nothing grading**: a question is correct iff the learner's selected option set equals the correct set exactly (compare as sets, server-side).

## Phase 1: Tests — schema + grading (backend)

### Overview
The relational test model + secure, server-side grading + a seeded sample test.

### Changes Required:

#### 1. Schema migration
**File**: `supabase/migrations/<ts>_tests_schema.sql` (new; apply via `migration up`)
**Intent**: The test/question/option/attempt model.
**Contract**:
- `tests(id, course_id→courses, chapter_id→chapters NULL, slug, title, summary_md NULL, pass_threshold numeric not null default 0.80 check 0..1, created_at, updated_at)`, `unique(course_id, slug)`. `chapter_id NULL` = course-level test.
- `questions(id, test_id→tests cascade, prompt text, multi boolean not null default false, position int, unique(test_id, position))`.
- `question_options(id, question_id→questions cascade, body text, is_correct boolean not null default false, position int, unique(question_id, position))`.
- `test_attempts(id, user_id→auth.users cascade, test_id→tests cascade, score numeric not null, passed boolean not null, created_at)`.
- `attempt_answers(attempt_id→test_attempts cascade, question_id→questions, is_correct boolean not null, selected_option_ids uuid[] not null, primary key(attempt_id, question_id))` — the per-question signal for re-quizzing.
- **RLS**: enable+force all. `tests`/`questions` → `authenticated` SELECT gated by course access (reuse `has_course_access`). `question_options` → **no authenticated SELECT** (service_role + definer only). `test_attempts`/`attempt_answers` → own-only SELECT (insert is done by the definer grading fn). Authoring writes everywhere → service_role only.

#### 2. Secure read + grade functions
**File**: same migration (or a sibling `_tests_functions.sql`)
**Intent**: Keep the answer key in Postgres; expose only safe taking-data and graded results.
**Contract**: `get_test(p_slug text)` `SECURITY DEFINER` → returns the test (title, summary_md, pass_threshold) + its questions + options **without `is_correct`**, only if `has_course_access(course)`. `submit_test_attempt(p_test_id uuid, p_answers jsonb)` `SECURITY DEFINER` → grades all-or-nothing per question, computes `score`, `passed = score >= pass_threshold`, inserts `test_attempts` + `attempt_answers` for `auth.uid()`, returns `{ score, passed, perQuestion:[{questionId, isCorrect, correctOptionIds}] }`. Both `revoke execute … from public` then `grant execute … to authenticated`.

#### 3. Submit API route
**File**: `src/pages/api/tests/[testId]/submit.ts` (new)
**Intent**: Project-convention write path wrapping the grading RPC.
**Contract**: `prerender = false`; `POST`; resolve `context.locals.user` (401); zod-validate `{ answers: Record<questionId, optionId[]> }`; call `supabase.rpc("submit_test_attempt", …)`; return its JSON result (or `{error}`); no throws.

#### 4. Types + seed sample test
**Files**: `src/lib/db/database.types.ts`, `src/types.ts`, `supabase/seed.sql`
**Intent**: Surface the new tables; give the test course a real test to exercise.
**Contract**: Regen types; add `Test`/`Question`/`QuestionOption`/`TestAttempt` aliases. Seed one chapter-level + (optionally) one course-level test on the seed course with a mix of single- and multi-correct questions, 2–6 options each, and a `summary_md`.

### Success Criteria:
#### Automated Verification:
- Migration applies: `supabase migration up`
- Types regenerated with no further diff
- `npx astro check` 0 errors · `npm run lint` 0 errors · `npm run build` succeeds

#### Manual Verification:
- `select is_correct` on `question_options` as an authenticated (anon-key) client returns **no rows / permission denied** (answer key protected).
- Calling `submit_test_attempt` with a known-correct answer set returns `score = 1, passed = true`; a wrong/partial multi answer scores that question 0 (all-or-nothing); an attempt row + per-question rows are written for the caller only.
- A second user cannot read the first user's `test_attempts`.

**Implementation Note**: pause for manual confirmation before Phase 2.

## Phase 2: Tests — quiz UI + Review summary

### Overview
The learner-facing test: optional pre-test summary → quiz → graded result → retake; entry points on course + chapters.

### Changes Required:

#### 1. Reviews/tests service
**File**: `src/lib/services/tests.ts` (new)
**Intent**: Read-side helpers via the definer functions.
**Contract**: `getTestForTaking(supabase, slug)` → wraps `get_test` RPC (test meta + questions + options sans `is_correct`); `listTestsForScope(supabase, courseId, chapterId|null)` or `getTestForChapter/Course` to drive entry points (uses the `authenticated`-gated `tests` SELECT). Read-only, error → null/[].

#### 2. Test route + summary step
**File**: `src/pages/courses/[slug]/tests/[testSlug].astro` (new)
**Intent**: Render the test; show the summary first when present.
**Contract**: Protected (extend middleware: `/courses/[^/]+/tests/`). Load via `getTestForTaking`; render `summary_md` (→ `renderMarkdown`, server-side) as an optional "Review before you start" panel with a "Start test" affordance; pass the questions to `<TestQuiz client:load>`. Conditional-render (no top-level `return` — Astro ESLint parser limitation learned this session).

#### 3. Quiz island
**File**: `src/components/test/TestQuiz.tsx` (new)
**Intent**: Answer → submit → graded result → retake.
**Contract**: Props = questions (`{id, prompt, multi, options:[{id, body}]}`) + testId + passThreshold. Radio inputs for `multi=false`, checkboxes for `multi=true`. Submit `POST /api/tests/<testId>/submit`; render score + pass/fail badge + per-question right/wrong (highlight correct options from the result). "Retake" resets local state. Optimistic-free (submit is a real grade); inline error on failure. Cosmic tokens + `cn()`.

#### 4. Entry points
**Files**: `src/pages/courses/[slug]/index.astro`, course chapter rendering
**Intent**: Surface tests where they attach.
**Contract**: On the course page, when a course-level test exists → a "Review & test" button; per chapter that has a test → a chapter "Take the test" link. Both → `/courses/<slug>/tests/<testSlug>`.

### Success Criteria:
#### Automated Verification:
- `npx astro check` 0 · `npm run lint` 0 · `npm run build` ✓
- `/courses/<slug>/tests/<slug>` gated (unauth → redirect)
- Client payload audit: the served test page + island chunk contain **no `is_correct`** field

#### Manual Verification:
- Single- and multi-correct questions render correctly (radio vs checkbox); submitting yields the right score + pass/fail; per-question feedback marks correct options; retake works.
- The summary shows before the test when authored and is skippable.
- Entry points appear on the course page and on a chapter with a test; light/dark + responsive hold.

**Implementation Note**: pause for manual confirmation before Phase 3. (Phases 1–2 are a shippable "Tests" unit — Phase 4 can ship here if you choose to defer re-quizzing.)

## Phase 3: Spaced re-quizzing

### Overview
Re-point FSRS at missed questions; auto-grade from correctness; a per-course practice surface. Retire the interim lesson-review UI.

### Changes Required:

#### 1. Question-scoped FSRS state
**File**: `supabase/migrations/<ts>_srs_question_state.sql` (new)
**Intent**: Per-user FSRS card per question (mirror of `srs_review_state`, question-keyed).
**Contract**: `srs_question_state(user_id→auth.users, question_id→questions, <FSRS card cols: due, stability, difficulty, scheduled_days, learning_steps, reps, lapses, state, last_review>, created_at, updated_at, primary key(user_id, question_id))`; own-only SELECT/INSERT/UPDATE RLS; index `(user_id, due)`. Types regen.

#### 2. Auto-schedule on submit
**File**: `src/pages/api/tests/[testId]/submit.ts` (extend) + reuse `src/lib/srs.ts`
**Intent**: Feed the spaced schedule from the graded attempt.
**Contract**: After grading, for each **wrong** question upsert/enrol its `srs_question_state` card and `applyRating(card, Again)`; for each correct question that already has a card, `applyRating(card, Good)`. (Correctness → grade mapping; no self-rating.) Best-effort/non-fatal, like the prior enrol.

#### 3. Practice surface
**Files**: `src/lib/services/tests.ts` (due-questions query), `src/pages/courses/[slug]/practice.astro` (new), `src/components/test/PracticeSession.tsx` (new or reuse `TestQuiz` in practice mode)
**Intent**: Answer due questions; auto-grade reschedules them.
**Contract**: Due-questions service `(supabase, userId, courseId, now)` joining `srs_question_state` → `questions` (course-scoped, `due <= now`). Practice page (protected) presents due questions one at a time; answering grades via the definer fn (or a lightweight `grade_question` path) and reschedules. Entry: a "Practice N due" link on the course page (next to the test entry).

#### 4. Retire interim lesson-review
**Files**: `src/pages/courses/[slug]/review.astro`, `src/components/review/ReviewSession.tsx`, `complete.ts` enrol, `lessons.review_format` usage
**Intent**: Remove the superseded lesson-recall UI.
**Contract**: Remove the lesson `/review` route + island + the completion-enrol; decide `srs_review_state` + `review_format` disposition (drop via migration or leave dormant — note the choice). `courses.review_enabled` may be repurposed as "has learning-loop content" or dropped.

### Success Criteria:
#### Automated Verification:
- Migration applies; types regen no-diff; `astro check` 0 · lint 0 · build ✓
- `/courses/<slug>/practice` gated

#### Manual Verification:
- Failing questions on a test appear in that course's practice queue; answering correctly schedules them forward (Good), wrong keeps them near-term (Again).
- The old lesson `/review` surface is gone with no dangling links/errors.

**Implementation Note**: pause for manual confirmation before Phase 4.

## Phase 4: Ship

### Overview
Record on roadmap/Linear, push migrations to prod, deploy.

### Changes Required:

#### 1. Roadmap + Linear
**File**: `context/foundation/roadmap.md` (+ Linear)
**Contract**: Add a roadmap slice (next `S-` id, `Change ID: learning-loop`) + a Linear issue (e.g. UNS-23) for the learning loop; mark in progress; close at archive.

#### 2. Prod migrations + deploy
**File**: (runbook)
**Contract**: `supabase db push` (tests schema + functions + srs_question_state) to prod (`rhcioqeawpbuylbmkxnr`); then the prod build gotcha (`mv .dev.vars` aside → prod-env `npm run build` → leak-check zero `127.0.0.1` + prod ref present → `npx wrangler deploy` → restore `.dev.vars`); seed/author at least one prod test via operator SQL.

### Success Criteria:
#### Automated Verification:
- `supabase db push` succeeds · leak-check zero 127.0.0.1 · `wrangler deploy` succeeds

#### Manual Verification:
- Prod: take a seeded test → correct score + pass/fail; practice surfaces missed questions; `/` + `/courses` → 200.

**Implementation Note**: final phase — gated prod actions; confirm before `supabase db push` and `wrangler deploy`.

## Testing Strategy

### Manual Testing Steps
1. Seed a test (single + multi questions, a summary); confirm `is_correct` is unreadable by the anon client.
2. Take it: verify single/multi rendering, all-or-nothing scoring, score + pass threshold, per-question feedback, retake.
3. Summary shows before the test, skippable.
4. Miss a question → it appears in practice → answer right → reschedules forward.
5. RLS: second user can't read attempts.
6. Prod smoke after deploy.

(No automated test framework in this repo yet — success criteria are type-check/lint/build + the manual steps + the answer-key-protection check.)

## Performance Considerations

Grading is a single definer-function round-trip. The due-questions practice query is indexed `(user_id, due)`. Test/quiz code loads only on the test/practice routes.

## Migration Notes

Additive: `tests`, `questions`, `question_options`, `test_attempts`, `attempt_answers`, two functions (Phase 1); `srs_question_state` (Phase 3). Phase 3 retires the interim lesson-review (`srs_review_state`/`review_format` disposition decided there). Rollback = drop new tables/functions + revert routes.

## References

- Change identity + agreed model: `context/changes/learning-loop/change.md`
- FSRS engine to reuse: `src/lib/srs.ts`, `supabase/migrations/20260606140000_srs_review_state.sql` (paused `spaced-repetition-review`)
- Definer-RLS precedent: `has_course_access` (`supabase/migrations/20260528140054_lesson_chat_rls.sql`)
- Write-path + attach points: `src/pages/api/lessons/[lessonId]/complete.ts`, `chapters`/`courses` schema
- Deploy + `.dev.vars` gotcha: production memory `unstuck-production`; never `db reset` (memory `feedback-no-db-reset`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Tests — schema + grading (backend)

#### Automated
- [x] 1.1 Migration applies: `supabase migration up` — cfed7bc
- [x] 1.2 Types regenerated with no further diff — cfed7bc
- [x] 1.3 Type check passes: `npx astro check` — cfed7bc
- [x] 1.4 Lint passes: `npm run lint` — cfed7bc
- [x] 1.5 Build succeeds: `npm run build` — cfed7bc

#### Manual
- [x] 1.6 `question_options.is_correct` unreadable by an authenticated/anon client (answer key protected) — cfed7bc
- [x] 1.7 `submit_test_attempt` grades correctly (single + all-or-nothing multi); writes own attempt + per-question rows — cfed7bc
- [x] 1.8 RLS: a second user cannot read another's test_attempts — cfed7bc

### Phase 2: Tests — quiz UI + Review summary

#### Automated
- [x] 2.1 Type check passes: `npx astro check` — 3ae1371
- [x] 2.2 Lint passes: `npm run lint` — 3ae1371
- [x] 2.3 Build succeeds: `npm run build` — 3ae1371
- [x] 2.4 `/courses/<slug>/tests/<slug>` gated (unauth → redirect) — 3ae1371
- [x] 2.5 Client payload contains no `is_correct` — 3ae1371

#### Manual
- [x] 2.6 Single/multi render (radio/checkbox); correct score + pass/fail; per-question feedback; retake works — 3ae1371
- [x] 2.7 Summary shows before the test (when authored), skippable — 3ae1371
- [x] 2.8 Entry points on course + chapter; light/dark + responsive — 3ae1371

### Phase 3: Spaced re-quizzing

#### Automated
- [ ] 3.1 Migration applies: `supabase migration up`
- [ ] 3.2 Types regenerated with no further diff
- [ ] 3.3 Type check passes: `npx astro check`
- [ ] 3.4 Lint passes: `npm run lint`
- [ ] 3.5 Build succeeds: `npm run build`
- [ ] 3.6 `/courses/<slug>/practice` gated

#### Manual
- [ ] 3.7 Missed questions enter the course practice queue; correct→scheduled forward, wrong→near-term
- [ ] 3.8 Interim lesson `/review` retired with no dangling links/errors

### Phase 4: Ship

#### Automated
- [ ] 4.1 `supabase db push` applies migrations to prod
- [ ] 4.2 Build leak-check: zero 127.0.0.1 in dist/, prod ref present
- [ ] 4.3 `wrangler deploy` succeeds

#### Manual
- [ ] 4.4 Prod: take a seeded test (score + pass/fail) + practice surfaces misses; / + /courses → 200
