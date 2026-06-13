---
title: Event Storming — async practice + lesson-review loop (solo agent first pass)
created: 2026-06-13
type: event-storming
---

# Event Storming — the learning loop (practice + review)

> **Method note.** This is a **solo, agent-generated first pass** (the "good
> enough 80%" the lesson describes), not a live human+agent workshop. The
> interactive `event-storming-canvas` tool (clone + `node server.js` + browser,
> agent as moderator editing `board.json`) is the way to run the real session —
> left for a human-driven pass. Here we capture the deliverable that feeds the
> backlog: the **timeline + red hotspots**. Grammar follows Brandolini:
> 🟠 domain event (past tense) · 🔵 command · 🟡 actor · 🔴 hotspot (risk/open
> question) · 🟣 policy.

## Timeline (chaotic-exploration → timeline)

| #   | 🟡 Actor | 🔵 Command                | 🟠 Event                      | Evidence                                                               |
| --- | -------- | ------------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| 1   | Learner  | Open practice page        | Due practice questions listed | `practice.astro:13` → RPC `get_due_practice_questions` (`tests.ts:65`) |
| 2   | Learner  | Submit selected answer(s) | Answer graded                 | `POST grade.ts:57` → RPC `grade_question` (answer key server-side)     |
| 3   | System   | (auto) reschedule card    | SRS card advanced             | `grade.ts:80` `applyRating` → upsert `srs_question_state`              |
| 4   | Learner  | Submit a whole test       | Test attempt scored           | `submit.ts:65` RPC `submit_test_attempt` → enrol/advance cards         |
| 5   | Learner  | Complete a lesson         | Lesson marked complete        | `complete.ts` writes `lesson_completions`                              |
| 6   | Learner  | Rate a lesson review      | Review card advanced          | `POST rate.ts:76` → upsert `srs_review_state`                          |

## 🔴 Hotspots (risk / open questions → future change-ids)

1. **🔴 Orphaned lesson-review (declared-but-ignored).** Step 5 should, per the
   schema's `review_enabled`, enrol the lesson into `srs_review_state` — but
   `complete.ts` never writes it, and step 6's `/api/reviews/[lessonId]/rate` +
   table have **no UI caller**. The whole review loop (5→6) is wired in the DB
   and tested, yet unreachable. → change-id `wire-or-cut-lesson-review`.
   (Cross-ref: `01-domain-distillation.md` model-vs-code #1.)
2. **🔴 Non-atomic reschedule (lost-update race).** Step 3/4/6 do read → compute
   → upsert in app code under caller RLS; two concurrent grades can clobber a
   card's schedule. Invisible to current tests. → `02-invariant-aggregate-refactor.md`
   (aggregate + `advance_srs_card` RPC).
3. **🔴 Card-shape drift.** Steps 3/4/6 share the FSRS card columns via a
   byte-copied `CARD_COLUMNS` literal (×3) with no compiler link → a column
   rename drifts silently. → being closed by `refactor-opportunities` (L4 plan).
4. **🔴 Divergent failure contracts.** Step 3/6 fail-loud, step 4 swallows SRS
   errors (deliberate "secondary effect") — a real asymmetry to keep explicit,
   not accidentally unify. → folded into invariant #1's `SchedulePolicy`.
5. **🔴 Grading correctness on edge inputs.** `grade_question`/`submit_test_attempt`
   use exact-set matching; partial-credit, empty-selection, and option-reorder
   cases are unspecified in docs. → `unknown`, needs a domain decision.

## What this feeds

Hotspots 1–4 already have homes (DDD artifacts / the L4 change). Hotspot 5 is a
genuine open domain question for a human + real expert. The backlog ordering by
value×risk: **#1 orphaned review** (the code misrepresents a feature) → **#2
race** (silent data corruption) → then the already-planned card-shape cleanup.
