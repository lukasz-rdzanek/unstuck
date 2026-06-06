-- ============================================================================
-- learning-loop / Phase 1: Tests (quiz) schema + secure grading
-- ============================================================================
-- Multiple-choice tests attachable to a chapter (end of part) or a course
-- (end of course). Questions have 2-6 options, single OR multiple correct,
-- graded all-or-nothing against an author-set pass threshold; unlimited
-- retakes, attempts stored. Authoring is operator-only (service_role writes).
--
-- SECURITY: question_options.is_correct is the answer key and must NEVER reach a
-- learner. The base table has RLS ENABLED (not FORCED) with no authenticated
-- policy → learners are denied direct SELECT, while the SECURITY DEFINER grading
-- + taking functions (owned by postgres, the table owner) bypass RLS to read it.
-- Taking-reads go through get_test_questions() which omits is_correct; grading
-- runs entirely inside submit_test_attempt(). Mirrors the has_course_access
-- definer pattern already used for chat RLS.
-- ============================================================================

-- ---- tables ----------------------------------------------------------------

create table public.tests (
  id             uuid        primary key default gen_random_uuid(),
  course_id      uuid        not null references public.courses(id)  on delete cascade,
  chapter_id     uuid        references public.chapters(id)          on delete cascade, -- null = course-level test
  slug           text        not null,
  title          text        not null,
  summary_md     text,
  pass_threshold numeric     not null default 0.80 check (pass_threshold >= 0 and pass_threshold <= 1),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (course_id, slug)
);
create index tests_course_id_idx on public.tests (course_id);
create index tests_chapter_id_idx on public.tests (chapter_id);
comment on table public.tests is
  'A graded quiz attached to a chapter (chapter_id set) or course (chapter_id null). Operator-authored. summary_md is the optional pre-test review.';

create table public.questions (
  id        uuid        primary key default gen_random_uuid(),
  test_id   uuid        not null references public.tests(id) on delete cascade,
  prompt    text        not null,
  multi     boolean     not null default false, -- false = single correct (radio), true = multiple (checkbox)
  position  integer     not null,
  unique (test_id, position)
);
create index questions_test_id_idx on public.questions (test_id);

create table public.question_options (
  id          uuid    primary key default gen_random_uuid(),
  question_id uuid    not null references public.questions(id) on delete cascade,
  body        text    not null,
  is_correct  boolean not null default false, -- SENSITIVE: answer key, never exposed to learners
  position    integer not null,
  unique (question_id, position)
);
create index question_options_question_id_idx on public.question_options (question_id);

create table public.test_attempts (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  test_id    uuid        not null references public.tests(id) on delete cascade,
  score      numeric     not null, -- 0..1
  passed     boolean     not null,
  created_at timestamptz not null default now()
);
create index test_attempts_user_test_idx on public.test_attempts (user_id, test_id);

create table public.attempt_answers (
  attempt_id          uuid    not null references public.test_attempts(id) on delete cascade,
  question_id         uuid    not null references public.questions(id)     on delete cascade,
  is_correct          boolean not null,
  selected_option_ids uuid[]  not null default '{}',
  primary key (attempt_id, question_id)
);

-- ---- RLS -------------------------------------------------------------------

-- tests: readable when the learner has access to the course; writes service_role only.
alter table public.tests enable row level security;
alter table public.tests force  row level security;
create policy "tests_select_access" on public.tests
  for select to authenticated using (public.has_course_access(course_id));

-- questions: prompt/multi/position are non-sensitive; readable via course access.
alter table public.questions enable row level security;
alter table public.questions force  row level security;
create policy "questions_select_access" on public.questions
  for select to authenticated
  using (public.has_course_access((select t.course_id from public.tests t where t.id = test_id)));

-- question_options: ENABLE only (NOT force) + no authenticated policy → learners
-- denied; the definer functions (owned by postgres = table owner) bypass RLS to
-- read is_correct. FORCE would block the owner too, breaking grading.
alter table public.question_options enable row level security;

