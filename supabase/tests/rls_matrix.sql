-- ============================================================================
-- F-01 / Phase 2: RLS Matrix Verification
-- ============================================================================
-- Mechanically asserts the access matrix realised by the Phase 2 RLS policies.
-- Self-contained: creates its own fixture inside a transaction, asserts each
-- cell of the 4-role matrix, and rolls back at the end so the database state
-- is unchanged. Runs anytime — does NOT depend on supabase/seed.sql.
--
-- Exits non-zero on any failed assertion (each `raise exception` aborts the
-- transaction). Successful run prints the per-cell "ok" notices via
-- raise notice.
--
-- Run locally (pick whichever invocation matches your toolchain):
--   psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2 | tr -d '\"')" -f supabase/tests/rls_matrix.sql
-- or (when psql is not on PATH but Docker is):
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres -1 < supabase/tests/rls_matrix.sql
--
-- The matrix this file asserts:
--
--   Cell                  | Asserts
--   --------------------- | --------------------------------------------------
--   anon                  | courses readable; lessons/messages/enrollments return 0 rows
--   authenticated, free   | sees free-course lesson + both seeded and peer messages;
--                         | does NOT see paid-course lesson;
--                         | INSERT own non-seed message succeeds;
--                         | INSERT with is_seeded=true is rejected;
--                         | INSERT with foreign author_id is rejected.
--   authenticated, none   | does NOT see paid-course lesson (no enrollment)
--   service_role          | INSERT seeded message succeeds; DELETE any message succeeds
--   authenticated, delete | DELETE of own message rejected (row_count = 0);
--   denial (FR-007)       | DELETE of operator-seeded message rejected (row_count = 0).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Fixture setup (as superuser, RLS off, so policies don't gate the seed itself)
-- ----------------------------------------------------------------------------
set local role postgres;
set local row_security = off;

-- Three test auth.users: peer (with free-course implicit access), operator
-- (whose seed messages we test), no-access (a signed-in learner with no
-- enrollment in the paid course).
insert into auth.users (id, instance_id, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_user_meta_data, aud, role)
values
  ('11111111-1111-1111-1111-111111111111',
   '00000000-0000-0000-0000-000000000000',
   'rls-peer@test.local', '', now(), now(), now(),
   '{"display_name":"Peer"}'::jsonb, 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222',
   '00000000-0000-0000-0000-000000000000',
   'rls-operator@test.local', '', now(), now(), now(),
   '{"display_name":"Operator"}'::jsonb, 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333',
   '00000000-0000-0000-0000-000000000000',
   'rls-noaccess@test.local', '', now(), now(), now(),
   '{"display_name":"NoAccess"}'::jsonb, 'authenticated', 'authenticated')
on conflict (id) do nothing;
-- The handle_new_user trigger creates matching profiles rows.

-- Two courses (one free, one paid) and one lesson in each.
insert into public.courses (id, slug, title, is_free) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'rls-free-course', 'RLS Test — Free', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'rls-paid-course', 'RLS Test — Paid', false);

-- One chapter per course (S-05 introduces lessons.chapter_id NOT NULL FK).
insert into public.chapters (id, course_id, slug, title, position) values
  ('5a5a5a5a-5a5a-5a5a-5a5a-5a5a5a5a5a5a',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'introduction', 'Introduction', 1),
  ('5b5b5b5b-5b5b-5b5b-5b5b-5b5b5b5b5b5b',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'introduction', 'Introduction', 1);

insert into public.lessons (id, course_id, chapter_id, slug, title, position, video_url) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '5a5a5a5a-5a5a-5a5a-5a5a-5a5a5a5a5a5a',
   'free-lesson-1', 'Free Lesson 1', 1, 'https://example.com/v/free-1'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '5b5b5b5b-5b5b-5b5b-5b5b-5b5b5b5b5b5b',
   'paid-lesson-1', 'Paid Lesson 1', 1, 'https://example.com/v/paid-1');

-- Two messages in the free-course lesson: one operator-seeded, one peer-posted.
insert into public.messages (id, lesson_id, author_id, body, is_seeded) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   '22222222-2222-2222-2222-222222222222',
   'Seeded answer — pinned on top', true),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   '11111111-1111-1111-1111-111111111111',
   'Peer question — below seeds', false);

