# Lesson Chapters & Types — Plan Brief

> Full plan: `context/changes/lesson-chapters-and-types/plan.md`

## What & Why

Add chapters as a named, ordered grouping of lessons inside a course,
and allow lessons to exist as text-only (no video embed) in addition
to today's video+markdown shape. Today every course is a flat list of
video lessons — the moment a real course needs a "Module 1 / Module 2"
structure or a written-only "Reading" lesson, the data model can't
express it. This slice closes that gap before S-06 (completion
tracking) and S-07 (nav panel) build on top.

## Starting Point

F-01 ships `courses` and a flat `lessons` table with `position` unique
per course, `video_url` NOT NULL, `content_md` defaulted to empty
string. The single existing prod course (`generative-ai-leader`) has
one lesson (`introduction`); seed.sql mirrors that locally. Course
detail (`src/pages/courses/[slug]/index.astro`) renders one `<ol>` of
all lessons; lesson page assumes `video_url` is present.

## Desired End State

A course is one or more chapters; each chapter has zero or more
lessons; each lesson is either video+markdown or text-only. The course
detail page renders each chapter heading with its lessons inline
below (always-expanded, no JS collapse). The lesson page renders the
markdown body full-width when `video_url` is null, with a small
"Reading" badge to signal the lesson type. The existing prod lesson
lives under an auto-created "Introduction" chapter; its URL
`/courses/generative-ai-leader/lessons/introduction` keeps working
unchanged so no shared link breaks.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Chapters shape | Separate `chapters` table with FK from `lessons` | Clean separation, future-proof for chapter-level metadata; matches F-01 table style. |
| Text-only discriminator | `lessons.video_url` nullable (presence = video lesson) | Smallest schema change; natural `if video_url` semantics; no enum to keep in sync. |
| Migration of existing data | Auto-create "Introduction" chapter per course; backfill `lessons.chapter_id` | Zero data loss; URL stays the same; operator can rename later. |
| URL structure | Keep flat `/courses/<slug>/lessons/<lessonSlug>` | Zero broken links; chapter context is navigation, not path. |
| Course detail UI | Always-expanded chapters with lessons inline | Zero-JS, fits MVP scale (1 course, ~10 chapters expected), matches existing server-rendered pattern. |
| Lesson navigation | OUT — that's S-07 (nav panel + chat collapse) | Single concern per slice; back-to-course CTA stays. |
| Empty chapter | Allowed; placeholder copy ("No lessons in this chapter yet.") | Supports operator authoring flow (plan chapters, then fill). |
| Operator UI | OUT — Studio SQL via `docs/operator/chapters.md` recipes | PRD non-goal; matches the seeding.md / moderation.md pattern. |

## Scope

**In scope:**
- New `chapters` table + RLS (anon-readable like `courses`).
- `lessons.chapter_id` NOT NULL FK; `lessons.video_url` nullable.
- Position semantics shift from per-course to per-chapter.
- Backfill migration: auto-create "Introduction" chapter per course, assign existing lessons.
- New service: `listChaptersWithLessonsForCourse`.
- Course detail page renders chapters hierarchy.
- Lesson page handles `video_url IS NULL` (markdown-only layout + "Reading" badge).
- Operator doc `docs/operator/chapters.md`.
- Prod migration + Worker redeploy + smoke.
- `rls_matrix.sql` extended with chapters cell.

**Out of scope:**
- Lesson navigation (prev/next, jump-to) — S-07.
- Per-user lesson completion tracking — S-06.
- Multi-course catalog UX.
- Operator UI for chapter/lesson CRUD.
- Nested chapters (sub-chapters).
- Chapter slug in URL.
- Chapter-level RLS gates (lessons stay gated via `has_course_access`; chapters are public metadata).

## Architecture / Approach

```
courses (1) ──── (N) chapters (1) ──── (N) lessons (1) ──── (N) messages
                                                            (S-02, unchanged)

URL routing stays flat:
  /courses/<slug>                          → course detail (chapter hierarchy)
  /courses/<slug>/lessons/<lessonSlug>     → lesson page (video OR text-only)

Service layer:
  listChaptersWithLessonsForCourse(supabase, courseId)
    → single PostgREST embed query: chapters?select=*,lessons(*)
    → returns ChapterWithLessons[]
```

Phase 1 lands the schema + service in one shot; Phase 2 is pure UI
on two existing pages; Phase 3 is operator docs + prod deploy.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data layer | Migration + types regen + new service + rls_matrix cell | Migration ordering — must run inside one transaction so partial-fail rolls back; critical implementation detail spells out the 8 ordered steps |
| 2. UI | Course detail hierarchy + lesson page text-only branch | Lesson page layout for text-only (full-width vs preserved-width); recommended: stay narrow for reading comfort |
| 3. Operator docs + prod deploy | chapters.md + supabase db push + wrangler deploy + smoke | Prod migration mirrors local — single existing lesson `introduction` gets auto-assigned to auto-created "Introduction" chapter |

**Prerequisites:**
- F-01 schema (✅ archived, deployed to prod).
- S-01 course/lesson pages (✅ archived, deployed).
- Operator Supabase access for prod project `rhcioqeawpbuylbmkxnr`.
- Wrangler authed (✅ confirmed during S-04 deploy).

**Estimated effort:** ~3-5 hours across 3 phases. Phase 1 is the biggest (migration design + types + service + tests); Phases 2-3 are localized edits + ship.

## Open Risks & Assumptions

- **Backfill assumes exactly one default chapter per course is acceptable.** True for prod today (1 course); if at the time of prod migration more courses exist, all get the same "Introduction" chapter title — operator must rename via SQL post-migration if they want different defaults.
- **PostgREST embed query with ordering on the embedded resource (`lessons.order=position.asc`) works correctly.** Standard PostgREST feature; verified by F-01's similar embed pattern in `src/lib/services/messages.ts` (`author:profiles!messages_author_id_fkey(id, display_name)`).
- **`supabase db push` to prod will not require any manual intervention.** The migration is purely additive (new table, new column, dropped NOT NULL) with the backfill scoped inside the same transaction. F-01 Phase 4 established the `db push` pattern; same approach here.
- **Operator does not need to rename the auto-created "Introduction" chapter for v1 launch.** "Introduction" is a sensible default; we don't block on operator action.

## Success Criteria (Summary)

- Local course detail page shows the auto-created "Introduction" chapter heading above the existing lesson card.
- Prod's existing lesson URL `/courses/generative-ai-leader/lessons/introduction` continues to work (zero regression).
- An operator can add a chapter + a text-only lesson via Studio SQL using the recipes in `docs/operator/chapters.md`, and both render correctly without an app restart.