-- test_attempts / attempt_answers: own-only (inserts happen inside the definer fn).
alter table public.test_attempts enable row level security;
alter table public.test_attempts force  row level security;
create policy "attempts_select_own" on public.test_attempts
  for select to authenticated using (user_id = (select auth.uid()));

alter table public.attempt_answers enable row level security;
alter table public.attempt_answers force  row level security;
create policy "attempt_answers_select_own" on public.attempt_answers
  for select to authenticated
  using (exists (select 1 from public.test_attempts a where a.id = attempt_id and a.user_id = (select auth.uid())));

-- ---- functions -------------------------------------------------------------

-- Taking payload: questions + options WITHOUT is_correct, gated by course access.
create function public.get_test_questions(p_test_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.has_course_access((select course_id from public.tests where id = p_test_id))
      then '[]'::jsonb
    else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id, 'prompt', q.prompt, 'multi', q.multi, 'position', q.position,
          'options', coalesce((
            select jsonb_agg(jsonb_build_object('id', o.id, 'body', o.body, 'position', o.position) order by o.position)
            from public.question_options o where o.question_id = q.id
          ), '[]'::jsonb)
        ) order by q.position
      )
      from public.questions q where q.test_id = p_test_id
    ), '[]'::jsonb)
  end;
$$;

-- Grade + persist an attempt. All-or-nothing per question. Returns the score,
-- pass flag, and per-question correctness (+ correct option ids for feedback).
-- The answer key is read here and never returned in raw form.
create function public.submit_test_attempt(p_test_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_course     uuid;
  v_threshold  numeric;
  v_total      int := 0;
  v_correct_n  int := 0;
  v_attempt_id uuid;
  v_score      numeric;
  v_passed     boolean;
  v_per        jsonb := '[]'::jsonb;
  r            record;
  v_selected   uuid[];
  v_correct    uuid[];
  v_is_correct boolean;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  select t.course_id, t.pass_threshold into v_course, v_threshold from public.tests t where t.id = p_test_id;
  if v_course is null then raise exception 'test_not_found'; end if;
  if not public.has_course_access(v_course) then raise exception 'no_access'; end if;

  insert into public.test_attempts (user_id, test_id, score, passed)
    values (v_uid, p_test_id, 0, false) returning id into v_attempt_id;

  for r in select q.id from public.questions q where q.test_id = p_test_id order by q.position loop
    v_total := v_total + 1;
    select coalesce(array_agg(o.id order by o.id), '{}') into v_correct
      from public.question_options o where o.question_id = r.id and o.is_correct;
    -- selected ids, filtered to options that actually belong to this question
    select coalesce(array_agg(o.id order by o.id), '{}') into v_selected
      from public.question_options o
      where o.question_id = r.id
        and o.id in (select (jsonb_array_elements_text(coalesce(p_answers -> r.id::text, '[]'::jsonb)))::uuid);
    -- all-or-nothing: exact set match; a question with no correct options is never correct
    v_is_correct := array_length(v_correct, 1) is not null and v_selected = v_correct;
    if v_is_correct then v_correct_n := v_correct_n + 1; end if;
    insert into public.attempt_answers (attempt_id, question_id, is_correct, selected_option_ids)
      values (v_attempt_id, r.id, v_is_correct, v_selected);
    v_per := v_per || jsonb_build_object('questionId', r.id, 'isCorrect', v_is_correct, 'correctOptionIds', to_jsonb(v_correct));
  end loop;

  v_score := case when v_total = 0 then 0 else round(v_correct_n::numeric / v_total, 4) end;
  v_passed := v_score >= v_threshold;
  update public.test_attempts set score = v_score, passed = v_passed where id = v_attempt_id;

  return jsonb_build_object('score', v_score, 'passed', v_passed, 'perQuestion', v_per);
end;
$$;

revoke execute on function public.get_test_questions(uuid) from public;
revoke execute on function public.submit_test_attempt(uuid, jsonb) from public;
grant execute on function public.get_test_questions(uuid) to authenticated;
grant execute on function public.submit_test_attempt(uuid, jsonb) to authenticated;