-- Re-enable RLS for the assertion phase.
set local row_security = on;

-- ----------------------------------------------------------------------------
-- Cell 1: anon
-- ----------------------------------------------------------------------------
set local role anon;

do $$
declare
  cnt int;
begin
  select count(*) into cnt from public.courses;
  if cnt = 0 then
    raise exception '[anon] expected courses readable (catalog public), got 0';
  end if;

  -- S-05: chapters are public metadata like courses (anon-readable).
  select count(*) into cnt from public.chapters;
  if cnt = 0 then
    raise exception '[anon] expected chapters readable (catalog public), got 0';
  end if;

  select count(*) into cnt from public.lessons;
  if cnt != 0 then
    raise exception '[anon] expected 0 lessons (gated read), got %', cnt;
  end if;

  select count(*) into cnt from public.messages;
  if cnt != 0 then
    raise exception '[anon] expected 0 messages (gated read), got %', cnt;
  end if;

  select count(*) into cnt from public.enrollments;
  if cnt != 0 then
    raise exception '[anon] expected 0 enrollments (gated read), got %', cnt;
  end if;

  raise notice '[anon] ok: catalog + chapters readable, lessons/messages/enrollments deny';
end $$;

-- ----------------------------------------------------------------------------
-- Cell 2: authenticated, free-course access (peer's uid)
-- ----------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  cnt int;
begin
  -- S-05: chapters readable to authenticated like courses (both fixture rows).
  -- Scope to the fixture courses so the assertion is robust against seed
  -- contributions in the surrounding DB.
  select count(*) into cnt from public.chapters
   where course_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                       'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  if cnt != 2 then
    raise exception '[auth-free] expected 2 chapters readable (fixture courses), got %', cnt;
  end if;

  -- Free-course lesson visible
  select count(*) into cnt from public.lessons
   where course_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if cnt != 1 then
    raise exception '[auth-free] expected 1 free lesson visible, got %', cnt;
  end if;

  -- Free-course messages visible (both seeded + peer)
  select count(*) into cnt from public.messages
   where lesson_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  if cnt != 2 then
    raise exception '[auth-free] expected 2 messages in free lesson, got %', cnt;
  end if;

  -- Paid-course lesson NOT visible (no enrollment)
  select count(*) into cnt from public.lessons
   where course_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if cnt != 0 then
    raise exception '[auth-free] expected 0 paid lessons (no enrollment), got %', cnt;
  end if;

  raise notice '[auth-free] ok: free content visible, paid gated';
end $$;

-- Valid INSERT: own non-seed message
do $$
declare
  new_id uuid;
begin
  insert into public.messages (lesson_id, author_id, body, is_seeded)
  values ('cccccccc-cccc-cccc-cccc-cccccccccccc',
          '11111111-1111-1111-1111-111111111111',
          'rls test — peer post', false)
  returning id into new_id;

  if new_id is null then
    raise exception '[auth-free] INSERT own non-seed should return an id';
  end if;
  raise notice '[auth-free] ok: peer-own-non-seed INSERT succeeds';
end $$;

-- Rejected INSERT: is_seeded = true (only service_role can seed)
do $$
declare
  caught boolean := false;
begin
  begin
    insert into public.messages (lesson_id, author_id, body, is_seeded)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc',
            '11111111-1111-1111-1111-111111111111',
            'rls test — bad seed', true);
  exception when others then
    caught := true;
  end;
  if not caught then
    raise exception '[auth-free] expected INSERT with is_seeded=true to be rejected, but it succeeded';
  end if;
  raise notice '[auth-free] ok: is_seeded=true rejected';
end $$;

-- Rejected INSERT: foreign author_id (impersonation)
do $$
declare
  caught boolean := false;
begin
  begin
    insert into public.messages (lesson_id, author_id, body, is_seeded)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc',
            '22222222-2222-2222-2222-222222222222',
            'rls test — bad author', false);
  exception when others then
    caught := true;
  end;
  if not caught then
    raise exception '[auth-free] expected INSERT with foreign author_id to be rejected, but it succeeded';
  end if;
  raise notice '[auth-free] ok: foreign author_id rejected';
