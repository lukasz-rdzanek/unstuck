# Lesson Chapters & Types Implementation Plan

## Overview

Add chapters as a named, ordered grouping of lessons inside a course,
and let lessons exist either as today's video+markdown shape OR as
text-only (no video embed). The single existing prod course
(`generative-ai-leader`) is migrated cleanly via an auto-created
"Introduction" chapter that owns the existing `introduction` lesson, so
shared links keep working. The course detail page renders chapters
always-expanded with their lessons inline; the lesson page collapses to
markdown-only when `video_url` is null. URL structure stays flat — no
chapter slug in the path — to preserve every link already in circulation.

## Current State Analysis

Today's schema (per F-01, archived at
`context/archive/2026-05-28-lesson-chat-data-model/`) treats a course as
a flat ordered list of lessons:

- `supabase/migrations/20260528122957_lesson_chat_schema.sql` —
  `lessons` has `course_id` FK, `slug`, `title`, `position`,
  `video_url text NOT NULL`, `content_md text DEFAULT ''`, with
  `unique (course_id, slug)` (URL routing) and `unique (course_id, position)`
  (display ordering).
- `src/lib/services/courses.ts:46` — `listLessonsForCourse(supabase, courseId)`
  returns `Lesson[]` ordered by position. There is no chapter concept.
- `src/pages/courses/[slug]/index.astro:14` — course detail renders a
  single `<ol>` of lessons. No grouping.
- `src/pages/courses/[slug]/lessons/[lessonSlug].astro:21` — lesson page
  calls `parseVideoUrl(lesson.video_url)` and assumes video is always
  present; the rendered layout always reserves a video region.
- `src/types.ts` — `Lesson` and `LessonRow` types reflect the current
  schema; no `Chapter` type exists.
- `supabase/seed.sql` seeds 1 course + 1 lesson + 3 operator messages
  for local dev. Prod (project `rhcioqeawpbuylbmkxnr`) has the same
  shape — 1 course `generative-ai-leader`, 1 lesson `introduction`, 3
  seeded messages.
- `supabase/tests/rls_matrix.sql` covers the 4 existing tables; a new
  `chapters` table needs its own cell (anon readable like `courses`).
- RLS on `lessons` is gated by `has_course_access(course_id)`; chapters
  should mirror the `courses` posture (anon-readable) so the catalog and
  course detail render without a session (matches the S-01 anonymous
  course-detail UX).
- ChatPanel (`src/components/chat/ChatPanel.tsx`) scopes to `lesson_id`;
  chapters do not interact with chat — out of scope.

## Desired End State

A course can be authored as one or more chapters, each containing zero
or more lessons. The course detail page renders each chapter as a
heading with its lessons listed below it in chapter-local order. A
lesson may be a video lesson (`video_url` populated, current
behavior) or a text-only lesson (`video_url` null, markdown body takes
the full page width with no video region rendered). The existing
single prod lesson lives under an auto-created "Introduction" chapter
of the `generative-ai-leader` course; its URL
`/courses/generative-ai-leader/lessons/introduction` continues to
resolve unchanged. Operator-side, adding a new chapter and assigning
lessons to it is documented in `docs/operator/chapters.md` as a Studio
SQL recipe (no in-product UI per PRD non-goals).

### Key Discoveries:

- The existing `unique (course_id, slug)` constraint on `lessons` lets
  us keep the flat URL `/courses/<slug>/lessons/<lessonSlug>` even
  after introducing chapters — lesson slugs stay unique within a
  course regardless of chapter assignment. No URL rewrites required.
- `lessons.position` is currently unique per course; with chapters the
  semantic shifts to "position within chapter" → the constraint must
  drop and a new `unique (chapter_id, position)` takes its place.
- `chapters` should be anon-readable (like `courses`) so the course
  detail page renders without authentication, matching S-01's existing
  anonymous-friendly catalog. `lessons` stays gated; the chapter
  heading shows but the underlying lessons only become clickable for
  signed-in users (existing `showLessons` branch in
  `src/pages/courses/[slug]/index.astro`).
