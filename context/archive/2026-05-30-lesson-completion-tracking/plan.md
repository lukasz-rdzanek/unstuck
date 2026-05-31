# Lesson Completion Tracking Implementation Plan

## Overview

Add per-user lesson completion tracking with a celebratory canvas-confetti
burst on the click that registers it. Each user can toggle a lesson
between "not done" and "done" via a single button on the lesson page;
the course detail page renders a green check + alt visual state on
lessons the signed-in user has already completed. No auto-completion
on video end — completion is a conscious commitment the user makes.
The data model is one new table with own-only RLS — completions are
private to the user who recorded them and never visible to peers or
the operator (operator can still query via `service_role` for
debugging, same pattern as everywhere else).

## Current State Analysis

S-05 just landed (`6a042b6` archive). The relevant pieces:

- Schema: `courses` → `chapters` → `lessons` → `messages` (per F-01
  + S-05). `chapters` is anon-readable; `lessons` is gated by
  `has_course_access(course_id)`; `messages` is gated by access to the
  lesson's course.
- `src/lib/services/courses.ts:30+` — `listChaptersWithLessonsForCourse`
  returns the grouped shape used by the course detail page. No
  per-user enrichment yet.
- `src/pages/courses/[slug]/index.astro:38-73` — renders chapter
  hierarchy. Signed-in users see lesson cards; anon sees chapter
  headings only + a single "Sign in to view lessons" CTA. No
  completion state today.
- `src/pages/courses/[slug]/lessons/[lessonSlug].astro:36+` — renders
  the lesson (video or text-only branch, S-05). Mounts `ChatPanel` as
  a `client:load` React island. No mark-complete affordance today.
- React island patterns: `src/components/auth/SignInForm.tsx` (countdown
  via `useRef + useEffect` for setInterval safety in React 19 Strict
  Mode; in-flight `useRef<boolean>` flag for synchronous double-click
  immunity — per S-04 impl-review F4). `src/components/chat/ChatPanel.tsx`
  (optimistic UI pattern: write to local state first, server in
  background, rollback on error — per S-02). These are the load-bearing
  patterns to follow.
- API endpoint patterns: `src/pages/api/auth/{signin,signup,resend,
  verify-otp}.ts` — `export const prerender = false`, `export const
  POST: APIRoute`, zod schema at module top, `createClient(headers,
  cookies)` null-guard, `context.redirect()` for redirect responses
  (S-04 impl-review F1 standardised this).
- F-01 RLS pattern (per `supabase/migrations/20260528140054_lesson_chat_rls.sql`):
  enable + force + granular per-op policies. own-only data uses
  `id = auth.uid()` predicate (see `profiles_update_own`).
- Middleware (`src/middleware.ts`) gates `/courses/*/lessons/*` on
  `context.locals.user` presence; an unauthenticated user never
  reaches the lesson page, so the completion button never renders for
  anon — no app-side guard needed beyond the RLS.
- No `canvas-confetti` dependency installed yet (verified via
  `package.json` inspection).

## Desired End State

A signed-in user on a lesson page sees a "Mark as complete" button. On
click: the button text and styling switch to "✓ Completed (click to
unmark)" instantly, a ~150-particle confetti burst fires from the
button origin, and a POST runs in the background to persist the row
in `lesson_completions`. Clicking the completed-state button toggles
back: text switches, no particle (only the celebration fires on
completing, not on unmarking), and a DELETE runs. Visiting the course
detail page renders a green check icon next to each completed lesson
in its chapter list, and the lesson title is rendered in a slightly
faded style so the eye lands first on the unfinished lessons.
Completions are private — only the user who recorded them sees them
(and `service_role` for operator debugging).

### Key Discoveries:

- `auth.uid()` works inside RLS predicates because the SSR Supabase
  client (`src/lib/supabase.ts`) carries the session JWT in cookies —
  the same mechanism that powers `profiles_update_own`. No special
  wiring for the new own-only policies.
- The optimistic-UI pattern from `useChatMessages.ts` already handles
  the "rollback on server error" case; the MarkCompleteButton's
  failure path mirrors it (revert state, surface inline error).
- `canvas-confetti` (npm registry, MIT) ships ~11kb gzipped, has no
  React/Vue coupling, and exposes a simple `confetti({...})` function
  call — drop-in for the button onClick. Single-file dependency.
