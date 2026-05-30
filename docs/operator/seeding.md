# Operator seeding guide — lesson chats

You (the operator, single platform owner) seed the initial chat content for
each lesson before learners arrive. Per PRD FR-006 and the v1 Non-Goals,
there is no in-product seeding UI — seeds are inserted directly through
Supabase Studio's SQL editor or via the service-role key. This guide covers
the standing flow.

## Prerequisites

- Access to the production Supabase project's **Studio**
  (`https://app.supabase.com/project/<project-ref>/editor/sql`).
- Studio's SQL editor runs as `service_role` by default. `service_role`
  bypasses Row Level Security, which is the intended hook for operator
  seeding — peer learners cannot bypass RLS (their `authenticated` role
  is INSERT-restricted to their own non-seeded messages per
  `messages_insert_peer_own_non_seed`).
- Your operator account in `auth.users`. If you don't have one yet, sign
  up via `/auth/signup` on the production deployment and confirm the
  email; that creates the `auth.users` row + a matching `public.profiles`
  row via the signup trigger.

## Step 1 — Find your operator `author_id`

```sql
SELECT id, email
FROM auth.users
WHERE email = 'YOUR_EMAIL@example.com';
```

Copy the UUID from the `id` column — that is your operator
`author_id`. All seed messages will carry this id. Store it somewhere
(e.g. a sticky note) for the session.

## Step 2 — Find the target `lesson_id`

```sql
SELECT l.id, l.title, c.slug AS course_slug, l.slug AS lesson_slug
FROM public.lessons l
JOIN public.courses c ON c.id = l.course_id
ORDER BY c.slug, l.position;
```

Pick the row for the lesson you want to seed. Copy the `id` UUID.

## Step 3 — Insert a seeded message

```sql
INSERT INTO public.messages (lesson_id, author_id, body, is_seeded)
VALUES (
  '<lesson-uuid>',
  '<operator-uuid>',
  $$If your streaming page shows everything-at-once instead of progressive
reveal, your parent likely awaits a slow promise before rendering its
Suspense child. Move the await INTO the slow child and wrap the child
in <Suspense>; the parent stays synchronous and streams what it has.$$,
  true
);
```

Notes on the body literal:

- The `$$ ... $$` PostgreSQL dollar-quoting handles newlines and
  apostrophes without escaping. Use it whenever the message has
  punctuation or multi-line content.
- `is_seeded = true` is what pins the row to the top of the chat panel
  per FR-006. Without this flag the message would sort chronologically
  with peer posts.
- `author_id` MUST be set explicitly. The RLS INSERT policy validates
  `author_id = auth.uid()` for peer messages — for seeded messages the
  service_role bypass means any valid `author_id` is accepted, but the
  schema's FK forces it to reference an existing `profiles.id`.

Confirm the insert:

```sql
SELECT id, is_seeded, created_at, left(body, 80) AS body_preview
FROM public.messages
WHERE lesson_id = '<lesson-uuid>'
ORDER BY is_seeded DESC, created_at ASC;
```

Refresh the lesson page in your browser — the new seed appears at the top
of the chat panel within ~1–2 seconds (Realtime).

## Step 4 — Update or delete a seed

UPDATE and DELETE both work through Studio's SQL editor because
`service_role` bypasses RLS. The application's `authenticated` learner
sessions have **no UPDATE or DELETE policy** on `messages` — neither
peers nor signed-in learners can edit seeds.

```sql
-- Update body
UPDATE public.messages
SET body = $$Updated answer body here$$
WHERE id = '<message-uuid>';

-- Delete (use sparingly — there is no undo)
DELETE FROM public.messages
WHERE id = '<message-uuid>';
```

## Pre-launch checklist

For each lesson on launch day, insert **5–10 seed messages** covering:

- The most common technical blockers for that lesson's topic (from
  observed support questions on similar courses, or your own teaching
  notes).
- Step-back / framing tips (e.g. "If you're stuck for more than 15
  minutes here, jump to lesson 03 first and circle back").
- Encouragement / pacing notes (kept rare — seeds are for unblocking,
  not pep talks).

Seeds render IDENTICALLY to peer messages in the UI — no badge, no
separator color. Their only distinction is positional (pinned at the top
of the chat panel). The thinking is: a stuck learner should not feel
they're being talked at by the platform, they should feel they're
catching up with someone who already solved it.

## Operating notes

- Seeds are persistent. Once inserted, they stay until DELETEd. Plan
  the seed body carefully — typos require a follow-up UPDATE.
- There is no draft / preview state. The seed is live the moment INSERT
  commits. Use the `created_at` ordering knowledge: the first seed you
  insert is the topmost, the last seed is just above the peer divider.
  If you want to change seed order, DELETE + INSERT in the desired order.
- Local development: `supabase/seed.sql` carries a fixture seed (1
  operator-seeded + 1 peer message on the React Architecture lesson)
  that re-applies on every `supabase db reset`. Production seeding via
  this guide is the only mechanism for the deployed Supabase project.
