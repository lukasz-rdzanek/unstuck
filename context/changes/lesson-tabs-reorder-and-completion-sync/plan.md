# Lesson Tabs Reorder + Completion Sync (UNS-14) Implementation Plan

## Overview

Four-part lesson aside upgrade addressing parked UNS-14:
- **(a)** Lessons becomes the default tab for new users (Chat still
  available; existing users keep their preference).
- **(b)** Chat tab pulses when a new message arrives while user is on
  Lessons (already works once (a) lands — `handleChatMessageCount`
  semantics already correct).
- **(c)** Indicator + banner when course was updated since the user's
  last visit — requires `updated_at` columns on courses/lessons plus a
  new `course_views` per-user table tracking `last_seen_at`.
- **(d)** Bidirectional MarkComplete ↔ LessonsNav sync via window
  CustomEvent bus — marking complete on the current lesson immediately
  updates its row in the Lessons list without page reload.

Ships across 5 phases (4 feature-deploys + final smoke) per the
deploy-per-feature workflow preference.

## Current State Analysis

Mapped via Explore agent during planning:
- **Tab default**: `LessonAside.tsx:21-22, 44-47` — `TAB_STORAGE_KEY` +
  `loadTab()` defaults to `"chat"`.
- **Tab strip JSX**: `LessonAside.tsx:212-252` — two buttons (Chat
  first, then Lessons) under a `tablist` role.
- **Pulse logic**: `LessonAside.tsx:81-138` — `hasNewChat` state +
  `handleChatMessageCount` callback. Already guards on
  `activeTabRef.current !== "chat"`, so retargeting is automatic once
  Lessons becomes the default.
- **MarkComplete ↔ LessonsNav today**: zero coupling.
  `MarkCompleteButton.tsx:53-92` mutates local `completed` state +
  fires API; `LessonsNav.tsx:28` reads `completedLessonIds` as a SSR
  prop. Cross-island sync only via full page navigation. No
  `CustomEvent`, no React Context, no shared state — repo has zero
  cross-island patterns.
- **Course freshness data**: `courses` table has no `updated_at`
  (`supabase/migrations/20260528122957_lesson_chat_schema.sql:36-43`);
  `lessons` table has no `updated_at` (lines 52-63); no per-user
  view-history table exists.
- **localStorage helpers**: `readLocalStorage` / `writeLocalStorage`
  wrappers at `LessonAside.tsx:26-42` — try/catch for Safari private
  mode. Reusable pattern for banner-dismiss state.

## Desired End State

- New users opening any lesson page land on the Lessons tab; returning
  users with prior `unstuck.lesson-aside.tab` preference are honored.
- Chat tab pulses when a new message arrives while the user is on the
  Lessons tab — semantics unchanged, target automatically retargets.
- Marking a lesson complete updates its row in the Lessons list (green
  check + faded title) instantly — no page reload, no SSR refetch.
  Unmarking reverses it.