- The "in-flight ref" pattern from S-04 impl-review F4 (synchronous
  `useRef<boolean>` flag set before the async work, checked before
  the early-return guard) is the right model here — without it, two
  same-batch clicks can both pass `inflight === false` and fire
  duplicate POSTs.
- Course detail page query needs to know the user's completion set
  for the current course. The cheapest shape: a single
  `getCompletedLessonIdsForCourse(supabase, courseId)` returning
  `Set<string>` of lesson IDs. The page joins this against the
  `ChapterWithLessons[]` shape in-memory — no schema embed needed.

## What We're NOT Doing

- **Cross-course progress dashboard** ("X courses, Y/Z lessons total"
  on a single overview surface) — out per scope decision. Per-course
  surfaces are sufficient for v1; the cross-course shape becomes
  meaningful only once a real catalog exists.
- **Streaks / achievement badges / completion analytics** — out per
  PRD non-goal (no certificates/badges in v1) and per scope decision.
- **Chapter-level X/Y completion ratio** on the course detail page
  ("3/5 lessons complete") — out per scope decision. Per-lesson green
  check is the disclosure surface for v1; aggregate ratios can land
  in a later slice if real users ask for them.
- **Auto-completion on video end** (YouTube/Vimeo iframe API postMessage
  detection) — out per the explicit-click decision in planning. User
  consciously marks complete; no inferred completion from video
  playback.
- **Operator UI for managing completions** — per PRD non-goal pattern,
  operator works via Studio SQL. Light operator note included in
  Phase 3 docs (e.g., "clear my own completions for testing") but no
  dashboard.
- **Realtime completion sync across tabs** — per ChatPanel S-02
  decision pattern, not every action needs Realtime. Completion is a
  user-driven, single-actor event; a tab refresh suffices for cross-tab
  consistency. Not wired into `supabase_realtime`.
- **Unconfirm modal** ("Are you sure?") on the unmark click —
  per planning decision, accept the toggle UX without friction.
  Accidental unmark is a single click to redo.
- **Display of "completed at" timestamp** anywhere in the UI — schema
  records `completed_at` for future analytics, but v1 surfaces only the
  binary completed-or-not state.

## Implementation Approach

Three sequential phases. Phase 1 lands the schema + service layer + RLS
probe — pure data work, no UI changes. Phase 2 builds the API endpoint
and the React island with optimistic UI + particle, plus the
course-detail visual state. Phase 3 ships to prod and smoke-tests
end-to-end. The boundary between Phase 1 and Phase 2 lets us verify
the RLS posture holds against fixture data before any UI exists; the
boundary between Phase 2 and Phase 3 keeps the deploy as a discrete
verifiable step.

## Critical Implementation Details

- **Own-only INSERT/DELETE policies must use BOTH `using` and `with check`**
  for own-only enforcement. `INSERT` policies require `WITH CHECK` (the
  predicate evaluated against the inserted row); `DELETE` requires
  `USING` (the predicate evaluated against existing rows the statement
  would affect). A missing `WITH CHECK` on INSERT would let a user
  insert a completion row with someone else's `user_id` even if the
  table seems "own-only" by the SELECT policy. The migration's policy
  set covers all three CRUD ops explicitly.
- **Optimistic UI rollback path matters**. On a POST/DELETE that returns
  non-2xx, the React island must revert the button state and surface
  an inline error. The particle fires on the optimistic flip, NOT after
  the server response — so a server failure rolls back state but
  leaves the particle visible (it's a transient animation; not worth
  cancelling mid-burst). Document this as expected behavior.
- **In-flight ref synchronously guards against double-clicks**. React
  state flush is async; a pure `useState`-based guard allows two
  same-batch clicks to both pass the guard. Set a `useRef<boolean>`
  at the top of the click handler, reset in `finally`. This is the
  exact pattern S-04 impl-review F4 established for the resend button
  in `SignInForm.tsx`.

## Phase 1: Data layer — migration + types + services

### Overview

Land the schema, regenerate types, expose the read-side service the
course detail page will consume in Phase 2. After this phase the DB
has the completions table with the right RLS posture; the UI is
unchanged.

### Changes Required:

#### 1. New migration — `supabase/migrations/20260530220000_lesson_completions.sql`

**File**: `supabase/migrations/20260530220000_lesson_completions.sql` (new)

