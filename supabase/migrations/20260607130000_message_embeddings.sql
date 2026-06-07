-- ============================================================================
-- ai-answer-matching / Phase 1: message embeddings + semantic match RPC
-- ============================================================================
-- Adds semantic search over lesson-chat messages so a learner's posted question
-- can be matched to the most relevant prior answer in the same course.
--
-- Storage:  messages.embedding (pgvector, 768-dim = @cf/baai/bge-base-en-v1.5),
--           nullable + backfilled later by the Worker; HNSW cosine index.
--
-- SECURITY: messages has FORCE RLS and no UPDATE policy (immutable to learners).
--           The functions below are SECURITY DEFINER owned by `postgres`, which
--           has rolbypassrls=true in this project — so they bypass RLS the same
--           way submit_test_attempt writes test_attempts. Because RLS is bypassed,
--           match_lesson_answers MUST gate explicitly on has_course_access(); a
--           caller can only ever match within a course they can access. The write
--           fn is column-scoped + null-only so message immutability holds for
--           everything except the derived embedding. Mirrors the has_course_access
--           / get_test_questions definer pattern (see context/foundation/lessons.md).
-- ============================================================================

-- ---- storage ---------------------------------------------------------------

create extension if not exists vector with schema extensions;

alter table public.messages
  add column embedding extensions.vector(768);

comment on column public.messages.embedding is
  'Semantic embedding of body (@cf/baai/bge-base-en-v1.5, 768-dim). NULL until backfilled by the Worker. Derived data only — message body stays immutable.';

-- HNSW cosine index for low-latency similarity search.
create index messages_embedding_hnsw
  on public.messages
  using hnsw (embedding extensions.vector_cosine_ops);

-- ---- functions -------------------------------------------------------------

-- Rank a course's embedded messages against a query embedding and return the
-- best matches above a similarity threshold. Candidate filtering drops the
-- asker's own messages, the just-posted message, and trivially short messages.
-- Seeded (operator-curated) messages get a soft +0.05 similarity boost so
-- curated answers win close calls without always dominating a stronger peer hit.
create function public.match_lesson_answers(
  p_course_id          uuid,
  p_query_embedding    extensions.vector(768),
  p_exclude_author     uuid,
  p_exclude_message_id uuid,
  p_match_threshold    float,
  p_match_count        int
)
returns table (
  message_id   uuid,
  lesson_id    uuid,
  lesson_slug  text,
  lesson_title text,
  body         text,
  is_seeded    boolean,
  similarity   float
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    m.id,
    m.lesson_id,
    l.slug,
    l.title,
    m.body,
    m.is_seeded,
    (1 - (m.embedding <=> p_query_embedding))::float as similarity
  from public.messages m
  join public.lessons l on l.id = m.lesson_id
  where public.has_course_access(p_course_id)
    and l.course_id = p_course_id
    and m.embedding is not null
    and (p_exclude_message_id is null or m.id <> p_exclude_message_id)
    and (p_exclude_author is null or m.author_id is distinct from p_exclude_author)
    and char_length(m.body) >= 40
    and (1 - (m.embedding <=> p_query_embedding)) >= p_match_threshold
  order by
    ((1 - (m.embedding <=> p_query_embedding)) + (case when m.is_seeded then 0.05 else 0 end)) desc
  limit least(greatest(p_match_count, 1), 5);
$$;

comment on function public.match_lesson_answers(uuid, extensions.vector, uuid, uuid, float, int) is
  'Semantic match of a query embedding against a course''s message embeddings, gated by has_course_access. Returns top matches above threshold with a soft seed-boost. SECURITY DEFINER (owner bypasses RLS; gate is explicit).';

-- Column-scoped, null-only embedding writer. messages is immutable to learners
-- (no UPDATE policy); this lets the Worker persist a derived embedding without
-- touching body/author_id/is_seeded and without re-embedding existing rows.
create function public.set_message_embedding(
  p_message_id uuid,
  p_embedding  extensions.vector(768)
)
returns void
language sql
volatile
security definer
set search_path = public, extensions
as $$
  update public.messages
     set embedding = p_embedding
   where id = p_message_id
     and embedding is null;
$$;

comment on function public.set_message_embedding(uuid, extensions.vector) is
  'Sets messages.embedding for a single row, only when currently NULL. Column-scoped (never touches body/author_id/is_seeded). SECURITY DEFINER for the backfill Worker.';

-- Batch reader for the backfill: messages still lacking an embedding, oldest first.
create function public.list_unembedded_messages(p_limit int)
returns table (id uuid, body text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.body
  from public.messages m
  where m.embedding is null
  order by m.created_at
  limit least(greatest(p_limit, 1), 200);
$$;

comment on function public.list_unembedded_messages(int) is
  'Returns up to 200 messages with a NULL embedding (oldest first) for the backfill Worker. SECURITY DEFINER.';

-- ---- grants ----------------------------------------------------------------
-- Backfill endpoint is operator-gated at the API layer; these fns only touch
-- derived embeddings / bodies the caller could already read within accessible
-- courses, so authenticated execute is acceptable.
revoke execute on function public.match_lesson_answers(uuid, extensions.vector, uuid, uuid, float, int) from public;
revoke execute on function public.set_message_embedding(uuid, extensions.vector) from public;
revoke execute on function public.list_unembedded_messages(int) from public;
grant execute on function public.match_lesson_answers(uuid, extensions.vector, uuid, uuid, float, int) to authenticated;
grant execute on function public.set_message_embedding(uuid, extensions.vector) to authenticated;
grant execute on function public.list_unembedded_messages(int) to authenticated;
