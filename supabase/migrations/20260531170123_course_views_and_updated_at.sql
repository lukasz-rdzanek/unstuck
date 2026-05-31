-- ============================================================================
-- UNS-14 / Phase 3: Course-updated indicator data substrate
-- ============================================================================
-- Two parts:
--   1. updated_at columns on courses + lessons + a shared bump_updated_at()
--      trigger. Operator edits (Studio / SQL / future admin UI) bump the
--      timestamp automatically; consumers compare these against per-user
--      view history to surface a "course updated since your last visit"
--      indicator.
--   2. course_views(user_id, course_id, last_seen_at) per-user table with
--      own-only RLS. Lesson page render upserts NOW() on every visit.
--      No UPDATE-direct usage — `upsert(..., onConflict)` handles both insert
--      and refresh paths.
--
-- DELETE is intentionally not exposed (no policy → nobody can delete via
-- authenticated session). service_role bypasses RLS for operator cleanup.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. updated_at columns + shared bump trigger
-- ----------------------------------------------------------------------------
alter table public.courses add column updated_at timestamptz not null default now();
alter table public.lessons add column updated_at timestamptz not null default now();

comment on column public.courses.updated_at is
  'Auto-bumped by trigger on UPDATE. Compared against course_views.last_seen_at to drive the UNS-14 course-updated indicator.';
comment on column public.lessons.updated_at is
  'Auto-bumped by trigger on UPDATE. MAX across all lessons in a course feeds the same indicator (lesson edits count as a course-level update).';

create or replace function public.bump_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.bump_updated_at() is
  'Generic BEFORE UPDATE trigger function. Sets NEW.updated_at = now(). Attached to courses and lessons; reusable for future tables with the same column.';

create trigger courses_bump_updated_at
  before update on public.courses
  for each row execute function public.bump_updated_at();

create trigger lessons_bump_updated_at
  before update on public.lessons
  for each row execute function public.bump_updated_at();


-- ----------------------------------------------------------------------------
-- 2. course_views (per-user "last visit" record)
-- ----------------------------------------------------------------------------
create table public.course_views (
  user_id        uuid        not null references auth.users(id) on delete cascade,
  course_id      uuid        not null references public.courses(id) on delete cascade,
  last_seen_at   timestamptz not null default now(),
  primary key (user_id, course_id)
);

comment on table public.course_views is
  'Per-user record of when a user last visited a course (via any lesson page render). Compared against MAX(courses.updated_at, lessons.updated_at) to decide whether to show the "course was updated" indicator. Own-only RLS.';


-- ----------------------------------------------------------------------------
-- 3. RLS posture: own-only SELECT/INSERT/UPDATE (no DELETE policy)
-- ----------------------------------------------------------------------------
-- UPDATE policy is required because the lesson-page upsert path will refresh
-- last_seen_at on every visit (ON CONFLICT (user_id, course_id) DO UPDATE).
-- DELETE policy intentionally absent — there is no user-facing "forget my
-- view history" feature yet; service_role bypasses for operator cleanup.
alter table public.course_views enable row level security;
alter table public.course_views force  row level security;

create policy "course_views own select"
  on public.course_views
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "course_views own insert"
  on public.course_views
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "course_views own update"
  on public.course_views
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