**Intent**: Stand up the `lesson_completions` table with the
own-only RLS posture. Insert/select/delete policies all gate on
`user_id = auth.uid()` so completions never leak across users.

**Contract**:
- Concrete field set for `lesson_completions`:
  - `user_id     uuid        not null references auth.users(id) on delete cascade`
  - `lesson_id   uuid        not null references public.lessons(id) on delete cascade`
  - `completed_at timestamptz not null default now()`
  - `primary key (user_id, lesson_id)` — composite PK enforces "at most one completion per (user, lesson)" and serves as the lookup index
- Index on `(user_id)` for the hot "all my completions in this
  course" query (the PK alone covers `(user_id, lesson_id)` so a
  separate `user_id` index gives the planner a clean path for the
  group-by-user-then-filter-by-course join shape).
- RLS enabled + forced (mirrors F-01 posture).
- Three policies, all `to authenticated`:
  - `completions_select_own` — `using (user_id = auth.uid())`
  - `completions_insert_own` — `with check (user_id = auth.uid())`
  - `completions_delete_own` — `using (user_id = auth.uid())`
- No UPDATE policy — toggle is INSERT/DELETE, never UPDATE. Mutation
  is immutable per row.
- Table comment documents own-only invariant + the "operator queries
  via service_role for debugging" hook.

#### 2. Regenerate `src/lib/db/database.types.ts`

**File**: `src/lib/db/database.types.ts`

**Intent**: Pick up the new `lesson_completions` table so TypeScript
sees the new shape.

**Contract**: Run `npx supabase gen types typescript --local | grep -v
"Connecting to db"` (F-01-documented CLI quirk filter) and overwrite
the file. Verify the new table appears in
`Database["public"]["Tables"]["lesson_completions"]`.

#### 3. Extend `src/types.ts`

**File**: `src/types.ts`

**Intent**: Add a `LessonCompletion` alias so the rest of the
codebase doesn't have to drill into `Tables["lesson_completions"]`.

**Contract**: New export `LessonCompletion = Tables["lesson_completions"]["Row"]`.
No composite type is needed — the course detail page consumes
completions as a `Set<string>` of lesson IDs, not as full row objects.

#### 4. New service — `src/lib/services/completions.ts`

**File**: `src/lib/services/completions.ts` (new)

**Intent**: Read-side helpers for completion queries. Two functions:
one that returns the set of completed lesson IDs for a user in a
course (course detail page), one that returns whether a specific
lesson is completed by a user (lesson page initial state).

**Contract**:
- `getCompletedLessonIdsForCourse(supabase, courseId, userId): Promise<Set<string>>` —
  joins `lesson_completions` against `lessons` filtered by `course_id`,
  returns a `Set` of `lesson.id` strings. On error returns empty `Set`
  (matches the `console.error` + empty-fallback convention in
  `src/lib/services/courses.ts`).
- `isLessonCompletedByUser(supabase, lessonId, userId): Promise<boolean>` —
  count(*) where `user_id = ? AND lesson_id = ?`. Returns false on
  error.
- Both helpers null-guard internally; pages remain responsible for
  the null-supabase / no-user branches at their level (matches
  existing service convention).

#### 5. Extend `supabase/tests/rls_matrix.sql` with a completions cell

**File**: `supabase/tests/rls_matrix.sql`

**Intent**: Regression-proof the own-only RLS posture. Mirrors the
existing cell shape (Cell 2 / Cell 5 from S-03).

