-- ============================================================================
-- S-06 / Phase 1: Lesson Completion Tracking
-- ============================================================================
-- Introduces a per-user lesson_completions table with own-only RLS. Each user
-- records their own completion of a lesson via the app (toggle button on the
-- lesson page); RLS makes completions strictly private — no peer or operator
-- visibility from authenticated sessions (service_role still bypasses for
-- operator debugging per the standing pattern).
--
-- The toggle is INSERT / DELETE (never UPDATE) so the policy set has no
-- UPDATE — there is no mutable column on a completion row. completed_at is
-- recorded at insert time and stays put.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. lesson_completions (per-user binary completion record)
-- ----------------------------------------------------------------------------
create table public.lesson_completions (
  user_id       uuid        not null references auth.users(id) on delete cascade,
  lesson_id     uuid        not null references public.lessons(id) on delete cascade,
  completed_at  timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- The PK covers (user_id, lesson_id); a separate user_id index gives the
-- planner a clean path for the "all my completions in a course" join shape
-- (lessons LEFT JOIN lesson_completions on lc.user_id = $me AND lc.lesson_id
-- = l.id WHERE l.course_id = $course).
create index lesson_completions_user_id_idx on public.lesson_completions (user_id);

comment on table public.lesson_completions is
  'Per-user binary completion record for lessons. Own-only RLS: each user sees/inserts/deletes only their own rows. No UPDATE — toggle is INSERT/DELETE. service_role bypasses for operator debugging.';


-- ----------------------------------------------------------------------------
-- 2. RLS posture: own-only SELECT/INSERT/DELETE (no UPDATE policy)
-- ----------------------------------------------------------------------------
alter table public.lesson_completions enable row level security;
alter table public.lesson_completions force  row level security;

-- SELECT: a user sees only their own completion rows.
create policy "completions_select_own"
  on public.lesson_completions
  for select
  to authenticated
  using (user_id = auth.uid());

-- INSERT: a user can only record their own completions. WITH CHECK is the
-- load-bearing predicate here — without it, a user could insert rows with
-- a foreign user_id even though the SELECT policy would later hide them.
create policy "completions_insert_own"
  on public.lesson_completions
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- DELETE: a user can only remove their own completions. USING is the
-- predicate that filters which rows the DELETE statement is allowed to
-- affect; a row with a different user_id matches zero rows under this
-- predicate, so the DELETE silently affects 0 rows (no error raised).
create policy "completions_delete_own"
  on public.lesson_completions
  for delete
  to authenticated
  using (user_id = auth.uid());

-- No UPDATE policy → completion rows are immutable to learners. Toggle is
-- INSERT/DELETE; no row-level UPDATE is ever issued by the app.
