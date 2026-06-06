# Spaced-Repetition Review (FSRS-6 via ts-fsrs) — Plan Brief

> Full plan: `context/changes/spaced-repetition-review/plan.md`
> Research seed: `context/changes/spaced-repetition-review/change.md` + deep-research run `wccs2i36q` (2026-06-06)

## What & Why

Add spaced-repetition review so learners retain lesson material over time. Completing a lesson enrols it for review; FSRS-6 schedules when it's next due; learners grade due lessons on a `/review` page. FSRS is the current state-of-the-art scheduler (beats SM-2 for ~99.6% of users; ~20–30% fewer reviews for equal retention).

## Starting Point

Unstuck already tracks per-user lesson completion (`lesson_completions` + Mark-Complete button/route). There is no review/retention concept yet. The completion event is the enrolment hook; the completions table is the data-model template.

## Desired End State

A learner sees a due-count on the dashboard linking to `/review`, where they work a queue of due lessons one at a time — title prompt → reveal the lesson's autodescription + link → grade Again/Hard/Good/Easy. Each grade is server-computed (FSRS) and persisted privately (RLS); cards leave the queue with a future due date; an empty queue shows "all caught up".

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Algorithm | FSRS-6 | Most accurate scheduler; beats SM-2/SM-17/Leitner | Research |
| Library | ts-fsrs | MIT, zero-dep, TS-native, edge-compatible (first-party) | Research |
| Review unit | Whole lesson | Smallest build; reuses lessons + completions; no card authoring | Plan |
| Enrolment | Auto on completion | Zero extra UX; natural trigger; builds on Mark-Complete | Plan |
| Rating | 4-grade (Again/Hard/Good/Easy) | Full FSRS fidelity | Plan |
| Compute site | Server API route | Authoritative, tamper-resistant, matches write-path pattern | Plan |
| Param optimization | Deferred (default params) | No cron infra; cold-start needs ~1000+ reviews anyway | Plan / Research |
| Surface | Dedicated `/review` page + dashboard count | Focused session UX | Plan |
| Card content | Title → reveal autodescription | Reuses existing UNS-20 field; zero new authoring | Plan |
| Roadmap | New slice + Linear UNS-22 (in progress) | Keep roadmap/Linear in sync | Plan |

## Scope

**In scope:** `srs_review_state` table + own-only RLS; auto-enrol on completion; server-side FSRS scheduling; `/review` session UI; dashboard due-count; prod migration + deploy.

**Out of scope:** flashcards/card authoring; FSRS optimizer + cron infra; session→multi-rating aggregation; reminders/notifications; per-lesson opt-out/snooze.

## Architecture / Approach

`complete.ts` POST enrols a card (best-effort, non-fatal) → `srs_review_state (user_id, lesson_id, FSRS state…)`. A pure `src/lib/srs.ts` wraps ts-fsrs (row↔Card mapping, `applyRating`). `POST /api/reviews/[lessonId]/rate` loads the row, computes next state server-side, upserts. `reviews.ts` service reads the due queue + count. `/review.astro` renders autodescription→HTML and feeds the `ReviewSession` island; the dashboard links in.

## Phases at a Glance

| Phase | Delivers | Key risk |
| --- | --- | --- |
| 1. Data model + ts-fsrs | dep + migration + RLS + helper + auto-enrol | FSRS `Card` field set must match installed version |
| 2. Service + rating API | due-queue reads + server FSRS rate endpoint | correct row↔Card mapping / RLS isolation |
| 3. Review UI | `/review` session island + dashboard count | trusted-markdown render; theme/responsive |
| 4. Ship | roadmap/Linear + prod migration + deploy | `supabase db push` to prod + deploy gotcha |

**Prerequisites:** none (builds on shipped completion feature).
**Estimated effort:** ~3–4 sessions across 4 phases.

## Open Risks & Assumptions

- `ts-fsrs` Workers compatibility is verified-by-config (nodejs_compat + zero-dep) but confirmed for real only by the Phase 1 build/import smoke-test.
- Whole-lesson recall is self-graded against the autodescription — value depends on lessons having a useful autodescription (falls back to a lesson link otherwise).
- Default FSRS params (not personalized) until a future optimizer phase — acceptable per research (still beats SM-2).

## Success Criteria (Summary)

- Completing a lesson makes it appear, due, in `/review`; grading schedules it forward (Again soon, Easy far).
- Review state is strictly per-user (RLS); the session works in light + dark and on prod.
