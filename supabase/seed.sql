-- ============================================================================
-- F-01 / Phase 3: Seed Fixture
-- ============================================================================
-- Smallest realistic dataset that exercises the whole F-01 contract end-to-end:
-- one free course, one lesson under it, and two messages (one operator-seeded
-- pinned-on-top, one peer-posted) so the seed-pinned-then-chronological
-- ordering (FR-006) and the `is_seeded` partition are demonstrable immediately
-- after `npx supabase db reset`.
--
-- This file is loaded by Supabase on `db reset` per `supabase/config.toml`
-- `[db.seed] sql_paths = ["./seed.sql"]`. It is NOT used in production —
-- `supabase db push` (Phase 4) applies migrations only.
--
-- Insert order matters: auth.users → (trigger creates profiles) → courses
-- → lessons → messages. The handle_new_user trigger from Phase 1 fires
-- AFTER INSERT on auth.users and creates the matching profiles row, so the
-- messages.author_id FKs resolve without an explicit profiles INSERT.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. auth.users — operator + peer (trigger auto-creates their profiles)
-- ----------------------------------------------------------------------------
-- Fixed UUIDs so downstream slices (S-01, S-02) can reference these accounts
-- in scratch tests without re-deriving IDs. Empty encrypted_password keeps
-- them un-loginable (seed accounts are not real users).
insert into auth.users (
  id, instance_id, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_user_meta_data, aud, role
) values
  (
    'c0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'seed-operator@unstuck.local',
    '',
    now(), now(), now(),
    '{"display_name":"Unstuck Operator"}'::jsonb,
    'authenticated', 'authenticated'
  ),
  (
    'c0000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'seed-peer@unstuck.local',
    '',
    now(), now(), now(),
    '{"display_name":"Seed Peer"}'::jsonb,
    'authenticated', 'authenticated'
  )
on conflict (id) do nothing;
-- The handle_new_user trigger now has fired twice, creating profile rows
-- for both. Verify if needed: `select * from public.profiles;`


-- ----------------------------------------------------------------------------
-- 2. courses — one free course (the MVP single-course catalog per FR-003)
-- ----------------------------------------------------------------------------
insert into public.courses (id, slug, title, description, is_free) values
  (
    'a0000000-0000-0000-0000-000000000001',
    'react-architecture-deep-dive',
    'React Architecture Deep Dive',
    'Server Components, the streaming model, and how React 19 partitions work between the server and the client.',
    true
  )
on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- 3. chapters — one default "Introduction" chapter under the course
-- ----------------------------------------------------------------------------
-- S-05 introduces chapter grouping. The seed mirrors the production-migration
-- backfill: every course gets a default "Introduction" chapter that owns its
-- lessons. New courses authored post-migration can add additional chapters
-- via the operator SQL recipes in docs/operator/chapters.md.
insert into public.chapters (id, course_id, slug, title, position) values
  (
    'e0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'introduction',
    'Introduction',
    1
  )
on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- 4. lessons — one lesson under the chapter
-- ----------------------------------------------------------------------------
insert into public.lessons (id, course_id, chapter_id, slug, title, position, video_url, content_md) values
  (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    'server-components-streaming',
    'Server Components and the Streaming Model',
    1,
    'https://www.youtube.com/watch?v=TQQPAU21ZUw',
    E'## What you will build\n\nA streaming-aware page where one component blocks on slow data while the rest of the tree renders eagerly. By the end you will be able to explain when Suspense boundaries help vs hurt.\n\n## Prerequisites\n\n- Familiarity with React 18 Suspense\n- Comfortable with a server framework (Next.js, Astro, or Remix)\n\n## Common blocker\n\nLearners often see the streaming behave like a regular SSR fallback — that usually means a parent component is awaiting too high in the tree. Watch the section at 14:20 if you hit this.'
  )
on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- 5. messages — one operator-seeded thread, one peer-posted reply
-- ----------------------------------------------------------------------------
-- The seeded message is what FR-006 pins on top of the chat (operator
-- curation before peer discussion). The peer message demonstrates the
-- chronological-below ordering. Together they prove the seed-pinned-then-
-- chronological read pattern that S-02 will surface in the UI.
insert into public.messages (id, lesson_id, author_id, body, is_seeded) values
  (
    'd0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    E'If your streaming page shows everything-at-once instead of progressive reveal, your parent likely awaits a slow promise before rendering its Suspense child. Move the await INTO the slow child and wrap the child in <Suspense>; the parent stays synchronous and streams what it has.',
    true
  ),
  (
    'd0000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000002',
    E'Tried this and the Suspense fallback flashes for a beat even on fast data — is that expected? Or am I missing a transition wrap somewhere?',
    false
  ),
  -- Three additional seeded messages (S-02 Phase 5) — fuller demo of
  -- operator-seeded threads pinned on top. All authored by seed-operator
  -- (c0000000-...-001), all is_seeded=true so they sort above the peer
  -- message in the FR-006 read pattern.
  (
    'd0000000-0000-0000-0000-000000000003',
    'b0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    E'When in doubt about whether to wrap a component in <Suspense>, ask: "does this component own a slow data fetch that the surrounding tree can wait around for?" If yes, wrap it. If the fetch is the WHOLE page, lift Suspense to the route boundary instead — that is what enables progressive streaming through the document.',
    true
  ),
  (
    'd0000000-0000-0000-0000-000000000004',
    'b0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    E'Streaming + parallel data fetching: fire all your awaits at the top of the Server Component (without awaiting yet — just hold the promises), then pass each promise to a different child wrapped in <Suspense>. Each child resolves and streams as its own promise settles. Sequential awaits in one component force one-after-the-other timing and kill the streaming benefit.',
    true
  ),
  (
    'd0000000-0000-0000-0000-000000000005',
    'b0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    E'If you see "use client" everywhere, you have probably collapsed Server Components into Client Components by accident. Common cause: importing a Client Component from a parent that should have been a Server Component, then adding "use client" to silence a hook-in-server-component error. Walk back to the original location — usually the right move is to extract the interactive bit into a small leaf Client Component and keep the parent on the server.',
    true
  )
on conflict (id) do nothing;
