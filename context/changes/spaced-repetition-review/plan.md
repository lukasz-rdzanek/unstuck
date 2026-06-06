# Spaced-Repetition Review (FSRS-6 via ts-fsrs) Implementation Plan

## Overview

Add per-user spaced-repetition review on top of Unstuck's existing lessons. When a learner marks a lesson complete, it is auto-enrolled as a review "card". FSRS-6 (via the `ts-fsrs` library, computed server-side) schedules each card's next due date. Learners review due lessons on a dedicated `/review` page — one card at a time, prompted by the lesson title, revealing the lesson's autodescription, graded **Again / Hard / Good / Easy**. v1 uses FSRS default parameters (no per-user optimizer).

## Current State Analysis

- **Completion already exists** and is the natural enrolment trigger: `lesson_completions (user_id, lesson_id, completed_at)`, own-only RLS, written via `POST/DELETE /api/lessons/[lessonId]/complete` ([complete.ts](src/pages/api/lessons/[lessonId]/complete.ts)), toggled by [MarkCompleteButton.tsx](src/components/lesson/MarkCompleteButton.tsx).
- **Data-model template**: [20260530220000_lesson_completions.sql](supabase/migrations/20260530220000_lesson_completions.sql) — composite PK `(user_id, lesson_id)`, FK→`auth.users`/`lessons` `on delete cascade`, `enable` + `force` RLS, own-only policies via `auth.uid()`. SRS mirrors this **plus an UPDATE policy** (state mutates each review) and a **due index** `(user_id, due)`.
- **Write-path convention**: services in `src/lib/services/*` are read-only and take `(supabase, …ids, userId)`; mutations live in API routes with `export const prerender = false`, user resolved from `context.locals.user?.id`, zod-validated input, and `{ ok }` / `{ error }` JSON returns (no thrown exceptions). ([completions.ts](src/lib/services/completions.ts), [complete.ts](src/pages/api/lessons/[lessonId]/complete.ts))
- **Island convention**: optimistic UI flip + rollback on non-OK, `CustomEvent` to notify siblings, props passed from the `.astro` page (dates as ISO strings, Sets as arrays). ([MarkCompleteButton.tsx](src/components/lesson/MarkCompleteButton.tsx))
- **Protected routes**: `middleware.ts` resolves `context.locals.user` and redirects unauthenticated users for routes matched by `isProtectedRoute` (`/dashboard`, lesson routes). New `/review` page is gated by extending that function. ([middleware.ts](src/middleware.ts), [dashboard.astro](src/pages/dashboard.astro))
- **Runtime fit**: `wrangler.jsonc` has `compatibility_flags: ["nodejs_compat"]`; `ts-fsrs` is zero-dependency pure-JS ESM → runs in both React islands and Worker API routes. No `[triggers]`/cron infra exists today (so any future optimizer job is net-new — out of scope here).
- **Types**: `src/lib/db/database.types.ts`, regenerated with `npx supabase gen types typescript --local`; consumed via `src/types.ts`.
- **No prior SRS** in PRD/roadmap; it does not conflict with the MVP "no completion-metrics" non-goal (that's reporting metrics, not a retention scheduler) nor the AI/LLM stance. A roadmap slice + Linear issue are net-new (Phase 4).

## Desired End State

A signed-in learner who has completed lessons sees a **due count** on the dashboard linking to `/review`. On `/review` they work a queue of due lessons one at a time: read the title prompt, reveal the lesson's autodescription (with a link back to the full lesson), and grade their recall on a 4-button scale. Each grade is POSTed; the Worker computes the next FSRS state and persists it under RLS; the card leaves today's queue with a future due date. When the queue is empty they see an "all caught up" state. Verify: complete a lesson → it appears due in `/review` → grading Again returns it soon, Easy pushes it far out; state is private per-user (RLS); the flow works in light + dark and on prod.

### Key Discoveries:

- `lesson_completions` is the exact shape to mirror; the only deltas are an **UPDATE** RLS policy and a `(user_id, due)` index (`20260530220000_lesson_completions.sql`).
- The completion `POST` route is the single enrolment hook — add a non-fatal `srs_review_state` insert there (`complete.ts`).
- `ts-fsrs` exposes `createEmptyCard`, `fsrs`, `generatorParameters`, `Rating`, `State`, and `f.next(card, now, grade) → { card, log }`; defaults to FSRS-6 weights. The DB row ↔ `Card` mapping is date-string ↔ `Date`.
- Autodescription markdown is rendered **server-side** in `/review.astro` (via `renderMarkdown`) and passed as HTML to the island — the client bundle must not gain a markdown dep (S-01 constraint).

## What We're NOT Doing

- No lesson-derived flashcards / card-authoring or LLM card generation (whole-lesson is the unit).
- No FSRS per-user parameter optimization and no cron/`[triggers]` infrastructure (default params only in v1).
- No multi-item session→single-rating aggregation (a whole lesson = one rating, so it doesn't arise).
- No review reminders / emails / push notifications.
- No per-lesson opt-out / snooze / un-enroll UI (review state simply persists; `DELETE` policy deferred).
- No change to the rating model beyond FSRS's 4 grades; no analytics dashboards.

## Implementation Approach

Build bottom-up: data model + a pure scheduling helper first (Phase 1), then the server read/write surface (Phase 2), then the UI (Phase 3), then ship incl. prod migration + roadmap/Linear (Phase 4). FSRS computation is centralized in one server helper so the API route stays thin and the algorithm version is pinned in one place.

## Critical Implementation Details

- **FSRS Card field set must match the installed `ts-fsrs` version.** The migration's columns mirror the `Card` interface (`due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review`, and `learning_steps` if present in the installed FSRS-6 build). Phase 1 pins the version and reconciles columns to the actual `Card` shape before the migration is finalized — `ts-fsrs` package semver (5.x) ≠ algorithm version (FSRS-6); confirm `generatorParameters()` yields FSRS-6 defaults.
- **Enrolment must never break completion.** The `srs_review_state` insert added to `complete.ts` is best-effort: `onConflict (user_id,lesson_id) do nothing`, errors logged but the route still returns `{ ok: true }` for the completion itself.
- **`state` is stored as `smallint`** mapping FSRS `State` (0 New, 1 Learning, 2 Review, 3 Relearning); `due`/`last_review` are `timestamptz` ↔ JS `Date` at the mapping boundary.

## Phase 1: Data model + ts-fsrs

### Overview
Add the dependency, the review-state table (+ RLS + index + types), a pure FSRS scheduling helper, and auto-enrolment on completion.

### Changes Required:

#### 1. Add the ts-fsrs dependency
**File**: `package.json`
**Intent**: Add `ts-fsrs` for FSRS-6 scheduling; confirm it imports in both a Worker build and a client bundle.
**Contract**: `ts-fsrs` in `dependencies`; lockfile updated via `npm install`. No other dep changes. Verify the installed version implements FSRS-6 (`generatorParameters()` default) and note its `Card` field set for the migration.

#### 2. srs_review_state migration
**File**: `supabase/migrations/<YYYYMMDDHHmmss>_srs_review_state.sql` (timestamp at creation)
**Intent**: Per-user, per-lesson FSRS card state, mirroring `lesson_completions` with a mutable-state twist.
**Contract**: `create table public.srs_review_state` with composite PK `(user_id, lesson_id)`, FKs to `auth.users(id)` and `public.lessons(id)` `on delete cascade`; FSRS columns (`due timestamptz not null`, `stability double precision not null default 0`, `difficulty double precision not null default 0`, `elapsed_days integer not null default 0`, `scheduled_days integer not null default 0`, `reps integer not null default 0`, `lapses integer not null default 0`, `state smallint not null default 0`, `last_review timestamptz`, plus `learning_steps integer not null default 0` iff the installed Card has it), `created_at`/`updated_at timestamptz not null default now()`. `enable` + `force` RLS. Own-only policies for **select / insert / update** (the rate endpoint upserts; no delete in v1) following the `course_views` upsert policy shape (`using` for select/update, `with check` for insert/update). Index `srs_review_state_due_idx on (user_id, due)` for the due-queue query. `comment on table` describing the own-only posture.

#### 3. Regenerate DB types
**File**: `src/lib/db/database.types.ts` (+ alias in `src/types.ts`)
**Intent**: Surface the new table to the typed Supabase client.
**Contract**: Run `npx supabase gen types typescript --local`; add a `SrsReviewState = Tables["srs_review_state"]["Row"]` alias in `src/types.ts` matching existing alias style.

#### 4. FSRS scheduling helper
**File**: `src/lib/srs.ts` (new)
**Intent**: One pure module wrapping `ts-fsrs` so the API route stays thin and the algorithm version is pinned here.
**Contract**: Export (a) a row↔`Card` mapper (timestamptz strings ↔ `Date`), (b) `emptyCard(now)` → `createEmptyCard`, (c) `applyRating(row, rating: 1|2|3|4, now) → nextRowState` using `fsrs(generatorParameters())` and `f.next(card, now, grade)`. `Rating` mapping: 1 Again, 2 Hard, 3 Good, 4 Easy. No DB access, no `window`/`document` at module scope.

#### 5. Auto-enrol on completion
**File**: `src/pages/api/lessons/[lessonId]/complete.ts`
**Intent**: Completing a lesson enrols it for review (idempotent, non-fatal).
**Contract**: In the existing `POST`, after the `lesson_completions` upsert succeeds, insert an `srs_review_state` row for `(userId, lessonId)` initialized from `emptyCard(now)` (state New, `due = now`) with `onConflict: "user_id,lesson_id"` ignore-duplicates. Any error is logged (`[srs] enrol failed`) but does NOT change the `{ ok: true }` completion response. `DELETE` (un-complete) leaves review state intact.

### Success Criteria:

#### Automated Verification:
- `ts-fsrs` present: `grep -q '"ts-fsrs"' package.json`
- Migration applies cleanly: `supabase db reset` (local) succeeds
- Types regenerated with no further diff: re-running `npx supabase gen types typescript --local` is a no-op
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds (ts-fsrs bundles for the Worker): `npm run build`

#### Manual Verification:
- After `supabase db reset`, completing a lesson (POST) creates exactly one `srs_review_state` row with `state=0` and `due ≈ now`; re-completing does not duplicate or reset it.
- `ts-fsrs` imports without error in the built Worker output (no Node-only built-in pulled in).

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Review service + rating API

### Overview
A read-only due-queue service and a server-side rating endpoint that computes the next FSRS state.

### Changes Required:

#### 1. Reviews service
**File**: `src/lib/services/reviews.ts` (new)
**Intent**: Read-only queries for the due queue and the dashboard count.
**Contract**: `getDueReviewQueue(supabase, userId, now): Promise<DueReviewItem[]>` — select `srs_review_state` where `user_id = userId and due <= now`, join `lessons` for `title, autodescription_md, slug` and the parent course `slug`; order by `due asc`; return `{ lessonId, title, autodescriptionMd, courseSlug, lessonSlug, due }`. `getDueReviewCount(supabase, userId, now): Promise<number>`. Follow the existing service error pattern (log + safe default `[]`/`0`).

#### 2. Rating API route
**File**: `src/pages/api/reviews/[lessonId]/rate.ts` (new)
**Intent**: Apply a grade to a lesson's review card, server-computing the next FSRS state.
**Contract**: `export const prerender = false`; `POST` only. Resolve `userId` from `context.locals.user?.id` (401 if absent); validate JSON body `{ rating: 1|2|3|4 }` with zod (400 on failure); load the current `srs_review_state` row (if missing, start from `emptyCard(now)`); compute next state via `applyRating` (Phase 1 helper); upsert the row (`onConflict user_id,lesson_id`, set `updated_at = now`). Return `{ ok: true, due }` or `{ error }` (no throws). RLS guarantees a learner can only mutate their own row.

### Success Criteria:

#### Automated Verification:
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:
- POSTing `{rating:1}` (Again) to a due card returns a near-term `due`; `{rating:4}` (Easy) returns a far-future `due`; the row's `reps` increments and `state` advances.
- A second user cannot read or rate the first user's card (RLS: query returns nothing / rate no-ops).
- Rating a lesson with no existing row (edge) initializes a card rather than erroring.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Review UI

### Overview
A protected `/review` page with a one-card-at-a-time session island, plus a dashboard due-count entry point.

### Changes Required:

#### 1. Protect the /review route
**File**: `src/middleware.ts`
**Intent**: Gate `/review` behind auth like `/dashboard`.
**Contract**: Extend `isProtectedRoute` to return true for `/review` (exact + subpaths). Unauthenticated users get the existing `?next=` redirect.

#### 2. Review page (server-rendered shell)
**File**: `src/pages/review.astro` (new)
**Intent**: Load the due queue server-side, render autodescription markdown to HTML, hand the queue to the session island.
**Contract**: Mirror `dashboard.astro` structure under `AppLayout`. Resolve `userId` + supabase server-side; call `getDueReviewQueue`; for each item render `autodescriptionMd` via `renderMarkdown` (server-side, reusing `src/lib/markdown.ts`) into `answerHtml`; pass the array (dates as ISO strings) to `<ReviewSession client:load queue={...} />`. Empty queue still renders the island (it shows the caught-up state).

#### 3. Review session island
**File**: `src/components/review/ReviewSession.tsx` (new)
**Intent**: Drive a review session: prompt → reveal → grade → next.
**Contract**: Props `{ queue: ReviewCard[] }` where `ReviewCard = { lessonId, title, answerHtml, courseSlug, lessonSlug, due }`. State: current index + "revealed" flag. Front shows `Recall: <title>`; "Show answer" reveals `answerHtml` (rendered via `dangerouslySetInnerHTML` on operator-trusted content, matching the lesson page's trusted-markdown boundary) + a link to `/courses/<courseSlug>/lessons/<lessonSlug>`. Four grade buttons (Again/Hard/Good/Easy) `POST /api/reviews/<lessonId>/rate` with the mapped rating; on `ok`, advance to the next card (optimistic: remove from local queue; on non-OK, surface an inline error and don't advance). When the queue is exhausted, show an "All caught up" empty state. Cosmic-themed via tokens + `cn()`; feature-scoped island under `src/components/review/`.

#### 4. Dashboard due-count entry
**File**: `src/pages/dashboard.astro`
**Intent**: Surface due reviews and link into `/review`.
**Contract**: Server-side call `getDueReviewCount(supabase, userId, now)`; render a themed card/link "You have N lessons to review → /review" (suppressed or "You're all caught up" when 0). No new island — static server-rendered link.

### Success Criteria:

#### Automated Verification:
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`
- `/review` is gated: unauthenticated request redirects (verify `isProtectedRoute` covers it)

#### Manual Verification:
- Complete 2–3 lessons → dashboard shows the due count → `/review` presents them one at a time; Show answer reveals the autodescription + working lesson link.
- Grading advances through the queue; Again brings a card back sooner than Good/Easy; finishing shows "All caught up".
- Reloading `/review` reflects the new due dates (graded cards no longer appear until due).
- Control surfaces read correctly in light + dark; layout holds on a 13" laptop and mobile width.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 4.

---

## Phase 4: Ship

### Overview
Record the work on roadmap + Linear, push the migration to prod, deploy, and smoke-test.

### Changes Required:

#### 1. Roadmap + Linear
**File**: `context/foundation/roadmap.md` (+ Linear via MCP)
**Intent**: Keep roadmap + Linear + change in sync (standing consistency rule).
**Contract**: Add a roadmap slice (next `S-` id) with `Change ID: spaced-repetition-review`, status `in_progress`, in the `## At a glance` table + a body entry; create Linear issue **UNS-22** "Spaced-repetition review" (in progress), linked to this change. Flip both to done at archive (post-ship), mirroring UNS-19.

#### 2. Prod migration + deploy
**File**: (runbook — no code)
**Intent**: Apply the new table to prod Supabase and deploy the Worker bundle (now including ts-fsrs).
**Contract**: `supabase db push` to apply `srs_review_state` to the linked prod project (`rhcioqeawpbuylbmkxnr`). Then the prod build gotcha: `mv .dev.vars` aside → `SUPABASE_URL/KEY=<prod> npm run build` → leak-check `grep -roE "127\.0\.0\.1:54321" dist/` is zero + prod ref present → `npx wrangler deploy` → restore `.dev.vars`.

### Success Criteria:

#### Automated Verification:
- `supabase db push` succeeds (migration applied to prod)
- Build leak-check: zero `127.0.0.1` in `dist/`, prod ref present
- `wrangler deploy` succeeds

#### Manual Verification:
- On prod: complete a lesson → it appears in `/review` → grading schedules it forward; `/` + `/courses` + `/dashboard` → 200.

**Implementation Note**: Final phase — gated prod actions (`supabase db push`, `wrangler deploy`); confirm before each.

---

## Testing Strategy

### Manual Testing Steps
1. Local: `supabase db reset`; complete a lesson; confirm one `srs_review_state` row (`state=0`, `due≈now`).
2. Rate via the API (Again vs Easy) and confirm divergent `due` dates + `reps`/`state` changes.
3. `/review` session end-to-end: prompt → reveal → grade → next → caught-up; dashboard count matches.
4. RLS: a second account cannot see or mutate the first's review state.
5. Theme + responsive check on `/review` and the dashboard entry.
6. Prod smoke after deploy.

(No automated test framework exists in this repo yet — testing strategy/quality gates arrive in a later module; success criteria here are type-check/lint/build + the manual steps above.)

## Performance Considerations

The due-queue query is indexed `(user_id, due)`; FSRS compute is O(1) per rating and runs server-side. `ts-fsrs` loads only on the `/review` route + the rate endpoint, not in shared bundles.

## Migration Notes

One additive migration (`srs_review_state`); no changes to existing tables. Rollback = drop the table + revert the `complete.ts` enrol insert and the `/review` UI; existing completion behavior is untouched.

## References

- Change identity + research seed: `context/changes/spaced-repetition-review/change.md`
- Deep-research run: `wccs2i36q` (2026-06-06) — FSRS-6 + ts-fsrs, verified/cited
- Data-model template: `supabase/migrations/20260530220000_lesson_completions.sql`
- Write-path template: `src/pages/api/lessons/[lessonId]/complete.ts`, `src/components/lesson/MarkCompleteButton.tsx`
- Protected-route pattern: `src/middleware.ts`, `src/pages/dashboard.astro`
- Deploy runbook + `.dev.vars` gotcha: production memory `unstuck-production`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data model + ts-fsrs

#### Automated
- [x] 1.1 `ts-fsrs` present: `grep -q '"ts-fsrs"' package.json`
- [x] 1.2 Migration applies cleanly: `supabase db reset`
- [x] 1.3 Types regenerated with no further diff
- [x] 1.4 Type check passes: `npx astro check`
- [x] 1.5 Lint passes: `npm run lint`
- [x] 1.6 Build succeeds: `npm run build`

#### Manual
- [x] 1.7 Completing a lesson creates one srs_review_state row (state=0, due≈now); re-complete is idempotent
- [x] 1.8 ts-fsrs imports cleanly in the built Worker output

### Phase 2: Review service + rating API

#### Automated
- [ ] 2.1 Type check passes: `npx astro check`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Build succeeds: `npm run build`

#### Manual
- [ ] 2.4 Again→near due, Easy→far due; reps/state advance
- [ ] 2.5 RLS: a second user cannot read/rate another's card
- [ ] 2.6 Rating a card with no existing row initializes rather than errors

### Phase 3: Review UI

#### Automated
- [ ] 3.1 Type check passes: `npx astro check`
- [ ] 3.2 Lint passes: `npm run lint`
- [ ] 3.3 Build succeeds: `npm run build`
- [ ] 3.4 `/review` gated by isProtectedRoute (unauth → redirect)

#### Manual
- [ ] 3.5 Dashboard count → /review session: prompt → reveal → grade → next → caught-up
- [ ] 3.6 Graded cards leave today's queue; due dates reflect grades on reload
- [ ] 3.7 Theme (light+dark) + responsive (13" + mobile) correct

### Phase 4: Ship

#### Automated
- [ ] 4.1 `supabase db push` applies the migration to prod
- [ ] 4.2 Build leak-check: zero 127.0.0.1 in dist/, prod ref present
- [ ] 4.3 `wrangler deploy` succeeds

#### Manual
- [ ] 4.4 Prod: complete → /review → grade schedules forward; / + /courses + /dashboard → 200