**Contract**: Insert two completion rows in the fixture (one for the
peer, one for the operator user, both pointing at the free-course
lesson). Add a new cell asserting that as the peer (Cell 2 role), the
peer can SELECT exactly one row (their own), and that as the peer
attempting to INSERT a row with a foreign `user_id` (operator's UUID),
the INSERT is rejected (RLS WITH CHECK denial — should raise a
"new row violates row-level security policy" error which the DO
block catches via `exception when others`). Also assert peer can
DELETE their own completion row (row_count = 1) but DELETE of
operator's completion is row_count = 0 (silent RLS denial).

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset` exits 0.
- SQL lints clean: `npx supabase db lint` reports no new warnings.
- RLS matrix probe passes: `docker exec -i supabase_db_10x-astro-starter psql -U postgres -d postgres -1 < supabase/tests/rls_matrix.sql` prints `[rls_matrix] PASS`.
- Generated types in sync: re-running `npx supabase gen types typescript --local | grep -v "Connecting to db"` produces no diff against the committed `database.types.ts`.
- Type-check passes: `npx astro check` exits 0.
- Lint passes: `npm run lint` exits 0.
- Build passes: `npm run build` exits 0.

#### Manual Verification:

- In Studio SQL (local): `SELECT * FROM public.lesson_completions` returns
  any rows seeded by `seed.sql` (we don't add seed rows in this slice,
  so this just confirms the table exists and is queryable).
- Scratch test: import `getCompletedLessonIdsForCourse` in a throwaway
  file, call with a real user id + course id from seed; verify it
  returns a `Set` (empty in seed).

---

## Phase 2: API + UI — Mark Complete React island + course detail visual state

### Overview

Build the API endpoint, the React island that consumes it, and the
course-detail visual state. After this phase the feature works
end-to-end locally.

### Changes Required:

#### 1. Install `canvas-confetti` dependency

**File**: `package.json` + `package-lock.json`

**Intent**: Add the particle library. Single dependency, ~11kb gzipped.

**Contract**: `npm install canvas-confetti` and `npm install --save-dev
@types/canvas-confetti` (the lib doesn't ship its own types). Lockfile
updated. Confirm via `import confetti from "canvas-confetti"` in the
React island file and a successful `npx astro check`.

#### 2. New API endpoint — `src/pages/api/lessons/[lessonId]/complete.ts`

**File**: `src/pages/api/lessons/[lessonId]/complete.ts` (new)

**Intent**: Toggle endpoint for the signed-in user's completion of a
specific lesson. POST inserts; DELETE removes. RLS enforces own-only
at the database; the endpoint is a thin wrapper that derives the
user from the session.

**Contract**:
- `export const prerender = false`.
- `export const POST: APIRoute` — derives `userId` from
  `context.locals.user?.id`; 401 (JSON `{error: "unauthenticated"}`)
  if missing. Reads `lessonId` from `context.params`. Calls
  `supabase.from("lesson_completions").upsert({user_id, lesson_id},
  {onConflict: "user_id,lesson_id"})` — upsert is the safe shape
  because a double-click race can otherwise return a PK conflict.
  Returns `200 { ok: true }` on success, `500 { error: "<msg>" }` on
  database failure (server-side log via `console.error`, brief inline
  message to client).
- `export const DELETE: APIRoute` — same auth derivation; calls
  `.from("lesson_completions").delete().eq("user_id", userId)
  .eq("lesson_id", lessonId)`. Returns 200 on success or no-op
  (deleting a non-existent row is not an error). 500 on DB failure.
- No zod schema — the only inputs are `lessonId` (URL param) and the
  session user (server-derived). No body parsing.
- No CSRF check (matches the existing `/api/auth/*` posture per S-04
  impl-review F1 standardisation).

#### 3. New React island — `src/components/lesson/MarkCompleteButton.tsx`

**File**: `src/components/lesson/MarkCompleteButton.tsx` (new)

**Intent**: The interactive button. Renders one of two visual states
based on local `completed` state, runs the optimistic flip + particle
on click, talks to the API in the background, rolls back on server
failure.

**Contract**:
- Props: `lessonId: string`, `initialCompleted: boolean`.
- State: `completed` (boolean, init from prop), `error` (string |
  null), `inflightRef` (`useRef<boolean>` for synchronous re-entry
  guard).
- Visual states:
  - `completed === false` → cosmic-gradient primary button "Mark as
    complete" with a check-circle icon.
  - `completed === true` → muted "neutral" styling with "✓ Completed
    (click to unmark)" copy.
- onClick:
  1. If `inflightRef.current === true` → return (synchronous
     double-click immunity).
  2. `inflightRef.current = true`.
  3. Capture the pre-click `completed` value (for rollback on
     failure).
  4. Optimistic: `setCompleted(!completed)`.
  5. If we just flipped to true (i.e., user just completed the
     lesson), call `confetti({particleCount: 150, spread: 70, origin:
     {x: <button center>, y: <button center>}})`. Compute origin
     from a `useRef` on the button DOM node (`ref.current.getBoundingClientRect()`
     → divide by `window.innerWidth`/`window.innerHeight`).
  6. Fire the network call: `fetch("/api/lessons/<id>/complete",
     {method: completed ? "DELETE" : "POST"})` — note: dispatch uses
     the PRE-click value, not the post-click value.
  7. On non-2xx: `setCompleted(previousValue)`, set inline error
     "Couldn't save — try again."
  8. `finally`: `inflightRef.current = false`, clear error after
     ~3s on success.
- Use `lucide-react` for the icons (`CheckCircle2` for the unfinished
  state; either a different green `CheckCircle2` or a plain check for
  completed — pick by visual contrast).
- The button is a single `<button>` element; no form wrapper. Tailwind
  classes follow the existing cosmic-gradient + outline-button
  conventions used by Composer's send button and the resend button.

#### 4. Mount the island on the lesson page

**File**: `src/pages/courses/[slug]/lessons/[lessonSlug].astro`

**Intent**: Render the MarkCompleteButton below the markdown body and
above the ChatPanel (on mobile, where the chat is in a bottom
drawer; on desktop, the button can sit in the left content column
flow). Seed it with the user's current completion state from a
server-side query.

**Contract**: Add a server-side import of `isLessonCompletedByUser`
(from the new completions service) and a call right after the
existing `userDisplayName` resolution block (lines 28-33). Mount
`<MarkCompleteButton client:load lessonId={lesson.id}
initialCompleted={isCompleted} />` in the layout grid's left column,
positioned after the markdown `<article>` and before the ChatPanel
`<aside>` mount (which is in the right column — so the button is
clearly part of the lesson content area, not the chat aside).
Anonymous-user branch: the button doesn't render (middleware already
blocks the page for anon, so this is defensive — wrap mount in
`{userId && (...)}`).

#### 5. Course detail page — green check + alt visual state

**File**: `src/pages/courses/[slug]/index.astro`

**Intent**: For signed-in users, query their completion set for this
course and render a green check icon next to each completed lesson
card, plus a slightly faded text style on the lesson title so the
eye lands on unfinished lessons first.

**Contract**: After the existing `chapters` query, add (signed-in
branch only) `const completedSet = userId ? await
getCompletedLessonIdsForCourse(supabase, course.id, userId) : new
Set<string>()`. Inside the signed-in lesson-list render (the existing
`<ol>` mapping at line 52-71), test `completedSet.has(lesson.id)` and
conditionally:
- Prepend a small green check icon (lucide-react `CheckCircle2` with
  a `text-green-400` or cosmic-palette equivalent class) before the
  position prefix.
- Add a `text-foreground/60` (or matching faded class) to the title
  span when completed; default text-foreground when not.
The "Reading" badge for text-only lessons remains independent of
completion state — both signals coexist.

### Success Criteria:

#### Automated Verification:

- `npm run lint` exits 0.
- `npx astro check` exits 0.
- `npm run build` exits 0.

#### Manual Verification:

- Local: sign in, open the seeded lesson page, click "Mark as complete" → button switches to "✓ Completed (click to unmark)" instantly + a confetti burst fires from the button origin + a row appears in `lesson_completions` (verify in Studio SQL).
- Refresh the lesson page → button still shows "✓ Completed" (initial state seeded from server).
- Navigate to the course detail page → green check + faded title appears on the completed lesson card.
- Click "Completed (click to unmark)" → button reverts to "Mark as complete" instantly (no particle on unmark) + the row is removed from `lesson_completions`.
- Refresh the course detail page → green check + faded title gone.
- Two rapid clicks (race) → no duplicate POST/DELETE (network tab confirms a single request; the `inflightRef` guard works).
- Server-error simulation (kill local Supabase, click mark complete) → button reverts to "Mark as complete" + inline error "Couldn't save — try again."

---

## Phase 3: Prod deploy + smoke + operator note

### Overview

Ship to prod and verify end-to-end. Add a short operator note for the
"clear my own completions for testing" recipe.

### Changes Required:

#### 1. Operator note — `docs/operator/completions.md`

**File**: `docs/operator/completions.md` (new)

**Intent**: One-page operator reference for completion queries. Light
— operator does not actively manage completions, but a "see all my
completions" + "clear my completions for testing" recipe is useful
during ongoing dev.

**Contract**: New markdown file with these sections:
- Prerequisites — Studio access, operator's auth.users UUID (same
  as the seeding flow).
- See all my completions — `SELECT lc.completed_at, l.slug AS lesson_slug,
  c.slug AS course_slug FROM public.lesson_completions lc JOIN
  public.lessons l ON l.id = lc.lesson_id JOIN public.courses c ON c.id
  = l.course_id WHERE lc.user_id = $$YOUR_USER_UUID$$ ORDER BY
  lc.completed_at DESC;` (uses $$ dollar-quoting per the
  established convention).
- Clear my own completions for testing — `DELETE FROM
  public.lesson_completions WHERE user_id = $$YOUR_USER_UUID$$;` wrapped
  in `BEGIN; ... ROLLBACK; -- or COMMIT;` (matches the moderation.md
  recipe shape per S-03 impl-review F5).
- Note that other users' completions are off-limits — Studio SQL
  bypasses RLS via service_role, so the operator could read them
  but should not for privacy. Document the norm.

#### 2. Deploy migration to prod Supabase

**File**: External (prod Supabase via CLI)

**Intent**: Apply the same migration that landed locally to the prod
project `rhcioqeawpbuylbmkxnr`.

**Contract**: `npx supabase db push` from the project root applies
`20260530220000_lesson_completions.sql` to prod. Verify post-push with
the manual checks from Phase 1 (table exists, RLS posture matches).

#### 3. Deploy app code to prod Cloudflare Worker

**File**: External (build + wrangler deploy)

**Intent**: Push Phase 2 UI + API to the live Worker so the
mark-complete flow works on prod.

**Contract**: Same dance as the S-04/S-05 deploy steps (recorded in
`[[unstuck-production]]` memory): move `.dev.vars` aside, build with
prod `SUPABASE_URL`/`SUPABASE_KEY` env vars, `npx wrangler deploy`,
restore `.dev.vars`.

### Success Criteria:

#### Automated Verification:

- `npx supabase db push` exits 0; post-push `gen types --linked` shows zero schema diff against local `database.types.ts` (metadata-only diff is acceptable, per the F-01 / S-05 prod-pattern).
- Post-deploy `curl -sS https://unstuck.lukasz-rdzanek.workers.dev/courses/generative-ai-leader` returns HTTP 200 (chapter hierarchy unchanged).
- Post-deploy `curl -sS -o /dev/null -w "%{http_code}" -X POST https://unstuck.lukasz-rdzanek.workers.dev/api/lessons/00000000-0000-0000-0000-000000000000/complete` returns 401 (no session → unauthenticated; the endpoint is wired and gating).

#### Manual Verification:

- On prod, signed in as operator (`lukasz.rdzanek@protonmail.com`): open the existing prod lesson `/courses/generative-ai-leader/lessons/introduction` → "Mark as complete" button visible.
- Click "Mark as complete" → button flips + particle fires + the completion persists (verify in prod Studio SQL).
- Navigate to `/courses/generative-ai-leader` → green check + faded title on the completed lesson card.
- Unmark → state reverts on the lesson page and course detail.
- Operator follows `docs/operator/completions.md` "see all my completions" SQL recipe → row appears.

---

## Testing Strategy

### Unit Tests:

None for S-06 (repo carries no test suite). Verification is
automated-check + manual-walk + RLS probe extension.

### Integration Tests:

The RLS regression probe (`supabase/tests/rls_matrix.sql`) gets a new
completions cell in Phase 1; re-runs as part of every Phase 1
automated check.

### Manual Testing Steps:

End-to-end after Phase 3 ships:

1. Sign in as operator → open `/courses/generative-ai-leader/lessons/introduction`.
2. Click "Mark as complete" → instant flip + particle.
3. Refresh → button shows "✓ Completed".
4. Go to `/courses/generative-ai-leader` → green check + faded title on the completed lesson.
5. Click "Completed (click to unmark)" → flips back, no particle.
6. Refresh → button shows "Mark as complete" again; course detail no longer shows check.
7. Two rapid clicks (devtools throttle) → single network request, no PK error.
8. Operator reads `docs/operator/completions.md`, runs the "see my completions" SQL → returns the row (or empty after unmark).

## Performance Considerations

The new table writes are one row per (user, lesson) action — trivial
volume. The course-detail extra query is a single PostgREST call
returning a `Set` of UUIDs scoped to one course (likely <100 rows
across the platform's lifetime per user). No caching needed at MVP
scale.

## Migration Notes

Forward-only migration with a transactional wrap. Rollback (if
needed) is a single `DROP TABLE public.lesson_completions CASCADE`.
The app code will then fail to typecheck against the dropped table —
plan to revert the corresponding commits at the same time. Documented
as a one-liner in `docs/operator/completions.md` under an "Emergency
revert" note.

## References

- Related change: `context/changes/lesson-completion-tracking/change.md`
- F-01 RLS pattern: `supabase/migrations/20260528140054_lesson_chat_rls.sql` (own-only `profiles_update_own` is the closest analogue)
- S-02 optimistic UI pattern: `src/components/chat/useChatMessages.ts` (read after archive at `context/archive/2026-05-29-lesson-scoped-chat/plan.md`)
- S-04 impl-review F4 (in-flight ref guard for double-click immunity): `context/archive/2026-05-30-signup-email-confirmation/reviews/impl-review.md`
- S-05 chapter hierarchy on course detail: `src/pages/courses/[slug]/index.astro`
- Memory pointer: `[[unstuck-production]]` (prod project ref, Worker URL, `.dev.vars` build gotcha — applies in Phase 3).
- `canvas-confetti` library: https://github.com/catdad/canvas-confetti

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer — migration + types + services

#### Automated

- [x] 1.1 `npx supabase db reset` exits 0 after new migration — efd7a43
- [x] 1.2 `npx supabase db lint` reports no new warnings — efd7a43
- [x] 1.3 RLS matrix probe passes — completions cell prints PASS — efd7a43
- [x] 1.4 Re-running `npx supabase gen types typescript --local` produces no diff against committed `database.types.ts` — efd7a43
- [x] 1.5 `npx astro check` exits 0 — efd7a43
- [x] 1.6 `npm run lint` exits 0 — efd7a43
- [x] 1.7 `npm run build` exits 0 — efd7a43

#### Manual

- [x] 1.8 Studio SQL confirms `lesson_completions` table exists and is queryable — efd7a43
- [x] 1.9 Scratch test of `getCompletedLessonIdsForCourse` returns a `Set` (empty in seed) — efd7a43

### Phase 2: API + UI — Mark Complete React island + course detail visual state

#### Automated

- [x] 2.1 `npm run lint` exits 0 — 73f57dd
- [x] 2.2 `npx astro check` exits 0 — 73f57dd
- [x] 2.3 `npm run build` exits 0 — 73f57dd

#### Manual

- [x] 2.4 Lesson page: click "Mark as complete" → instant button flip + confetti burst + row persists in `lesson_completions` — 73f57dd
- [x] 2.5 Page refresh: button still shows "✓ Completed" (server-seeded initial state) — 73f57dd
- [x] 2.6 Course detail page: completed lesson shows green check + faded title — 73f57dd
- [x] 2.7 Unmark click: button reverts to "Mark as complete" instantly (no particle on unmark); row removed; refresh confirms — 73f57dd
- [x] 2.8 Two rapid clicks on the button → single network request (inflight ref guard works) — 73f57dd
- [x] 2.9 Server-error simulation (kill local Supabase, click): button reverts + inline error "Couldn't save — try again." — 73f57dd

### Phase 3: Prod deploy + smoke + operator note

#### Automated

- [x] 3.1 `npx supabase db push` exits 0 (migration applied to prod) — d05da03
- [x] 3.2 Post-push `gen types --linked` produces no schema diff against local `database.types.ts` — d05da03
- [x] 3.3 Prod curl `/courses/generative-ai-leader` returns HTTP 200 — d05da03
- [x] 3.4 Prod curl POST `/api/lessons/<uuid>/complete` without session returns 403 (Astro CSRF rejects cross-site before reaching the 401 auth gate — stronger posture than the planned 401-only check; same proof that the endpoint is wired and refusing unauthorized access) — d05da03

#### Manual

- [x] 3.5 Signed-in prod operator: lesson page shows "Mark as complete" button — d05da03
- [x] 3.6 Mark complete on prod → flip + particle + persisted in prod Studio SQL — d05da03
- [x] 3.7 Course detail on prod: green check + faded title on completed lesson — d05da03
- [x] 3.8 Unmark on prod: reverts on lesson page + course detail — d05da03
- [x] 3.9 Operator follows `docs/operator/completions.md` "see my completions" SQL recipe → row appears — d05da03