- The migration of the existing prod row is deterministic: for every
  course, create one chapter with `slug='introduction'`, `title='Introduction'`,
  `position=1`, then `UPDATE lessons SET chapter_id = <that chapter's id>`
  for that course's lessons. Works whether the course has 1 lesson
  (prod today) or many.
- `parseVideoUrl` already returns null for unparseable strings; the
  lesson page just needs to branch on `lesson.video_url == null` *before*
  the parse, not change the parse helper.

## What We're NOT Doing

- **Lesson navigation panel (prev/next, jump-to)** — scope of S-07
  (lesson nav panel + chat collapse). The lesson page stays
  single-page-no-nav in S-05; user backs out via the existing
  "← All courses" affordance on the course detail.
- **Per-user lesson completion tracking** — scope of S-06. No
  `lesson_completions` table, no "Mark complete" button, no progress
  visualization in this slice.
- **Multi-course catalog UX** — MVP stays with 1 course. No filtering,
  no tag system, no course-level categorization.
- **Operator UI for CRUD on chapters/lessons** — per PRD non-goal
  (operator works through Studio SQL); we document the SQL patterns
  in `docs/operator/chapters.md` instead.
- **Nested chapters (chapter → sub-chapter → lesson)** — single-level
  is sufficient for the current course scope. Re-evaluate when a real
  course needs >10 chapters or genuine sub-grouping.
- **Chapter slug in URL** — `/courses/<slug>/<chapterSlug>/<lessonSlug>`
  would break every shared link. Chapter context is rendered as
  navigation breadcrumb only, never appears in the path.
- **Reordering chapters/lessons via the app** — operator does it via
  SQL `UPDATE position`. Documented in chapters.md.
- **Chapter-level RLS gates** — `has_course_access` continues to gate
  `lessons` only; chapters are public metadata (like course titles).

## Implementation Approach

Three sequential phases, each independently verifiable. Phase 1 is the
data layer in one shot — schema migration (chapters + lessons FK +
video_url nullable + constraint swap), the existing-data backfill, type
regeneration, and one new service function — so the rest of the work
has a clean foundation. Phase 2 is purely the UI layer touching exactly
two pages (course detail, lesson page); no schema or service changes.
Phase 3 is the operator-facing close-out: docs + `supabase db push` to
prod + Worker redeploy + smoke. The boundary between Phase 1 and
Phase 2 lets us verify the data shape against the existing UI before
restructuring the UI; the boundary between Phase 2 and Phase 3 lets us
fully test locally before any prod-touching action.

## Critical Implementation Details

- **Migration ordering matters**. The single migration file must
  execute these steps in this order, all inside one transaction (the
  default Supabase migration wrapper):
  1. `CREATE TABLE public.chapters (...)` with constraints + indexes +
     RLS enable + the anon-readable + authenticated-readable policies.
  2. For each existing row in `courses`, `INSERT INTO chapters` a
     default "Introduction" chapter (slug='introduction', position=1).
  3. `ALTER TABLE lessons ADD COLUMN chapter_id uuid REFERENCES chapters(id) ON DELETE CASCADE` —
     **nullable initially**.
  4. `UPDATE lessons SET chapter_id = c.id FROM chapters c WHERE c.course_id = lessons.course_id`
     (backfill — every existing lesson now belongs to its course's
     default chapter).
  5. `ALTER TABLE lessons ALTER COLUMN chapter_id SET NOT NULL` (now
     safe because all rows backfilled).
  6. `ALTER TABLE lessons DROP CONSTRAINT lessons_course_id_position_key`
     and `ADD CONSTRAINT lessons_chapter_id_position_key UNIQUE (chapter_id, position)`.
  7. `ALTER TABLE lessons ALTER COLUMN video_url DROP NOT NULL`.
  8. `CREATE INDEX lessons_chapter_id_idx ON lessons (chapter_id)`.
  If steps run out of order (e.g. NOT NULL set before backfill), the
  whole migration aborts cleanly thanks to the transaction wrap.
