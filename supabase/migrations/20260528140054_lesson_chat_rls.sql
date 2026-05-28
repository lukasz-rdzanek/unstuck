-- ============================================================================
-- F-01 / Phase 2: RLS Policies
-- ============================================================================
-- Moves the five tables from the Phase 1 deny-all intermediate to their real
-- security posture: granular per-operation, per-role policies that grant
-- exactly the minimum each role needs.
--
-- The matrix this migration realises:
--
--   Table         | anon          | authenticated                          | service_role
--   ------------- | ------------- | -------------------------------------- | ------------
--   courses       | SELECT (all)  | SELECT (all)                           | bypass (RLS off)
--   profiles      | —             | SELECT (all), UPDATE own              | bypass
--   lessons       | —             | SELECT if has_course_access(course_id) | bypass
--   enrollments   | —             | SELECT own                             | bypass
--   messages      | —             | SELECT if has_course_access(lesson's course)
--                 |               | INSERT if author_id=auth.uid() AND      |
--                 |               | is_seeded=false AND has_course_access  | bypass
--                 |               | (no UPDATE, no DELETE)                 |
--
-- service_role bypasses RLS by design — that is how seeding (is_seeded=true)
-- and operator deletion (FR-007) are performed out-of-band. Phase 3 will rely
-- on this to write the seed fixture; FR-007 in production relies on it for
-- moderation.
--
-- Supabase Realtime delivery obeys the SELECT policy on messages, so the
-- gating in this migration is what makes S-02 deliver "only rows the
-- subscriber can SELECT" without any client-side filtering.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- courses: public catalog
-- ----------------------------------------------------------------------------
create policy "courses_select_public"
  on public.courses
  for select
  to anon, authenticated
  using (true);

-- No write policies → INSERT/UPDATE/DELETE only via service_role (catalog
-- management is out-of-band; downstream slices do not create courses).


-- ----------------------------------------------------------------------------
-- profiles: author display names readable to signed-in users; self-update only
-- ----------------------------------------------------------------------------
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No public INSERT policy → the signup trigger (which runs as SECURITY DEFINER
-- in the handle_new_user function from Phase 1) is the sole creator of profile
-- rows. No DELETE → cascade from auth.users deletion is the only removal path.


-- ----------------------------------------------------------------------------
-- lessons: gated read; no public writes
-- ----------------------------------------------------------------------------
create policy "lessons_select_gated"
  on public.lessons
  for select
  to authenticated
  using (public.has_course_access(course_id));

-- Course/lesson content management is service_role only.


-- ----------------------------------------------------------------------------
-- enrollments: each user sees only their own
-- ----------------------------------------------------------------------------
create policy "enrollments_select_own"
  on public.enrollments
  for select
  to authenticated
  using (user_id = auth.uid());

-- Enrollment provisioning is service_role only (paid path lands later; the
-- empty enrollments table is the v1 hook).


-- ----------------------------------------------------------------------------
-- messages: gated read; peer-own-non-seed insert; no UPDATE/DELETE
-- ----------------------------------------------------------------------------
-- SELECT: a signed-in learner sees a message iff they have access to the
-- lesson's course. The subquery resolves lesson_id → course_id; has_course_access
-- handles is_free OR enrollment. Realtime subscribers inherit this policy.
create policy "messages_select_gated"
  on public.messages
  for select
  to authenticated
  using (
    public.has_course_access(
      (select l.course_id from public.lessons l where l.id = lesson_id)
    )
  );

-- INSERT: a learner can only post AS themselves (author_id = auth.uid()),
-- the message MUST be non-seed (is_seeded = false) — only service_role can
-- create seeded messages — AND they must have access to the lesson's course.
create policy "messages_insert_peer_own_non_seed"
  on public.messages
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and is_seeded = false
    and public.has_course_access(
      (select l.course_id from public.lessons l where l.id = lesson_id)
    )
  );

-- No UPDATE policy → messages are immutable to learners (a "delete and repost"
-- mental model). No DELETE policy → only the operator removes content, via
-- service_role out-of-band (FR-007).
