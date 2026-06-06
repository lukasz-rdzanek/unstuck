-- ============================================================================
-- spaced-repetition-review / Phase 1: Per-user FSRS review state
-- ============================================================================
-- Introduces a per-user, per-lesson srs_review_state table holding the FSRS-6
-- card state (as produced by the ts-fsrs library). A lesson is enrolled for
-- review when the learner marks it complete; each review updates the card's
-- scheduling state. Own-only RLS: each user sees/inserts/updates only their own
-- rows (service_role still bypasses for operator debugging per the standing
-- pattern). Columns mirror the ts-fsrs `Card` interface, minus the deprecated
-- `elapsed_days` (an unused output field FSRS recomputes from last_review).
-- ============================================================================

create table public.srs_review_state (
  user_id         uuid             not null references auth.users(id)     on delete cascade,
  lesson_id       uuid             not null references public.lessons(id) on delete cascade,

  -- FSRS card state (mirrors ts-fsrs `Card`)
  due             timestamptz      not null,
  stability       double precision not null default 0,
  difficulty      double precision not null default 0,
  scheduled_days  integer          not null default 0,
  learning_steps  integer          not null default 0,
  reps            integer          not null default 0,
  lapses          integer          not null default 0,
  state           smallint         not null default 0, -- 0 New, 1 Learning, 2 Review, 3 Relearning
  last_review     timestamptz,

  created_at      timestamptz      not null default now(),
  updated_at      timestamptz      not null default now(),

  primary key (user_id, lesson_id)
);

-- Due-queue lookup: "my cards due on/before now, soonest first".
create index srs_review_state_due_idx on public.srs_review_state (user_id, due);

comment on table public.srs_review_state is
  'Per-user FSRS-6 review scheduling state per lesson (whole-lesson re-review). Columns mirror the ts-fsrs Card. Own-only RLS: SELECT/INSERT/UPDATE restricted to auth.uid(); no DELETE in v1. service_role bypasses for operator debugging.';

alter table public.srs_review_state enable row level security;
alter table public.srs_review_state force  row level security;

-- Own-only policies. SELECT/INSERT mirror lesson_completions; UPDATE is added
-- because review state mutates on every grade (upsert on rate). No DELETE.
create policy "srs_review_state_select_own"
  on public.srs_review_state
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "srs_review_state_insert_own"
  on public.srs_review_state
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "srs_review_state_update_own"
  on public.srs_review_state
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
