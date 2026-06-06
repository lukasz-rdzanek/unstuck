# Course Learning Loop — Plan Brief

> Full plan: `context/changes/learning-loop/plan.md`

## What & Why

Add the `LEARN → REVIEW → TEST` loop to Unstuck: graded multiple-choice **Tests**, an author-written **Review summary** before each test, and **spaced re-quizzing** of missed questions. Replaces the earlier "Review = spaced repetition of lessons" idea with the clearer model the user landed on — Review is a *summary*, Test is a *quiz*, and spaced repetition is the *engine* that re-surfaces wrong answers.

## Starting Point

Lessons (video/text) + completion exist. No quiz concept. The FSRS engine from the paused `spaced-repetition-review` change (`src/lib/srs.ts` + `srs_review_state` + `/rate`) exists and is reusable — re-pointed at questions here. `has_course_access` (a `SECURITY DEFINER` fn) is the precedent for protecting answer keys.

## Desired End State

An operator seeds a test (questions/options/summary) on a chapter or course. A learner opens "Review & test", optionally reads the summary, takes the quiz (radio/checkbox), and gets a score + pass/fail with per-question feedback; retakes freely. Missed questions resurface on a per-course practice queue until they stick. The answer key never reaches the browser.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Review vs Test | Review = summary; Test = quiz | Distinct concepts; spaced-rep is the engine | Conversation |
| Options/question | Variable 2–6 | Handles T/F, A–D, more | Plan |
| Multi grading | All-or-nothing | Simple, unambiguous | Plan |
| Outcome | Score + author pass threshold, informational | Motivating, no gating (fits PRD) | Plan |
| Attempts | Unlimited retakes, stored | Practice loop + re-quizzing signal | Plan |
| Attach | Chapter or course (`chapter_id` nullable) | "end of part or course" | Plan |
| Authoring | Relational tables, operator-seeded SQL | Per-question identity; no author UI | Plan |
| Summary | Operator `summary_md`, optional pre-test page | Author control; "review before test" | Plan |
| Answer security | `SECURITY DEFINER` read + grade fns | `is_correct` must never reach client | Plan |
| Re-quizzing | Wrong answers only, auto-graded (correct→Good, wrong→Again) | Focus on weak spots; quiz IS the signal | Plan |

## Scope

**In:** test/question/option/attempt schema + secure grading; quiz UI + pre-test summary; entry points; question-scoped FSRS + practice surface; prod ship.
**Out:** author UI, hard gating, partial credit, AI generation, timers/shuffle, migrating old lesson-review data.

## Architecture / Approach

`tests(course_id, chapter_id?)` → `questions` → `question_options(is_correct)`. `is_correct` is **never** exposed: taking-reads + grading go through `SECURITY DEFINER` functions (`get_test`, `submit_test_attempt`) — the key stays in Postgres. Attempts + per-question correctness persist; Phase 3 reuses `src/lib/srs.ts` on a new `srs_question_state` table, auto-grading from correctness.

## Phases at a Glance

| Phase | Delivers | Key risk |
| --- | --- | --- |
| 1. Tests backend | schema + secure grading fns + seed | answer-key protection via definer fns |
| 2. Tests UI + Summary | quiz island + pre-test summary + entry points | single vs multi UX; no `is_correct` in payload |
| 3. Spaced re-quizzing | question FSRS cards + practice surface; retire lesson-review | re-pointing engine; clean retirement |
| 4. Ship | roadmap/Linear + prod migrations + deploy | gated prod actions |

**Prerequisites:** none (FSRS engine already in repo).
**Estimated effort:** ~4–6 sessions; Phases 1–2 are a shippable "Tests" unit on their own.

## Open Risks & Assumptions

- Answer-key protection hinges on the definer-function design — must verify `is_correct` is truly unreadable client-side.
- Operator-seeded authoring (SQL) is the only authoring path until an author UI exists.
- Phase 3 retires the interim lesson-review UI; `srs_review_state`/`review_format` disposition decided there.

## Success Criteria (Summary)

- A learner takes a test → correct score + pass/fail for single & multi questions; retake works.
- Wrong questions resurface in practice and schedule forward when answered right.
- The answer key never appears in any client payload; attempts are per-user (RLS).
