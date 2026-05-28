-- ============================================================================
-- F-01 / Phase 1: Schema & Structure
-- ============================================================================
-- Establishes the full relational shape for Unstuck's lesson-scoped chat:
-- courses → lessons → messages, profiles (FK to auth.users), and an empty
-- enrollments hook for the future paid-learner role. Adds has_course_access()
-- (security definer), the profiles signup trigger + backfill, the messages
-- realtime publication membership, and enables RLS on every new table with
-- NO POLICIES — a safe deny-all intermediate. Phase 2 grants access.
--
-- After this migration:
--   • Five tables exist with FKs/indexes per plan.
--   • Authenticated queries against lessons/messages/enrollments return 0 rows
--     (RLS-enabled-without-policies = deny-all, by design).
--   • messages is in the supabase_realtime publication (delivery wiring ready
--     for S-02; SELECT policy lands in Phase 2 and gates what subscribers see).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. profiles (author identity; FK to auth.users)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id            uuid        primary key references auth.users(id) on delete cascade,
  display_name  text        not null,
  created_at    timestamptz not null default now()
);

comment on table public.profiles is
  'Author identity for chat messages. One row per auth.users; trigger creates on signup.';


-- ----------------------------------------------------------------------------
-- 2. courses (public catalog)
-- ----------------------------------------------------------------------------
create table public.courses (
  id           uuid        primary key default gen_random_uuid(),
  slug         text        not null unique,
  title        text        not null,
  description  text,
  is_free      boolean     not null default true,
  created_at   timestamptz not null default now()
);

comment on table public.courses is
  'Course catalog. is_free=true bypasses enrollment in has_course_access().';


-- ----------------------------------------------------------------------------
-- 3. lessons (gated content; one row per lesson in a course)
-- ----------------------------------------------------------------------------
create table public.lessons (
  id           uuid        primary key default gen_random_uuid(),
  course_id    uuid        not null references public.courses(id) on delete cascade,
  slug         text        not null,
  title        text        not null,
  position     integer     not null,
  video_url    text        not null,
  content_md   text        not null default '',
  created_at   timestamptz not null default now(),
  unique (course_id, slug),
  unique (course_id, position)
);

create index lessons_course_id_idx on public.lessons (course_id);

comment on table public.lessons is
  'Lesson content (video_url + content_md). Gated by has_course_access(course_id) via RLS.';


-- ----------------------------------------------------------------------------
-- 4. enrollments (paid-access hook; ships empty in v1)
-- ----------------------------------------------------------------------------
create table public.enrollments (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  course_id   uuid        not null references public.courses(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, course_id)
);

create index enrollments_user_id_idx on public.enrollments (user_id);

comment on table public.enrollments is
  'User ↔ course access mapping. Empty in v1 (free-only); paid path flips is_free=false on the course and inserts rows here. RLS-write reserved to service_role until then.';


-- ----------------------------------------------------------------------------
-- 5. messages (lesson-scoped chat; operator-seeded vs peer partition)
-- ----------------------------------------------------------------------------
create table public.messages (
  id          uuid        primary key default gen_random_uuid(),
  lesson_id   uuid        not null references public.lessons(id) on delete cascade,
  author_id   uuid        references public.profiles(id) on delete set null,
  body        text        not null check (char_length(body) between 1 and 4000),
  is_seeded   boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- Composite index covers the only hot read pattern (FR-006): scope by lesson,
-- then seeds-first chronological — `where lesson_id = $1 order by is_seeded desc, created_at asc`.
create index messages_lesson_seed_created_idx
  on public.messages (lesson_id, is_seeded, created_at);

comment on table public.messages is
  'Lesson-scoped chat. is_seeded=true marks operator-curated threads (PRD FR-006). author_id nullable + set-null on profile delete preserves chat history when a user is removed.';


-- ----------------------------------------------------------------------------
-- 6. has_course_access(course_id) helper
-- ----------------------------------------------------------------------------
-- The single access predicate, used by both lessons.SELECT and messages.SELECT
-- policies (added in Phase 2). SECURITY DEFINER + fixed search_path keeps it
-- from tripping RLS recursion on the tables it reads, and lets the planner
-- treat it as stable within a statement.
create function public.has_course_access(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course_id and c.is_free
  ) or exists (
    select 1 from public.enrollments e
    where e.course_id = p_course_id and e.user_id = auth.uid()
  );
$$;

comment on function public.has_course_access(uuid) is
  'Access predicate: is_free OR (auth.uid() has an enrollment row). Reused by lessons/messages SELECT policies in Phase 2.';


-- ----------------------------------------------------------------------------
-- 7. Profiles signup trigger + backfill
-- ----------------------------------------------------------------------------
-- handle_new_user() fires AFTER INSERT on auth.users and inserts the matching
-- profiles row. display_name falls back to the email local-part when the
-- signup didn't carry a raw_user_meta_data->>'display_name'.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      split_part(coalesce(new.email, ''), '@', 1),
      'learner'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- One-time backfill for users that already exist (e.g. the 2026-05-27 test
-- accounts). The trigger only fires on NEW inserts; without this, later
-- messages.author_id FK inserts for these users would fail.
insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data->>'display_name', ''),
    split_part(coalesce(u.email, ''), '@', 1),
    'learner'
  )
from auth.users u
on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- 8. Realtime publication membership
-- ----------------------------------------------------------------------------
-- Add messages to supabase_realtime so subscribers receive change events.
-- Realtime delivery still obeys the SELECT policy (added in Phase 2), so
-- this is wiring only — no rows leak before policies grant access.
alter publication supabase_realtime add table public.messages;


-- ----------------------------------------------------------------------------
-- 9. Enable Row Level Security (DENY-ALL — Phase 2 grants policies)
-- ----------------------------------------------------------------------------
-- RLS-enabled-without-policies is deny-all by design. Authenticated queries
-- against these tables return zero rows after this migration. Phase 2 adds the
-- granular per-operation, per-role policies that open exactly the intended
-- access. Do not "fix" the empty results by adding policies early.
--
-- FORCE additionally subjects the table owner (postgres role) to RLS — defense
-- in depth so a future schema-owner connection can't accidentally bypass.
alter table public.profiles    enable row level security;
alter table public.profiles    force  row level security;
alter table public.courses     enable row level security;
alter table public.courses     force  row level security;
alter table public.lessons     enable row level security;
alter table public.lessons     force  row level security;
alter table public.enrollments enable row level security;
alter table public.enrollments force  row level security;
alter table public.messages    enable row level security;
alter table public.messages    force  row level security;