- **`unique (course_id, slug)` on `lessons` stays unchanged**. This is
  what lets the flat URL keep working — slug uniqueness is per-course,
  not per-chapter. A new lesson in a different chapter still cannot
  reuse a slug already taken in the same course.

## Phase 1: Data layer — schema migration + services

### Overview

Land the schema change, regenerate types, expose a single new service
that returns the grouped shape the UI needs. After this phase the DB
has chapters and the existing lesson is properly assigned, but the UI
is unchanged (still uses `listLessonsForCourse`); the new
`listChaptersWithLessonsForCourse` is dormant until Phase 2 wires it in.

### Changes Required:

#### 1. New migration — chapters table + lessons FK + video_url nullable + backfill

**File**: `supabase/migrations/20260530120000_lesson_chapters.sql` (new)

**Intent**: Land the entire schema delta in one transactional migration:
create the `chapters` table with RLS matching the `courses` posture,
backfill a default chapter per existing course, add a `chapter_id` FK
on `lessons` (NOT NULL after backfill), swap the per-course position
uniqueness for per-chapter, and drop the NOT NULL on `lessons.video_url`.
Use the canonical "Introduction" chapter title + slug for the backfill.

**Contract**: One SQL file with the 8 ordered steps from "Critical
Implementation Details" above. Use existing F-01 patterns
(`supabase/migrations/20260528122957_lesson_chat_schema.sql`) for
column types, comments, RLS enable+force, and policy naming. Concrete
field set for `chapters`:
- `id uuid primary key default gen_random_uuid()`
- `course_id uuid not null references public.courses(id) on delete cascade`
- `slug text not null` — kebab-case, unique within course
- `title text not null` — display label
- `position integer not null` — chapter order within course
- `created_at timestamptz not null default now()`
- `unique (course_id, slug)`, `unique (course_id, position)`
- index on `course_id`
- RLS enabled + forced; two policies: `select` for `anon` and
  `authenticated` (everyone can read chapter metadata, mirroring
  `courses`). No insert/update/delete policies — operator uses
  `service_role` for any mutation, same as for `courses`.

#### 2. Update `supabase/seed.sql`

**File**: `supabase/seed.sql`

**Intent**: Add a default `chapters` row for the seeded course and
reference it in the seeded lesson, so a `db reset` produces a complete
chapter-aware fixture.

**Contract**: INSERT one chapter row with `slug='introduction'`,
`title='Introduction'`, `position=1` for the seeded course; reference
its id in the existing lesson INSERT via subquery (or DECLARE+SELECT
into a local var). Existing operator messages stay unchanged
(reference `lesson_id`, not `chapter_id`).

#### 3. Regenerate `src/lib/db/database.types.ts`

**File**: `src/lib/db/database.types.ts`

**Intent**: Pick up the new `chapters` table and the modified
`lessons` columns so TypeScript sees `chapter_id` and the nullable
`video_url`.

**Contract**: Run `npx supabase gen types typescript --local | grep -v "Connecting to db"` (the F-01-documented CLI quirk filter) and overwrite the file.
Verify the new `chapters` table appears in `Database["public"]["Tables"]`
and that `lessons.Row["video_url"]` is now `string | null`.

#### 4. Extend `src/types.ts`

**File**: `src/types.ts`

**Intent**: Add the high-level `Chapter` type and a composite
`ChapterWithLessons` type that the new service returns. Update `Lesson`
to reflect that `video_url` is nullable.

**Contract**: New exports:
- `Chapter` = `Tables<"chapters">["Row"]`
- `ChapterWithLessons` = `Chapter & { lessons: Lesson[] }`
The existing `Lesson` / `LessonRow` types auto-update through the
regenerated `database.types.ts` (no manual edit needed for the
`video_url` nullability — it propagates).

