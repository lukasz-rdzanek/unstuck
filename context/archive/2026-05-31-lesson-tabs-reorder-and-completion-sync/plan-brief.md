# Lesson Tabs Reorder + Completion Sync (UNS-14) — Plan Brief

> Full plan: `context/changes/lesson-tabs-reorder-and-completion-sync/plan.md`

## What & Why

Four-part lesson aside upgrade addressing parked UNS-14: (a) Lessons
becomes the default tab so new users see course progress first, (b)
Chat tab pulses when message arrives during Lessons view (already
works after a), (c) Lessons-tab dot + dismissible banner when course
has been updated since user's last visit (requires schema migration
for view tracking), (d) bidirectional MarkComplete ↔ LessonsNav state
sync so marking a lesson complete updates its row instantly.

## Starting Point

Post UNS-13 (lesson-particles-full-viewport archived). LessonAside has
Chat as the default tab, pulse already targets non-active tab
correctly, MarkComplete and LessonsNav are sibling islands that share
state only via SSR-passed props (no inter-island communication anywhere
in the repo yet). No `updated_at` columns on `courses`/`lessons`, no
per-user view-tracking table.

## Desired End State

New users land on Lessons tab; returning users honor their stored
preference. Marking a lesson complete updates the LessonsNav row
without page reload. When operator edits course content, signed-in
users see a cyan dot on the Lessons tab + a dismissible banner — until
they dismiss it (per-course localStorage) or operator makes a newer
edit. First-visit-after-deploy never triggers a false-positive alert.

## Key Decisions Made

| Decision                          | Choice                                              | Why (1 sentence)                                                                          |
| --------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Tab default migration             | Honor existing localStorage                         | Returning users with `chat` preference unaffected; only new users see Lessons-default     |
| Pulse retarget semantics          | Reuse exact `handleChatMessageCount` logic          | Already targets non-active tab — zero code change once Lessons is the default             |
| "Course updated" source           | Add `updated_at` + trigger to courses + lessons     | Captures edits AND new lessons; standard PG pattern; one shared bump_updated_at function  |
| When to mark `last_seen_at`       | Server-side upsert on every lesson page render      | Natural; SSR already runs Promise.all of 3 queries; +50-100ms per render acceptable       |
| First-visit-after-deploy behavior | No indicator + record now()                         | Avoids false-positive alarms; users without view-history get graceful default             |
| Indicator UI                      | Tab dot + dismissible banner (both)                 | Dot visible regardless of active tab; banner self-explanatory inside Lessons panel        |
| Cross-island sync mechanism       | Window CustomEvent bus                              | No refactor; loose coupling; each island independent; first cross-island pattern in repo  |
| Sync scope                        | Only current lesson's row in LessonsNav             | Surgical, minimal re-render; matches exact user-perceived UX                              |
| Phase strategy                    | 5 phases, 4 feature-deploys + final smoke           | Match user's "commit + deploy per feature" preference (declared at start of UNS-13 batch) |

## Scope

**In scope:**
- `src/components/lesson/LessonAside.tsx` — tab order + default flip; props for indicator + dismiss logic
- `src/components/lesson/LessonsNav.tsx` — local Set state + window event listener
- `src/components/lesson/MarkCompleteButton.tsx` — CustomEvent emit on API success
- `src/lib/services/course-views.ts` (new) — getCourseLastSeenAt + upsertCourseView + getCourseUpdatedAt
- `src/pages/courses/[slug]/lessons/[lessonSlug].astro` — extend Promise.all + upsert; pass new props
- `supabase/migrations/<timestamp>_course_views_and_updated_at.sql` — new table + columns + trigger + RLS
- 4 prod deploys + final smoke

**Out of scope:**
- Force-resetting localStorage for existing users (honor their choice)
- Smarter pulse semantics (author-aware, counter badges) — over-engineering
- Lifting state via wrapper React island — would destroy Astro SSR; deliberate per S-07 lesson
- Supabase realtime for `lesson_completions` multi-tab sync — overkill for MVP
- Backfilling `course_views` for existing users — graceful first-visit default suffices
- Lesson-level "last seen" tracking — course scope is enough
- Tests (no test infra)
- Extending RLS regression probe for course_views — filed as follow-up

## Architecture / Approach

```
Phase 1: LessonAside.tsx — JSX swap + loadTab default
   ↓ commit + deploy
Phase 2: MarkCompleteButton emits CustomEvent → LessonsNav listens
   ↓ commit + deploy
Phase 3: migration (updated_at + course_views + trigger + RLS) +
         service helpers + lessonSlug.astro parallel queries + upsert
   ↓ db push + commit + deploy
Phase 4: LessonAside reads courseUpdatedAt + lastSeenAt props,
         renders tab dot + banner; dismiss persists localStorage
   ↓ commit + deploy
Phase 5: end-to-end smoke (no code)
```

Window event namespace: `unstuck:lesson-completion-changed` — first
event in a project-wide convention `unstuck:<feature>:<action>`.

## Phases at a Glance

| Phase | What it delivers                                       | Key risk                                                                                |
| ----- | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1     | Lessons-first default + automatic pulse retarget       | None — localStorage migration is honor-existing                                         |
| 2     | MarkComplete → LessonsNav row sync via CustomEvent     | Event listener cleanup on unmount; LessonsNav's local Set drift from server truth      |
| 3     | Schema + view tracking + helpers                       | RLS policies (3 per-op + implicit no-DELETE); upsert race if two tabs visit same page  |
| 4     | Tab dot + dismissible banner UI                        | Dismiss persistence semantics (per-course key, supersedes when newer update lands)     |
| 5     | E2E smoke on prod                                      | None                                                                                    |

**Prerequisites:** UNS-13 archived (✓); `.dev.vars` recipe applies in each phase deploy; `supabase db push` access for Phase 3.
**Estimated effort:** ~4-5h across 5 phases (most overhead is per-phase deploy ritual ×4).

## Open Risks & Assumptions

- **Cumulative deploy time**: 4 prod deploys × ~3min each = ~12 min of
  build+deploy overhead. Accepted tradeoff for deploy-per-feature
  granularity (user preference).
- **`getCourseUpdatedAt` implementation**: depends on whether
  PostgREST embed `courses?select=updated_at,lessons(updated_at)`
  shape is clean or needs a dedicated SQL view. Decide at
  implementation time.
- **CustomEvent name collisions**: window namespace is global; first
  use in repo establishes the `unstuck:<feature>:<action>` convention.
  Document inline.
- **`course_views` upsert race**: two tabs on the same lesson page may
  upsert concurrently. PG `ON CONFLICT (user_id, course_id)` handles
  it cleanly — last-write-wins is correct semantics.
- **RLS regression probe coverage**: deferred follow-up.

## Success Criteria (Summary)

- New incognito user lands on Lessons tab (not Chat); returning user
  with `chat` preference is undisturbed.
- Marking a lesson complete updates the LessonsNav row in <100ms
  (event dispatch + setState round-trip), no page reload.
- Operator-edited course shows cyan dot + dismissible banner to
  signed-in users; dismiss persists per-course; new edit re-triggers
  indicator.
- All four features ship to prod, end-to-end manual smoke clean, no
  regressions to chat/particles/aside-collapse/prev-next/badge.
