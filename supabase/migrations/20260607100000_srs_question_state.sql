-- ============================================================================
-- learning-loop / Phase 3: question-scoped FSRS state + practice grading
-- ============================================================================
-- Per-user FSRS card per QUESTION (mirror of srs_review_state, question-keyed)
-- for spaced re-quizzing of missed test questions. Two SECURITY DEFINER helpers
-- keep question_options.is_correct server-side (same pattern as the test fns):
--   get_due_practice_questions(course) -> due questions + options (no is_correct)
--   grade_question(question, selected[]) -> { isCorrect, correctOptionIds }
-- Rescheduling itself happens in the API route (reuses src/lib/srs.ts).
-- ============================================================================

create table public.srs_question_state (
  user_id        uuid             not null references auth.users(id)       on delete cascade,
  question_id    uuid             not null references public.questions(id) on delete cascade,

  -- FSRS card state (mirrors ts-fsrs Card, minus deprecated elapsed_days)
  due            timestamptz      not null,
  stability      double precision not null default 0,
  difficulty     double precision not null default 0,
  scheduled_days integer          not null default 0,
  learning_steps integer          not null default 0,
  reps           integer          not null default 0,
  lapses         integer          not null default 0,
  state          smallint         not null default 0,
  last_review    timestamptz,

  created_at     timestamptz      not null default now(),
  updated_at     timestamptz      not null default now(),

  primary key (user_id, question_id)
);
create index srs_question_state_due_idx on public.srs_question_state (user_id, due);
comment on table public.srs_question_state is
  'Per-user FSRS-6 card per question for spaced re-quizzing of missed test questions. Own-only RLS. service_role bypasses for operator debugging.';

alter table public.srs_question_state enable row level security;
alter table public.srs_question_state force  row level security;

create policy "srs_question_state_select_own"
  on public.srs_question_state for select to authenticated
  using (user_id = (select auth.uid()));
create policy "srs_question_state_insert_own"
  on public.srs_question_state for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "srs_question_state_update_own"
  on public.srs_question_state for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Due practice questions for auth.uid() in a course: questions + options WITHOUT
-- is_correct (definer so the key stays server-side), soonest-due first.
create function public.get_due_practice_questions(p_course_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.has_course_access(p_course_id) then '[]'::jsonb
    else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id, 'prompt', q.prompt, 'multi', q.multi,
          'options', coalesce((
            select jsonb_agg(jsonb_build_object('id', o.id, 'body', o.body, 'position', o.position) order by o.position)
            from public.question_options o where o.question_id = q.id
          ), '[]'::jsonb)
        ) order by s.due
      )
      from public.srs_question_state s
      join public.questions q on q.id = s.question_id
      join public.tests t on t.id = q.test_id
      where s.user_id = auth.uid() and t.course_id = p_course_id and s.due <= now()
    ), '[]'::jsonb)
  end;
$$;

-- Grade a single question (no attempt row). All-or-nothing; never returns the
-- raw key — only whether the selection was correct + the correct option ids
-- (post-answer feedback). The route reschedules the card from this result.
create function public.grade_question(p_question_id uuid, p_selected uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_course   uuid;
  v_correct  uuid[];
  v_selected uuid[];
  v_is       boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  select t.course_id into v_course
    from public.questions q join public.tests t on t.id = q.test_id
    where q.id = p_question_id;
  if v_course is null then raise exception 'question_not_found'; end if;
  if not public.has_course_access(v_course) then raise exception 'no_access'; end if;

  select coalesce(array_agg(o.id order by o.id), '{}') into v_correct
    from public.question_options o where o.question_id = p_question_id and o.is_correct;
  select coalesce(array_agg(o.id order by o.id), '{}') into v_selected
    from public.question_options o where o.question_id = p_question_id and o.id = any(p_selected);

  v_is := array_length(v_correct, 1) is not null and v_selected = v_correct;
  return jsonb_build_object('isCorrect', v_is, 'correctOptionIds', to_jsonb(v_correct));
end;
$$;

revoke execute on function public.get_due_practice_questions(uuid) from public;
revoke execute on function public.grade_question(uuid, uuid[]) from public;
grant execute on function public.get_due_practice_questions(uuid) to authenticated;
grant execute on function public.grade_question(uuid, uuid[]) to authenticated;