#### 5. New service — `listChaptersWithLessonsForCourse`

**File**: `src/lib/services/courses.ts`

**Intent**: Return the grouped shape the course detail page needs in a
single query (chapters ordered by position, each with its lessons
ordered by their per-chapter position). The existing
`listLessonsForCourse` stays untouched for the moment — Phase 2 swaps
the page to the new function but keeping both during Phase 1 lets us
verify the data layer without touching UI.

**Contract**: New exported async function:
- Signature: `(supabase: SupabaseClient, courseId: string) => Promise<ChapterWithLessons[]>`
- Uses a single PostgREST query with the embed syntax:
  `chapters?select=*,lessons(*)&course_id=eq.<id>&order=position.asc&lessons.order=position.asc`
- Returns `[]` on error (logs via `console.error`, matches existing
  service convention in this file).
- Empty-chapter case (no lessons): `lessons` will be `[]`, not
  missing — the page renders the placeholder.

#### 6. Extend `supabase/tests/rls_matrix.sql` with a chapters cell

**File**: `supabase/tests/rls_matrix.sql`

**Intent**: Regression-proof the chapters RLS posture (anon + authenticated
both readable, no insert/update/delete policies). Follows the existing
cell pattern (Cell 1 anon, Cell 5 auth-delete-denial).

**Contract**: After the existing fixture setup, insert one chapter row
for the test course; add an "anon chapters readable" assertion (`select
count(*) from public.chapters` returns >=1 as anon, not 0). Add an
"authenticated chapters readable" assertion. Add an "anon chapter
insert denied" assertion (mirrors the existing message insert denial
pattern). Optionally extend Cell 5 with a chapter-delete denial. Keep
the file self-contained: rollback at the end.

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

- In Studio SQL: `select id, slug, title, position from public.chapters where course_id = (select id from public.courses where slug = 'react-architecture-deep-dive' /* or your seed course */)` returns the auto-created "Introduction" row.
- In Studio SQL: `select id, slug, chapter_id, video_url from public.lessons` shows every lesson has a non-null `chapter_id`, and the seed lesson keeps its existing `video_url`.
- Calling `listChaptersWithLessonsForCourse` in a scratch test (import + log) returns the expected shape: one chapter with one lesson nested under it.

---

## Phase 2: UI — course detail hierarchy + lesson page text-only branch

### Overview

Swap the course detail page from the flat lesson list to the chapter →
lessons hierarchy, and add the text-only branch on the lesson page.
Both edits are localized to two existing files; no new components.
Pure UI work — no schema, no services beyond the one added in Phase 1.

### Changes Required:

#### 1. Course detail page — always-expanded chapters with lessons inline

**File**: `src/pages/courses/[slug]/index.astro`

**Intent**: Replace the single flat `<ol>` of lessons with a per-chapter
section: each chapter renders its title as an `<h2>`, followed by its
lessons in an `<ol>` matching the existing lesson-card styling. Empty
chapters render the title plus a muted placeholder ("No lessons yet").
The signed-in vs anonymous branch stays (chapters render for everyone,
but lesson cards are only clickable for signed-in users — fall back to
"Sign in to view lessons" CTA from S-01).

**Contract**: Swap the call site from `listLessonsForCourse(supabase, course.id)`
to `listChaptersWithLessonsForCourse(supabase, course.id)`. Loop over
chapters, render `<section>` per chapter with `<h2>` heading + nested
`<ol>` of lessons (existing `<li><a>` block reused per lesson). Empty-chapter
branch: `chapter.lessons.length === 0` → render a muted `<p>` saying
"No lessons in this chapter yet." Anonymous branch: keep the existing
"Sign in to view lessons" CTA but render it once at the page level
when ANY chapter has lessons but the user is unauthenticated — don't
duplicate per chapter.

