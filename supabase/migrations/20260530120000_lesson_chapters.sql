-- ============================================================================
-- S-05 / Phase 1: Lesson Chapters & Types
-- ============================================================================
-- Introduces a `chapters` table that groups lessons within a course, switches
-- lesson position uniqueness from per-course to per-chapter, makes the lesson
-- video_url nullable (text-only lesson support), and backfills every existing
-- course with a default "Introduction" chapter that owns all of its lessons —
-- so today's flat lesson list keeps working unchanged.
--
-- Step ordering matters (the whole file runs inside one Supabase transaction):
--   1. Create chapters table + RLS posture (anon-readable like courses).
--   2. Insert a default "Introduction" chapter per existing course.
--   3. Add lessons.chapter_id (nullable initially).
--   4. Backfill lessons.chapter_id from each course's default chapter.
--   5. Promote lessons.chapter_id to NOT NULL (safe now — every row backfilled).
--   6. Swap the per-course position constraint for a per-chapter one.
--   7. Drop NOT NULL on lessons.video_url (text-only lessons can omit a video).
--   8. Add index on lessons.chapter_id for the chapter-scoped reads.
--
-- The flat URL contract is preserved: lessons.slug stays unique per course,
-- so /courses/<slug>/lessons/<lessonSlug> resolves the same way regardless of
-- chapter assignment.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. chapters (named ordered grouping of lessons within a course)
-- ----------------------------------------------------------------------------
create table public.chapters (
  id          uuid        primary key default gen_random_uuid(),
  course_id   uuid        not null references public.courses(id) on delete cascade,
  slug        text        not null,
  title       text        not null,
  position    integer     not null,
  created_at  timestamptz not null default now(),
  unique (course_id, slug),
  unique (course_id, position)
);

create index chapters_course_id_idx on public.chapters (course_id);

comment on table public.chapters is
  'Named grouping of lessons within a course. Anon-readable like courses (public metadata). Lesson gating still flows through has_course_access on lessons.';

-- RLS posture: chapters are public metadata (catalog rendering), mirroring
-- courses. Lessons stay gated via has_course_access; chapter membership of a
-- lesson does not change who can read the lesson itself.
alter table public.chapters enable row level security;
alter table public.chapters force  row level security;

create policy "chapters_select_public"
  on public.chapters
  for select
  to anon, authenticated
  using (true);

-- No write policies → chapter authoring is service_role only (matches the
-- courses/lessons posture; operator manages via Studio SQL per S-03 model).


-- ----------------------------------------------------------------------------
-- 2. Backfill: one default "Introduction" chapter per existing course
-- ----------------------------------------------------------------------------
-- For every course that exists at migration time, create exactly one chapter
-- with slug='introduction', title='Introduction', position=1. Idempotent via
-- the unique(course_id, slug) constraint + ON CONFLICT.
insert into public.chapters (course_id, slug, title, position)
select c.id, 'introduction', 'Introduction', 1
from public.courses c
on conflict (course_id, slug) do nothing;


-- ----------------------------------------------------------------------------
-- 3. lessons.chapter_id (nullable initially so the ALTER doesn't fail)
-- ----------------------------------------------------------------------------
alter table public.lessons
  add column chapter_id uuid references public.chapters(id) on delete cascade;


-- ----------------------------------------------------------------------------
-- 4. Backfill lessons.chapter_id from each course's default chapter
-- ----------------------------------------------------------------------------
-- Every existing lesson is associated with its course's "introduction"
-- chapter (the one inserted in step 2). After this UPDATE no lesson row has
-- a null chapter_id, so step 5's NOT NULL promotion is safe.
update public.lessons l
set chapter_id = c.id
from public.chapters c
where c.course_id = l.course_id
  and c.slug = 'introduction'
  and l.chapter_id is null;


-- ----------------------------------------------------------------------------
-- 5. Promote lessons.chapter_id to NOT NULL
-- ----------------------------------------------------------------------------
alter table public.lessons
  alter column chapter_id set not null;


-- ----------------------------------------------------------------------------
-- 6. Swap position uniqueness from per-course to per-chapter
-- ----------------------------------------------------------------------------
-- Old contract: unique(course_id, position) — flat ordering across a course.
-- New contract: unique(chapter_id, position) — ordering local to a chapter.
-- The course-level slug uniqueness on lessons stays as-is (load-bearing for
-- the flat URL /courses/<slug>/lessons/<lessonSlug>).
alter table public.lessons
  drop constraint lessons_course_id_position_key;

alter table public.lessons
  add constraint lessons_chapter_id_position_key unique (chapter_id, position);


-- ----------------------------------------------------------------------------
-- 7. lessons.video_url becomes nullable (text-only lesson support)
-- ----------------------------------------------------------------------------
-- Presence of video_url IS the lesson-type discriminator: not-null = video
-- lesson (today's shape), null = text-only lesson (markdown-only layout).
alter table public.lessons
  alter column video_url drop not null;


-- ----------------------------------------------------------------------------
-- 8. Index on lessons.chapter_id (hot read path: chapter-scoped lesson list)
-- ----------------------------------------------------------------------------
create index lessons_chapter_id_idx on public.lessons (chapter_id);