- When the course content has been edited or extended since the user's
  last visit, the Lessons tab carries an accent dot AND the Lessons
  panel renders a dismissible banner ("This course has new content
  since your last visit"). Dismissing the banner persists per-course in
  localStorage so it doesn't re-appear until next update.
- `course_views(user_id, course_id, last_seen_at)` table records every
  lesson page render; `courses.updated_at` and `lessons.updated_at`
  bump automatically via trigger on every operator edit.

### Key Discoveries

- `localStorage` already has the try/catch wrapper pattern from S-07 —
  reuse for the new per-course dismiss state.
- `bump_updated_at()` trigger pattern is standard PostgreSQL; one
  function reused across the two tables.
- The new `course_views` upsert per lesson render adds ~1 round-trip;
  acceptable given the existing `Promise.all` already does 3 queries.
- `window.dispatchEvent(new CustomEvent(...))` is repo's first event
  bus — namespace events as `unstuck:<feature>:<action>` to avoid
  collisions with future patterns.

## What We're NOT Doing

- NOT forcing existing users into Lessons-default (honor localStorage
  per Q1 decision).
- NOT smarter pulse semantics (counter badge, author-aware filter) —
  reuse exact `handleChatMessageCount` logic per Q2.
- NOT lifting MarkComplete + LessonAside into a wrapper React island
  (per Q7 — would destroy Astro SSR for lesson content, sprzeczne z
  S-07 architectural lesson).
- NOT adding supabase realtime to lesson_completions for multi-tab
  sync (overkill per Q8 — window CustomEvent + per-tab Set update is
  enough for MVP).
- NOT backfilling course_views for existing users (per Q5 — graceful
  first-visit-after-deploy = no indicator + record now()).
- NOT tracking lesson-level "last seen" (chapters scope is enough for
  the indicator).
- NOT tests (no test infra; Module 3 of 10xDevs).

## Implementation Approach

Five phases, each shipping independently to prod:

1. **Tab reorder** — JSX + localStorage default swap. Zero functional
   risk; new users see Lessons-first, returning users unchanged. Also
   confirms (b) pulse retarget works as automatic side effect.
2. **MarkComplete↔Nav sync** — Add CustomEvent emit in
   MarkCompleteButton post-API-success; add listener in LessonsNav
   that toggles its local Set state for the affected lesson.
3. **Schema + view tracking** — Migration adds `updated_at` columns +
   `bump_updated_at` trigger + `course_views` table with RLS. Service
   helpers + parallel-query upsert in lessonSlug.astro. Schema lands
   on prod; UI doesn't yet consume.
4. **Indicator UI** — LessonAside reads `courseUpdatedAt` +
   `lastSeenAt` props, decides whether to show tab dot + banner; banner
   dismiss persists per-course in localStorage.
5. **End-to-end smoke** — manual prod walk through all four features
   integrated.

## Phase 1: Tab reorder (Lessons-first for new users)

### Overview

Swap tab order in JSX so Lessons renders before Chat. Change
`loadTab()` default from `"chat"` to `"lessons"` so new users
(no localStorage key) land on Lessons. Returning users with stored
preference keep their tab.

### Changes Required

#### 1. Lessons becomes default tab + JSX swap

**File**: `src/components/lesson/LessonAside.tsx`

**Intent**: Surface course progress as the primary affordance for new
users (the parked UNS-14 rationale). Keep the existing
`unstuck.lesson-aside.tab` localStorage key so returning users are
unaffected. Reorder the two tab `<button>` elements in the tablist so
Lessons appears first visually as well as semantically.

**Contract**:
- `loadTab()` default branch: return `"lessons"` instead of `"chat"`.
  Existing branch `stored === "lessons" ? "lessons" : "chat"` becomes
  `stored === "chat" ? "chat" : "lessons"` (default flips from chat to
  lessons; honoring stored value when present).
- Tab strip JSX (`LessonAside.tsx:202-243` range): swap order of the
  two `<button role="tab">` elements so Lessons renders left, Chat
  right. Swap icon imports if needed (visual order should match: list
  icon then message icon).
- `handleChatMessageCount` body unchanged — already targets the
  not-currently-Chat case.

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0
- `npx astro check` exits 0
- `npm run build` exits 0

#### Manual Verification

- 1.4 Clear localStorage (devtools), refresh lesson page → Lessons tab
  is selected by default; Chat is secondary.
- 1.5 Existing localStorage `unstuck.lesson-aside.tab=chat` → still
  lands on Chat tab (returning-user honor).
- 1.6 With Lessons active, post a chat message from another tab/window
  → Chat tab pulses (pulse retarget works automatically).
- 1.7 Switch to Chat → pulse clears (existing semantics preserved).

#### Phase 1 Deploy

- 1.8 Pre-deploy `npm run lint` + `npm run build` succeed
- 1.9 Build with prod env, bundle verified prod-only
- 1.10 `wrangler deploy` exits 0
- 1.11 Post-deploy curl `/courses/<slug>/lessons/<slug>` → HTTP 302
- 1.12 Prod manual: clear localStorage, open lesson → Lessons tab default

**Implementation Note**: Pause for manual confirmation after 1.7
before deploy steps 1.8-1.12.

---

## Phase 2: Bidirectional MarkComplete ↔ LessonsNav sync

### Overview

Add a window CustomEvent bus (first such pattern in the repo). On
mark/unmark API success, MarkCompleteButton dispatches an event
carrying `{ lessonId, completed }`. LessonsNav listens, updates its
local Set state for that lessonId, and re-renders that row (green check
+ faded title appears/disappears immediately).

### Changes Required

#### 1. CustomEvent emit in MarkCompleteButton

**File**: `src/components/lesson/MarkCompleteButton.tsx`

**Intent**: Broadcast the user's mark/unmark intent to any island that
cares about lesson completion state — currently LessonsNav, possibly
others in future. Emit ONLY on API success (not on optimistic flip)
so subscribers stay consistent with server truth.

**Contract**:
- After `res.ok` confirmed (line ~69 area), and before the function
  returns, dispatch `window.dispatchEvent(new CustomEvent("unstuck:lesson-completion-changed", { detail: { lessonId, completed: !wasCompleted } }))`.
- On rollback path (API fail), do NOT dispatch — the optimistic
  flip is reverted locally; subscribers should not have observed any
  change.
- Bail out for SSR safety: skip dispatch if `typeof window === "undefined"`.

#### 2. CustomEvent listener in LessonsNav

**File**: `src/components/lesson/LessonsNav.tsx`

**Intent**: Mirror server state into the displayed completion Set so
the row reflects the just-marked state without page navigation.

**Contract**:
- Convert the `completedSet` from `useMemo` to local state:
  `const [completedSet, setCompletedSet] = useState(() => new Set(completedLessonIds));`
- New `useEffect` that adds a window event listener on mount, cleans
  up on unmount. Event handler: read `detail.lessonId` + `detail.completed`,
  call `setCompletedSet((prev) => { const next = new Set(prev); next[completed ? "add" : "delete"](lessonId); return next; })`.
- Sync incoming-props changes: a second `useEffect` keyed on
  `completedLessonIds` reinitializes the Set if the SSR prop ever
  changes (e.g., on full navigation to a new lesson page). Local
  events take precedence between SSR rerenders.

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0
- `npx astro check` exits 0
- `npm run build` exits 0

#### Manual Verification

- 2.4 On a lesson currently NOT marked complete, with Lessons tab
  visible: click Mark Complete → row in Lessons list flips to green
  check + faded title immediately (no page reload).
- 2.5 Click Unmark → row reverts to position number + bold title.
- 2.6 Rapid mark/unmark: each toggle reflects in Lessons list in real
  time.
- 2.7 Navigate to a different lesson (full page nav) → SSR-loaded
  completion state correct; new event listener attached.
- 2.8 If API fails (offline / 5xx), MarkComplete shows error and rolls
  back; LessonsNav row reflects the rollback (event was NOT dispatched
  since success branch wasn't reached).

#### Phase 2 Deploy

- 2.9 Pre-deploy lint + build green
- 2.10 wrangler deploy succeeds
- 2.11 Post-deploy smoke curl returns 302
- 2.12 Prod manual: mark/unmark cycles work + sync to Lessons list

**Implementation Note**: Pause for manual confirmation after 2.8.

---

## Phase 3: Schema migration + view tracking

### Overview

Add `updated_at` columns to `courses` and `lessons` with a shared
`bump_updated_at()` trigger. Create `course_views` table for per-user
view-history tracking (with RLS). Add service helpers + integrate
upsert into the lesson page render path. No UI consumption yet — UI
lands in Phase 4.

### Changes Required

#### 1. Migration: updated_at columns + bump trigger + course_views table

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_course_views_and_updated_at.sql` (new)

**Intent**: Establish the data substrate for the course-updated
indicator: bump-on-edit timestamps for courses + lessons, and per-user
view records to compare against.

**Contract**:
- `ALTER TABLE public.courses ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`
- `ALTER TABLE public.lessons ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`
- `CREATE FUNCTION public.bump_updated_at()` returning trigger,
  language plpgsql, sets `NEW.updated_at = NOW()` and returns NEW.
- Two triggers (one per table) BEFORE UPDATE FOR EACH ROW EXECUTE
  FUNCTION public.bump_updated_at().
- `CREATE TABLE public.course_views (user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE, last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_id, course_id));`
- `ALTER TABLE public.course_views ENABLE ROW LEVEL SECURITY;`
- Four RLS policies (per AGENTS.md "granular per-operation, per-role"
  rule):
  - SELECT: `auth.uid() = user_id` (users see only their own rows).
  - INSERT: `auth.uid() = user_id` (users can only insert their own
    rows).
  - UPDATE: `auth.uid() = user_id` (users can only update their own
    rows — needed for upsert).
  - DELETE: not exposed (no policy = nobody can delete; operator can
    delete via service_role).
- Comments on table + columns explaining the per-user view-tracking
  intent.

#### 2. Service: getCourseLastSeenAt + upsertCourseView + getCourseUpdatedAt

**File**: `src/lib/services/course-views.ts` (new)

**Intent**: Centralize the read + write paths for course-views, plus
the helper that resolves "what's the latest update timestamp for a
course (its row OR any of its lessons)".

**Contract**:
- `export async function getCourseLastSeenAt(supabase, courseId, userId): Promise<Date | null>`:
  query `course_views.last_seen_at WHERE user_id = ? AND course_id = ?`
  via `.maybeSingle()`. Returns `Date` or null if no row. Distinguish
  PGRST116 (no rows) from real errors via the NOT_FOUND_CODE pattern
  used in `profiles.ts`.
- `export async function upsertCourseView(supabase, courseId, userId): Promise<void>`:
  upsert `course_views` with `last_seen_at: new Date().toISOString()`
  via `.upsert(..., { onConflict: 'user_id,course_id' })`. Log errors
  via `console.error` (non-fatal).
- `export async function getCourseUpdatedAt(supabase, courseId): Promise<Date | null>`:
  return `GREATEST(courses.updated_at, MAX(lessons.updated_at))` for
  the given course. Implementation: a single PostgREST query
  `courses?select=updated_at,lessons(updated_at)&id=eq.<id>` and
  client-side max; OR a dedicated SQL view if PostgREST shape is
  awkward. Pick whichever is cleanest at implementation time.

#### 3. Integrate into lesson page render path

**File**: `src/pages/courses/[slug]/lessons/[lessonSlug].astro`

**Intent**: Resolve both `courseUpdatedAt` and `lastSeenAt` server-side
in parallel with the existing 3 queries, AND upsert the new
`last_seen_at = now()` so the next visit's comparison reflects today.

**Contract**:
- Extend the existing `Promise.all` (`lessonSlug.astro:36-43`) to
  include `getCourseLastSeenAt(supabase, course.id, userId)` and
  `getCourseUpdatedAt(supabase, course.id)`.
- After the destructure, fire `upsertCourseView(supabase, course.id, userId)`
  (fire-and-forget — don't block the render on it; or `await` if
  ordering matters for the next render). Choose await for correctness:
  ~50ms cost vs guaranteed next-visit consistency.
- Pass two new props down to LessonAside: `courseUpdatedAt: string | null`
  (ISO date) and `lastSeenAt: string | null` (ISO date). UI consumes
  in Phase 4; harmless to pass empty in Phase 3 (Astro just renders).

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0
- `npx astro check` exits 0
- `npm run build` exits 0
- `supabase db push` (or local migration apply via `supabase db reset`)
  succeeds without errors
- New columns + table visible via `\d+ public.courses`, `\d+ public.lessons`,
  `\d+ public.course_views` in psql

#### Manual Verification

- 3.5 Local: edit a lesson row in Studio → `lessons.updated_at`
  auto-bumps to NOW().
- 3.6 Local: insert a `course_views` row for a non-owning user via
  service_role → RLS allows; query as that user → row visible. Query
  as different user → row hidden.
- 3.7 Visit a lesson page (signed in) → `course_views` row appears with
  current timestamp; refresh → timestamp updates.

#### Phase 3 Deploy

- 3.8 `supabase db push` to prod project succeeds
- 3.9 Pre-deploy app lint + build green
- 3.10 wrangler deploy succeeds
- 3.11 Post-deploy smoke curl returns 302
- 3.12 Prod manual: visit lesson signed in → `course_views` populated
  on prod (verify via SQL editor in Supabase dashboard)

**Implementation Note**: Pause for manual confirmation after 3.7
before deploy.

---

## Phase 4: Course-updated indicator UI

### Overview

LessonAside reads the two new props (`courseUpdatedAt`, `lastSeenAt`).
When `courseUpdatedAt > lastSeenAt`, it shows a colored dot on the
Lessons tab AND renders a dismissible banner inside the Lessons panel.
Dismiss persists per-course in localStorage so a dismissed banner
doesn't reappear until next update.

### Changes Required

#### 1. Indicator state + dismissed-key helpers in LessonAside

**File**: `src/components/lesson/LessonAside.tsx`

**Intent**: Compute "is the course freshly updated since user's last
visit, and has user not yet dismissed this update?" — boolean drives
both the tab dot and the banner. Persist dismiss state per-course in
localStorage so it survives refresh but resets when a NEW update lands.

**Contract**:
- Add two new props: `courseId: string`, `courseUpdatedAt: string | null`,
  `lastSeenAt: string | null`.
- New localStorage key pattern: `unstuck.lesson-aside.course-update-dismissed.<courseId>`
  storing the ISO timestamp that was dismissed.
- Derive `hasFreshUpdate = courseUpdatedAt != null && (lastSeenAt == null || courseUpdatedAt > lastSeenAt)`.
  Per Q5 backfill decision: lastSeenAt == null means "first visit
  after deploy" → DON'T treat as fresh (the user hasn't established a
  baseline). So adjust: `hasFreshUpdate = lastSeenAt != null && courseUpdatedAt > lastSeenAt`.
- Derive `dismissedAt = readLocalStorage(<dismissed-key>)`. Show
  indicator iff `hasFreshUpdate && (dismissedAt == null || dismissedAt < courseUpdatedAt)`.
  (If user dismissed for THIS update timestamp or later, hide; if
  newer update came in since dismiss, show again.)
- `useCallback handleDismiss` writes `writeLocalStorage(<key>, courseUpdatedAt)`
  and flips a local `dismissedThisRender` state to hide immediately
  (without waiting for localStorage roundtrip).

#### 2. Tab dot rendering

**File**: `src/components/lesson/LessonAside.tsx`

**Intent**: Add a small colored dot next to the Lessons tab label when
`showIndicator === true`. Reuse the existing `bg-accent` palette or a
distinct attention color (cyan/orange) to distinguish from the Chat
pulse animation.

**Contract**:
- Inside the Lessons `<button role="tab">` JSX (around lines 226-242
  in the post-Phase-1 layout), add a conditional
  `{showIndicator && <span class="bg-cyan-400 h-2 w-2 rounded-full" aria-label="Course has new content" />}`.
  Place to the right of the "Lessons" label, beside the existing
  icon.

#### 3. Dismissible banner in Lessons panel

**File**: `src/components/lesson/LessonAside.tsx` (banner JSX inside
the Lessons tab's content block, above the LessonsNav render)

**Intent**: Surface the "what changed" message explicitly when user
opens the Lessons tab. Dismiss action persists; banner stays gone
until next update.

**Contract**:
- Conditional render when `activeTab === "lessons" && showIndicator`.
- Banner contents: small icon (Sparkles or similar from lucide), text
  ("This course has new content since your last visit"), close button
  (X icon).
- Click X → `handleDismiss()`.
- Cosmic-themed styling (`border-cyan-400/30 bg-cyan-400/10 text-cyan-200`,
  rounded-lg, p-3 mb-3).

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0
- `npx astro check` exits 0
- `npm run build` exits 0

#### Manual Verification

- 4.4 Local SQL: bump `courses.updated_at` to NOW() for the seed
  course → reload lesson page → Lessons tab shows cyan dot; opening
  Lessons tab shows the dismissible banner.
- 4.5 Click banner X → banner disappears; dot also disappears
  (dismissed state); refresh → still dismissed.
- 4.6 Bump `courses.updated_at` again (simulate new edit) → indicator
  reappears (dismiss was for the prior timestamp; new one supersedes).
- 4.7 Sign in as a fresh user (no `course_views` row) → first lesson
  visit → no indicator (graceful per Q5).
- 4.8 Sign in as same user, second visit → still no indicator unless
  content was edited between visits.

#### Phase 4 Deploy

- 4.9 Pre-deploy lint + build green
- 4.10 wrangler deploy succeeds
- 4.11 Post-deploy smoke curl returns 302

**Implementation Note**: Pause for manual confirmation after 4.8.

---

## Phase 5: End-to-end smoke on prod

### Overview

Walk all four UNS-14 features integrated on prod after every phase
shipped. No new code — just verification.

### Success Criteria

#### Manual Verification (all on prod)

- 5.1 New incognito session → Lessons tab default; Chat secondary.
- 5.2 Post chat message from second tab while on Lessons → Chat tab
  pulses; switching to Chat clears it.
- 5.3 Mark current lesson complete → Lessons list row flips green +
  faded instantly; unmark reverses.
- 5.4 In Supabase Studio: edit a lesson title (or insert a new lesson
  into the seeded course); refresh lesson page → Lessons tab dot;
  banner visible. Dismiss → both clear.
- 5.5 No regression: chat works end-to-end, particle burst on mark
  complete works, prev/next arrows + Lesson N/M badge work, aside
  collapse + fluid grid works.

**Implementation Note**: This phase is verification-only; no code, no
deploy. Single commit at end if any plan-row SHA write-backs need to
land (typically empty-diff and skipped).

---

## Testing Strategy

### Unit Tests

None — no test infra (Module 3).

### Integration Tests

The RLS regression probe (`supabase/tests/rls_matrix.sql`) should be
extended in Phase 3 to cover `course_views` policies (deferred — note
in commit body, file as follow-up).

### Manual Testing Steps

End-to-end on prod after Phase 5:

1. Sign in as a brand-new user (incognito).
2. Open any lesson → Lessons tab default; chapter list rendered.
3. Switch to Chat → tab switch + scroll work.
4. Open same lesson in second tab; post a chat message → first tab's
   Chat tab pulses while on Lessons.
5. Click Mark Complete → Lessons list row flips immediately.
6. Click Unmark → reverts immediately.
7. Edit a lesson row in Supabase Studio → first tab's refresh shows
   cyan dot + banner; dismiss → clear.
8. Click another lesson via Lessons list → navigates; localStorage
   tab choice (Lessons) preserved.

## Performance Considerations

- Phase 3: 2 new server queries per lesson render
  (`getCourseLastSeenAt` + `getCourseUpdatedAt`) + 1 upsert
  (`upsertCourseView`). Combined ~150-300ms on cold Worker → Supabase.
  All run in parallel via `Promise.all` so wall-clock overhead is the
  slowest one (~100ms typical). Acceptable for SSR lesson page.
- Phase 4: indicator computation is trivial (string compare + 1
  localStorage read). No runtime cost.
- Phase 2: window event bus is `O(listeners)` per event; one listener
  in LessonsNav, fires once per mark/unmark API success. Negligible.

## Migration Notes

- Migration adds `updated_at` with `DEFAULT NOW()` → existing rows get
  current timestamp on apply. This means immediately after the
  migration, every course/lesson has `updated_at == NOW()`. The
  `course_views` upsert from Phase 3 records each user's first
  post-deploy visit with the same `NOW()` → comparison resolves to
  "user has seen this update" (per Q5 graceful default). No false-
  positive indicator spam.
- Rollback: drop the new table + columns + trigger via reverse SQL.
  App code revert is straightforward — UI consumers handle missing
  props gracefully (Phase 4 guards `lastSeenAt != null`).

## References

- Change: `context/changes/lesson-tabs-reorder-and-completion-sync/change.md`
- S-07 LessonAside: `src/components/lesson/LessonAside.tsx`
- S-07 LessonsNav: `src/components/lesson/LessonsNav.tsx`
- S-06 MarkCompleteButton: `src/components/lesson/MarkCompleteButton.tsx`
- S-06 completions service: `src/lib/services/completions.ts` (NOT_FOUND_CODE pattern)
- S-06 profiles service: `src/lib/services/profiles.ts` (NOT_FOUND_CODE pattern)
- F-01 schema: `supabase/migrations/20260528122957_lesson_chat_schema.sql`
- Memory: `[[unstuck-production]]` (deploy recipe applies in each
  phase's deploy step)
- Linear: [UNS-14](https://linear.app/unstack-ai/issue/UNS-14)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Tab reorder (Lessons-first for new users)

#### Automated

- [x] 1.1 `npm run lint` exits 0
- [x] 1.2 `npx astro check` exits 0
- [x] 1.3 `npm run build` exits 0

#### Manual

- [x] 1.4 Cleared localStorage + refresh → Lessons tab default
- [x] 1.5 Existing localStorage `chat` preference → still lands on Chat (honor returning users)
- [x] 1.6 With Lessons active, chat message from another tab → Chat tab pulses
- [x] 1.7 Switch to Chat → pulse clears
- [x] 1.8 Pre-deploy `npm run lint` + `npm run build` succeed
- [x] 1.9 Build with prod env, bundle verified prod-only
- [x] 1.10 `wrangler deploy` exits 0
- [x] 1.11 Post-deploy curl `/courses/<slug>/lessons/<slug>` returns HTTP 302
- [x] 1.12 Prod manual: clear localStorage, open lesson → Lessons tab default

### Phase 2: Bidirectional MarkComplete ↔ LessonsNav sync

#### Automated

- [ ] 2.1 `npm run lint` exits 0
- [ ] 2.2 `npx astro check` exits 0
- [ ] 2.3 `npm run build` exits 0

#### Manual

- [ ] 2.4 Mark complete → Lessons row flips green + faded immediately
- [ ] 2.5 Unmark → row reverts immediately
- [ ] 2.6 Rapid mark/unmark cycles reflect in real-time
- [ ] 2.7 Navigate to different lesson → SSR completion state correct; new listener attached
- [ ] 2.8 API fail (5xx) → MarkComplete rolls back; LessonsNav row reflects rollback (event was not dispatched)
- [ ] 2.9 Pre-deploy lint + build green
- [ ] 2.10 wrangler deploy succeeds
- [ ] 2.11 Post-deploy smoke curl returns 302
- [ ] 2.12 Prod manual: mark/unmark cycles sync to Lessons list

### Phase 3: Schema migration + view tracking

#### Automated

- [ ] 3.1 `npm run lint` exits 0
- [ ] 3.2 `npx astro check` exits 0
- [ ] 3.3 `npm run build` exits 0
- [ ] 3.4 Local migration apply via `supabase db reset` succeeds; new columns + table visible via `\d+`

#### Manual

- [ ] 3.5 Edit a lesson row in Studio → `lessons.updated_at` auto-bumps
- [ ] 3.6 RLS verified: own course_views row visible, others hidden
- [ ] 3.7 Visit lesson page (signed in) → course_views row appears with current timestamp; refresh updates
- [ ] 3.8 `supabase db push` to prod succeeds
- [ ] 3.9 Pre-deploy app lint + build green
- [ ] 3.10 wrangler deploy succeeds
- [ ] 3.11 Post-deploy smoke curl returns 302
- [ ] 3.12 Prod manual: visit lesson signed in → course_views populated on prod

### Phase 4: Course-updated indicator UI

#### Automated

- [ ] 4.1 `npm run lint` exits 0
- [ ] 4.2 `npx astro check` exits 0
- [ ] 4.3 `npm run build` exits 0

#### Manual

- [ ] 4.4 Bump course updated_at via SQL → Lessons tab dot + banner visible
- [ ] 4.5 Click banner X → dismissed; refresh → still dismissed
- [ ] 4.6 Bump updated_at again → indicator reappears (newer than dismissed timestamp)
- [ ] 4.7 Fresh user first visit → no indicator (graceful Q5 default)
- [ ] 4.8 Second visit without edits → no indicator
- [ ] 4.9 Pre-deploy lint + build green
- [ ] 4.10 wrangler deploy succeeds
- [ ] 4.11 Post-deploy smoke curl returns 302

### Phase 5: End-to-end smoke on prod

#### Manual

- [ ] 5.1 New incognito session → Lessons tab default
- [ ] 5.2 Chat-pulse-on-Lessons retarget verified
- [ ] 5.3 MarkComplete ↔ LessonsNav row sync verified
- [ ] 5.4 Course-updated indicator + dismiss verified
- [ ] 5.5 No regression: chat, particle burst, prev/next, aside collapse fluid grid all still work