#### 2. Lesson page — text-only branch (video_url null)

**File**: `src/pages/courses/[slug]/lessons/[lessonSlug].astro`

**Intent**: When `lesson.video_url === null`, skip the video embed
region entirely and render the markdown content in a full-width layout.
When `video_url` is present, current behavior unchanged. The video
region is the only thing that gates on this — markdown rendering,
ChatPanel, page chrome all stay.

**Contract**: Wrap the existing video-embed block in a conditional
`{video && (...)}` — when null, no DOM rendered for that region. Layout
adjustment: when video is null, the content_md region's max-width
either expands or stays the same (designer call — recommended:
stays the same so single-column reading width is preserved on wide
screens; the video region's absence just shifts content up). Add a
small visual marker at the top of the markdown body for text-only
lessons (e.g., a "Reading" badge with `lucide-react` `BookOpen` icon)
so users immediately know this lesson has no video. Keep ChatPanel
mount conditions unchanged (chat works the same for both lesson types).

### Success Criteria:

#### Automated Verification:

- `npm run lint` exits 0.
- `npx astro check` exits 0.
- `npm run build` exits 0.

#### Manual Verification:

- Local `/courses/<seed-course-slug>` renders the "Introduction" chapter heading with the seed lesson listed under it (not a flat list).
- Adding a second chapter manually via Studio SQL (`INSERT INTO chapters ... VALUES ('seed-course-id', 'extras', 'Extras', 2, now())`) without any lessons: course detail page renders the "Extras" heading + "No lessons in this chapter yet." placeholder, with no broken layout.
- Adding a text-only lesson via Studio SQL (`INSERT INTO lessons ... VALUES (..., chapter_id_for_extras, 'reading-1', 'Reading: …', 1, NULL, '# Some markdown body', now())`) renders on the lesson page with NO video region and the "Reading" badge.
- The original video lesson `/courses/<slug>/lessons/introduction` still renders the video embed + markdown + ChatPanel as before (zero regression).
- Anonymous visit to course detail renders chapter headings + the "Sign in to view lessons" CTA (existing S-01 behavior preserved).

---

## Phase 3: Operator docs + prod deploy + smoke

### Overview

Ship the change to prod and document the operator-facing workflow.
Single push of the new migration via `supabase db push`, then app
redeploy via `wrangler`, then manual smoke test of the existing
prod course.

### Changes Required:

#### 1. New `docs/operator/chapters.md`

**File**: `docs/operator/chapters.md` (new)

**Intent**: Give the operator copy-paste SQL recipes for the common
chapter-authoring operations, mirroring the style of
`docs/operator/seeding.md` and `docs/operator/moderation.md`.

**Contract**: New markdown file with these sections:
- **Prerequisites** — Supabase Studio access for prod project.
- **Add a new chapter to a course** — full INSERT with position
  computation (next available integer within course).
- **Add a video lesson to a chapter** — INSERT with `video_url` set.
- **Add a text-only lesson to a chapter** — INSERT with `video_url
  IS NULL`, `content_md` set.
- **Reorder chapters within a course** — `UPDATE chapters SET position
  = ... WHERE id = ...` recipe with a hint about the per-course
  uniqueness constraint (do it inside a transaction with two updates if
  swapping).
- **Rename or move a chapter** — `UPDATE chapters SET title = ...`,
  noting that slug change would break any (unlikely) shared chapter
  URLs (we don't expose chapter slugs in URLs, but document anyway).
- All SQL blocks use `$$ … $$` dollar-quoting where strings may
  contain apostrophes (matches the convention established in
  `docs/operator/moderation.md` per S-03 plan-review F2).

#### 2. Deploy migration to prod Supabase

**File**: External (prod Supabase via CLI)

**Intent**: Apply the same migration that landed locally to the prod
project `rhcioqeawpbuylbmkxnr`.

**Contract**: `npx supabase db push` from the project root with the
`SUPABASE_ACCESS_TOKEN` env / linked project context already set
from F-01 Phase 4. The push applies
`20260530120000_lesson_chapters.sql` and runs the backfill against
prod's single existing lesson `introduction` (auto-create "Introduction"
chapter, assign the lesson). Verify post-push by running the manual
checks from Phase 1 against the prod project.

#### 3. Deploy app code to prod Cloudflare Worker

**File**: External (build + wrangler deploy)

**Intent**: Push the Phase 2 UI changes to the live Worker so the
course detail page renders chapter hierarchy and the lesson page
handles text-only.

**Contract**: Same dance as the S-04 deploy steps (recorded in
`[[unstuck-production]]` memory): move `.dev.vars` aside, build with
prod `SUPABASE_URL`/`SUPABASE_KEY` env vars, `npx wrangler deploy`,
restore `.dev.vars`. Verify the prod Worker URL renders the chapter
hierarchy and the existing lesson still loads.

### Success Criteria:

#### Automated Verification:

- `npx supabase db push` exits 0 (migration applied to prod) and the
  post-push `gen types --linked` produces no schema diff against the
  local-generated `database.types.ts`.
- Post-deploy `curl -sS https://unstuck.lukasz-rdzanek.workers.dev/courses/generative-ai-leader` returns HTTP 200 and the response HTML contains the string `"Introduction"` (the auto-created chapter title).
- Post-deploy `curl -sS https://unstuck.lukasz-rdzanek.workers.dev/courses/generative-ai-leader/lessons/introduction` returns HTTP 302 to signin (the existing protected-route behavior, unchanged).

#### Manual Verification:

- In prod Studio SQL: `select * from public.chapters` returns the auto-created "Introduction" chapter for `generative-ai-leader`.
- Visit https://unstuck.lukasz-rdzanek.workers.dev/courses/generative-ai-leader as anon → "Introduction" chapter heading visible above the "Sign in to view lessons" CTA.
- Sign in as operator → same URL → "Introduction" chapter heading + the existing lesson card clickable.
- Click into the lesson → video + markdown + ChatPanel all work as before, no regression.
- Manually add a text-only lesson via Studio SQL recipe from `docs/operator/chapters.md` to a fresh chapter; verify it renders correctly with the "Reading" badge and no video region.

---

## Testing Strategy

### Unit Tests:

None for S-05 (repo carries no test suite; testing strategy enters in
Module 3 of the curriculum). Verification is automated-check +
manual-walk + rls_matrix.sql probe.

### Integration Tests:

The RLS regression probe (`supabase/tests/rls_matrix.sql`) gets the
new chapters cell in Phase 1; re-runs as part of every Phase 1
automated check.

### Manual Testing Steps:

End-to-end after Phase 3 ships:

1. As anon, visit `/courses/generative-ai-leader` → see "Introduction"
   chapter heading with "Sign in to view lessons" CTA below.
2. Sign in → same URL → chapter heading + lesson card visible and
   clickable.
3. Click into lesson → video plays, markdown renders, chat works.
4. Operator opens Studio, follows the chapters.md recipe to add an
   "Extras" chapter and a text-only "Reading: AI ethics overview"
   lesson under it.
5. Refresh course detail page → "Extras" chapter heading visible
   with the new lesson card below.
6. Click into the text-only lesson → markdown-only layout, "Reading"
   badge present, ChatPanel mounted and posting works.

## Performance Considerations

The PostgREST embed query (`chapters?select=*,lessons(*)`) returns
nested JSON; for a course with 5 chapters and 30 lessons total that's
~5KB of JSON — negligible. No caching needed at MVP scale. The
chapters table joins via existing `course_id` index; lesson lookup by
`chapter_id` gets the new `lessons_chapter_id_idx`.

## Migration Notes

The Phase 1 migration is forward-only with a transactional wrap. Roll-
back path: drop the migration file, run `npx supabase db reset`
locally; on prod, manually `ALTER TABLE lessons DROP COLUMN chapter_id`
+ `DROP TABLE chapters` + restore `video_url NOT NULL` + restore old
unique. The single existing prod lesson would survive (its content is
preserved through the column drop). Documented in chapters.md as the
rollback recipe under a "Emergency revert" section.

## References

- Related change: `context/changes/lesson-chapters-and-types/change.md`
- F-01 schema (foundation): `context/archive/2026-05-28-lesson-chat-data-model/plan.md`
- F-01 RLS matrix probe: `supabase/tests/rls_matrix.sql`
- S-01 course / lesson pages: `src/pages/courses/[slug]/index.astro`, `src/pages/courses/[slug]/lessons/[lessonSlug].astro`
- S-03 operator doc style: `docs/operator/moderation.md`
- Memory pointer: `[[unstuck-production]]` (prod Supabase ref, Worker URL, `.dev.vars` build gotcha — applies in Phase 3).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer — schema migration + services

#### Automated

- [x] 1.1 `npx supabase db reset` exits 0 after new migration — b724b36
- [x] 1.2 `npx supabase db lint` reports no new warnings — b724b36
- [x] 1.3 RLS matrix probe passes — chapters cell prints PASS — b724b36
- [x] 1.4 Re-running `npx supabase gen types typescript --local` produces no diff against committed `database.types.ts` — b724b36
- [x] 1.5 `npx astro check` exits 0 — b724b36
- [x] 1.6 `npm run lint` exits 0 — b724b36
- [x] 1.7 `npm run build` exits 0 — b724b36

#### Manual

- [x] 1.8 Studio SQL confirms auto-created "Introduction" chapter exists per existing course — b724b36
- [x] 1.9 Every existing lesson has a non-null `chapter_id` after migration; `video_url` preserved — b724b36
- [x] 1.10 Scratch test of `listChaptersWithLessonsForCourse` returns one chapter with one lesson nested — b724b36

### Phase 2: UI — course detail hierarchy + lesson page text-only branch

#### Automated

- [x] 2.1 `npm run lint` exits 0
- [x] 2.2 `npx astro check` exits 0
- [x] 2.3 `npm run build` exits 0

#### Manual

- [ ] 2.4 Local `/courses/<seed-course-slug>` renders chapter heading with lessons under it (not flat)
- [ ] 2.5 Empty chapter renders "No lessons in this chapter yet." placeholder, no broken layout
- [ ] 2.6 Text-only lesson (video_url IS NULL) renders markdown-only with "Reading" badge and no video region
- [ ] 2.7 Original video lesson `/courses/<slug>/lessons/introduction` still renders video + markdown + ChatPanel unchanged
- [ ] 2.8 Anonymous visit to course detail renders chapter heading + "Sign in to view lessons" CTA (S-01 behavior preserved)

### Phase 3: Operator docs + prod deploy + smoke

#### Automated

- [ ] 3.1 `npx supabase db push` exits 0 (migration applied to prod)
- [ ] 3.2 Post-push `gen types --linked` produces no diff against local-generated `database.types.ts`
- [ ] 3.3 `curl /courses/generative-ai-leader` on prod returns HTTP 200 and HTML contains "Introduction"
- [ ] 3.4 `curl /courses/generative-ai-leader/lessons/introduction` on prod returns HTTP 302 to signin (unchanged)

#### Manual

- [ ] 3.5 Prod Studio: `select * from public.chapters` returns auto-created "Introduction" chapter for `generative-ai-leader`
- [ ] 3.6 Prod as anon: course detail page shows "Introduction" chapter heading above the signin CTA
- [ ] 3.7 Prod signed-in: chapter heading + clickable lesson card; click renders lesson page unchanged
- [ ] 3.8 Operator follows chapters.md recipe to add an "Extras" chapter + text-only lesson; renders correctly on prod