end $$;

-- ----------------------------------------------------------------------------
-- Cell 3: authenticated, no enrollment in paid course
-- ----------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare
  cnt int;
begin
  -- Paid-course lesson NOT visible (no enrollment for this uid)
  select count(*) into cnt from public.lessons
   where course_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if cnt != 0 then
    raise exception '[auth-noaccess] expected 0 paid lessons (no enrollment), got %', cnt;
  end if;

  -- Free-course lesson IS visible (is_free trumps enrollment)
  select count(*) into cnt from public.lessons
   where course_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if cnt != 1 then
    raise exception '[auth-noaccess] expected 1 free lesson visible (is_free), got %', cnt;
  end if;

  raise notice '[auth-noaccess] ok: paid gated, free still visible';
end $$;

-- ----------------------------------------------------------------------------
-- Cell 4: service_role (bypasses RLS)
-- ----------------------------------------------------------------------------
reset role;
set local role service_role;

do $$
declare
  new_id uuid;
  affected int;
begin
  -- service_role can INSERT seeded messages
  insert into public.messages (lesson_id, author_id, body, is_seeded)
  values ('dddddddd-dddd-dddd-dddd-dddddddddddd',
          '22222222-2222-2222-2222-222222222222',
          'rls test — service_role seed in paid lesson', true)
  returning id into new_id;
  if new_id is null then
    raise exception '[service_role] expected seeded INSERT to succeed';
  end if;
  raise notice '[service_role] ok: seeded INSERT succeeds (paid lesson, bypasses RLS)';

  -- service_role can DELETE any message
  delete from public.messages where id = new_id;
  get diagnostics affected = row_count;
  if affected != 1 then
    raise exception '[service_role] expected DELETE to affect 1 row, got %', affected;
  end if;
  raise notice '[service_role] ok: DELETE any message succeeds';
end $$;

reset role;

-- ----------------------------------------------------------------------------
-- Cell 5: authenticated, DELETE denial (FR-007 invariant — only the operator
-- can delete; signed-in learners cannot remove ANY message via the app)
-- ----------------------------------------------------------------------------
-- F-01's `messages` RLS has no DELETE policy for the `authenticated` role —
-- combined with FORCE row-level security, this means peers cannot remove
-- their own or operator-seeded content via the supabase-js client. S-03
-- regression-proofs that posture: a future migration that accidentally adds
-- a peer-DELETE policy would fail this assertion at `db reset`.
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  affected int;
  fixture_cnt int;
begin
  -- Fixture-drift guard: confirm both target rows are visible to this peer
  -- BEFORE attempting DELETE. Without this, a missing row would let DELETE
  -- silently return row_count = 0 and the RLS assertion would falsely pass.
  select count(*) into fixture_cnt
    from public.messages
   where id in ('ffffffff-ffff-ffff-ffff-ffffffffffff',
                'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
  if fixture_cnt != 2 then
    raise exception '[auth-delete-denial] fixture drift: expected 2 target messages visible to peer before DELETE attempts, got %', fixture_cnt;
  end if;

  -- Peer attempts to DELETE own message → row_count = 0 (silent RLS denial)
  delete from public.messages where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  get diagnostics affected = row_count;
  if affected != 0 then
    raise exception '[auth-delete-denial] expected DELETE of own message to affect 0 rows (FR-007), got %', affected;
  end if;

  -- Peer attempts to DELETE operator-seeded message → row_count = 0
  delete from public.messages where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  get diagnostics affected = row_count;
  if affected != 0 then
    raise exception '[auth-delete-denial] expected DELETE of seeded message to affect 0 rows (FR-007), got %', affected;
  end if;

  raise notice '[auth-delete-denial] ok: authenticated cannot DELETE own or seeded messages (FR-007)';
end $$;

reset role;

-- ----------------------------------------------------------------------------
-- All assertions passed. Roll back the fixture so the DB is unchanged.
-- ----------------------------------------------------------------------------
do $$ begin raise notice '[rls_matrix] PASS — all 5 role cells assert green'; end $$;

rollback;
