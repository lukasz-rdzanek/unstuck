# Lesson Completion Tracking — Plan Brief

> Full plan: `context/changes/lesson-completion-tracking/plan.md`

## What & Why

Give each user a way to mark a lesson as done and see their progress
reflected back on the course detail page. Today there is no per-user
state at all — every visit to a lesson looks identical regardless of
whether the user finished it last week. The slice closes that gap with
a single button on the lesson page (with a celebratory canvas-confetti
burst on the click that registers completion) and a green-check + faded
visual state on the course detail page's lesson cards.

## Starting Point

S-05 just landed — chapters group lessons on the course detail page,
text-only lessons render markdown-only with a "Reading" badge. The
data model has `courses → chapters → lessons → messages` plus the
F-01 RLS posture (own-only data uses `id = auth.uid()` predicates
per `profiles_update_own`). No per-user state exists yet for the
lesson surface.

## Desired End State

A signed-in user on any lesson page sees a "Mark as complete" button.
Click → instant flip to "✓ Completed (click to unmark)" + a
button-origin confetti burst + the row persists in `lesson_completions`
in the background. Refreshing the page preserves the state. Visiting
the course detail page renders a green check next to each completed
lesson + a slightly-faded title so the eye lands on what's still
unfinished. Clicking the completed button toggles back — no particle
on unmark, just the state flip.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Toggle vs one-way | Toggle (can unmark) | Accidental clicks recoverable without operator intervention. |
| Completion trigger | Explicit click only | User-stated requirement; auto-detection on video end has too many failure modes (text-only lessons, skip-and-scrub, cross-origin iframe API). |
| Particle library | `canvas-confetti` | 11kb gzipped single-file dep, drop-in API, no React coupling. |
| Particle scope | Button-origin burst (~150 particles) | Localized celebration fits the reading context; not over-the-top. |
| Course detail visual state | Green check + faded title | User-stated requirement; clearest "what's next" disclosure. |
| Lesson page visual state | Button text switch only ("Mark as complete" ↔ "✓ Completed") | Single source of truth; no badge desync risk. |
| Optimistic UI | Optimistic flip + particle, server in background | Zero perceived latency; rollback on server error. |
| Out of scope | Cross-course dashboard, streaks/badges, chapter-level X/Y ratio, auto-completion | Each is its own slice; pulling any in doubles scope. |

## Scope

**In scope:**
- New `lesson_completions(user_id, lesson_id, completed_at)` table with composite PK + cascade FKs + own-only RLS.
- API endpoint `/api/lessons/[lessonId]/complete` (POST = mark, DELETE = unmark) using `upsert` for race safety.
- React island `MarkCompleteButton.tsx` with optimistic UI + canvas-confetti burst + in-flight ref guard.
- Lesson page mounts the island seeded with server-side initial state.
- Course detail page renders green check + faded title on completed lesson cards (signed-in only).
- `getCompletedLessonIdsForCourse` + `isLessonCompletedByUser` service helpers.
- `rls_matrix.sql` extended with own-only completions cell.
- Light operator note (`docs/operator/completions.md`) with "see my completions" + "clear for testing" recipes.

**Out of scope:**
- Cross-course progress dashboard.
- Streaks / achievement badges / completion analytics.
- Chapter-level X/Y completion ratio.
- Auto-completion on video end (YouTube/Vimeo iframe postMessage).
- Operator UI for managing completions.
- Realtime sync across tabs.
- "Are you sure?" modal on unmark.
- Display of `completed_at` timestamp in the UI.

## Architecture / Approach

```
courses → chapters → lessons ──┬─→ messages (S-02)
                                └─→ lesson_completions (S-06, NEW)
                                        ↑
                                        │ own-only RLS
                                        │ (user_id = auth.uid())
                                        ↓
                                  user_id (FK auth.users)

UI flow:
  /courses/[slug]                → green check + faded title (signed-in)
  /courses/[slug]/lessons/[…]    → MarkCompleteButton island
                                       ├─ optimistic flip + particle
                                       └─ POST/DELETE /api/lessons/[id]/complete
```

Phase 1 lands the schema + service layer + RLS probe. Phase 2 builds the
API endpoint + React island + course-detail visual state. Phase 3 ships
to prod and smoke-tests.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data layer | Migration + RLS + services + rls_matrix cell | Own-only RLS posture must use BOTH `using` and `with check` correctly for INSERT/DELETE — covered in Critical Implementation Details |
| 2. API + UI | `/api/lessons/[id]/complete` endpoint + `MarkCompleteButton.tsx` + course detail visual state | Optimistic UI rollback on server failure; double-click race needs the `useRef<boolean>` inflight guard (S-04 F4 pattern) |
| 3. Prod deploy + smoke | Migration to prod + Worker redeploy + operator doc | Standard deploy dance per `[[unstuck-production]]` memory; nothing novel |

**Prerequisites:**
- F-01 RLS posture (✅ archived).
- S-05 chapter hierarchy on course detail (✅ archived; the page we extend).
- Operator Supabase access for prod project `rhcioqeawpbuylbmkxnr`.
- Wrangler authed (✅ verified during recent deploys).

**Estimated effort:** ~3-5 hours across 3 phases. Phase 2 carries the bulk (React island + API + course-detail rendering); Phases 1 and 3 are mechanical migration + deploy work.

## Open Risks & Assumptions

- **`upsert` with `onConflict` is the right race shape.** Without it, a double-click race that bypasses the inflight ref guard (browser quirks) would hit a PK conflict. The inflight ref is the primary defense; `upsert` is the belt-and-braces backstop.
- **`canvas-confetti` ships ~11kb gzipped.** Slight bundle bloat on the lesson page but offset by its UX value. No alternative comes close on bytes-per-impact.
- **The course-detail extra query is a single PostgREST call returning IDs.** At MVP scale (<100 lesson IDs per user per course) this is trivial; no caching needed.
- **Operator can see other users' completions via service_role.** Accepted by convention — Studio bypasses RLS by design — and documented in `completions.md` as a privacy norm ("don't read other users' rows").

## Success Criteria (Summary)

- Lesson page on prod has a working "Mark as complete" button that toggles with optimistic UI, fires a confetti burst on completion, and persists across refreshes.
- Course detail page on prod renders green check + faded title on completed lesson cards for the signed-in user only.
- RLS probe asserts that user A cannot read, INSERT-with-foreign-user_id, or DELETE user B's completion rows.
