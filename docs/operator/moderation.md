# Operator moderation guide — lesson chats

You (the operator, single platform owner) can delete any message in any
lesson chat to remove toxic or off-topic content. Per PRD FR-007 and the
v1 Non-Goals, there is no in-product moderation UI — moderation is
exercised out-of-band against the database through Supabase Studio's SQL
editor, the same surface used for [seeding lesson chats](./seeding.md).
This guide covers the standing flow.

> **Regression-proof of the no-peer-DELETE posture** is the SQL probe in
> `supabase/tests/rls_matrix.sql` (Cell 5, added by S-03). It runs on
> every `npx supabase db reset` and asserts that an authenticated
> learner cannot DELETE own or operator-seeded messages. If the
> assertion ever fails, F-01's RLS posture has been weakened — stop
> shipping until the cause is found.

## Prerequisites

- Access to the production Supabase project's **Studio** (same login as
  the seeding flow — see [seeding.md § Prerequisites](./seeding.md#prerequisites)
  if this is your first operator session).
- Your operator account in `auth.users` (created during signup; same
  one used for seeding).
- Decision authority: you are the only one with the `service_role` key.
  If that ever changes (co-moderators land), update this doc.

## Step 1 — Locate the message

Two queries depending on what you're working from. Both run in Studio SQL
editor.

**By content substring** (you saw the post in chat, want to find its row):

```sql
SELECT m.id, m.body, m.created_at, m.is_seeded,
       c.slug AS course_slug, l.slug AS lesson_slug,
       u.email AS author_email
FROM public.messages m
JOIN public.lessons l ON l.id = m.lesson_id
JOIN public.courses c ON c.id = l.course_id
LEFT JOIN auth.users u ON u.id = m.author_id
WHERE m.body ILIKE '%FRAGMENT_HERE%'
ORDER BY m.created_at DESC
LIMIT 20;
```

**By lesson + recency** (you want to scan the latest activity on a
specific lesson):

```sql
SELECT m.id, m.body, m.created_at, m.is_seeded,
       u.email AS author_email
FROM public.messages m
JOIN public.lessons l ON l.id = m.lesson_id
JOIN public.courses c ON c.id = l.course_id
LEFT JOIN auth.users u ON u.id = m.author_id
WHERE c.slug = 'COURSE_SLUG' AND l.slug = 'LESSON_SLUG'
ORDER BY m.created_at DESC
LIMIT 50;
```

Copy the `id` UUID of the row you want to delete.

## Step 2 — Capture the audit row BEFORE deleting

Once a message is deleted, the body is gone — there is no audit table
(per S-03 Key Decisions). You need to grab the row's metadata before the
DELETE so you can log it in [moderation-log.md](./moderation-log.md).

The DELETE below uses `RETURNING` so Studio echoes the body back after
deletion — that's the safety net if you forget this step. But capturing
upfront is cleaner.

Recommended copy-to-scratch fields:
- `id`
- `course_slug/lesson_slug` (where the message lived)
- First 80 chars of `body`
- `author_email` (or "(deleted user)" if `author_email` is null)

## Step 3 — Delete the message

```sql
DELETE FROM public.messages
WHERE id = 'MESSAGE_UUID_HERE'
RETURNING id, body, lesson_id;
```

The `RETURNING` confirms the row that just vanished and gives you a last
look at the body. If you forgot Step 2, this is your only chance to see
the content before it's gone.

If the query returns 0 rows, the UUID is wrong (or someone deleted it
already). Re-run Step 1.

## Step 4 — Append to the moderation log

Open [`docs/operator/moderation-log.md`](./moderation-log.md) and add a
new row to the table at the bottom. Use the column convention documented
there. Commit the log immediately (`git add docs/operator/moderation-log.md
&& git commit -m "moderation: <one-line reason>"`).

The log is the audit trail. Git history is the persistence layer. Don't
edit or remove past rows — if you ever delete in error, add a corrective
row noting the mistake.

## Deletion rubric

Lightweight 3-5 criterion guide. Subjective edges exist — that's
acceptable at v1 scale. When in doubt, **keep**: a follow-up seeded
message (per [seeding.md](./seeding.md)) is almost always a better
response than removal.

### Delete

1. **Targeted personal attack** — slurs, threats, doxxing, harassment
   directed at any specific person (whether the operator, another
   learner, or a public figure).
2. **Illegal content** — CSAM, copyright dump of paid material, anything
   that exposes the platform to legal risk.
3. **Spam or off-topic by full content** — promotional posts unrelated
   to the lesson, link-only dumps to external products, content that
   doesn't engage with the lesson at all.

### Keep (even if uncomfortable)

- **Frustration expressed on-topic** — "this lesson is confusing because
  the example breaks at step 3"; the frustration is real signal, even
  if the tone is sharp.
- **Misframed question or wrong answer** — the learner is engaging
  genuinely. Operator can clarify via a follow-up seeded message rather
  than delete the misunderstanding.
- **Cynicism without personal attack** — "I'm not convinced this
  technique scales" is on-topic dissent, not toxicity.

## Pre-launch readiness checklist

Before opening the platform to learners on launch day, confirm:

- [ ] Operator account exists in `auth.users` (run Step 1 of
  [seeding.md](./seeding.md#step-1--find-your-operator-author_id)).
- [ ] `docs/operator/moderation-log.md` exists and is committed.
- [ ] Local run: `npx supabase db reset` exits 0 (Cell 5 in
  `rls_matrix.sql` asserts authenticated DELETE returns 0 rows — the
  application-level moderation safety net).
- [ ] Decide and write down who has the `service_role` key. For v1
  this is the platform owner only.

## Operating notes

- **Deletion is irreversible.** Once committed in Studio, the row is
  gone. There is no undo and no soft-delete. If you delete the wrong
  message, the recovery path is: apologize via a seeded message in the
  same lesson chat, log the mistake in moderation-log.md with a clear
  reason, and consider whether the rubric needs an update.
- **Cadence**: review chat weekly, not in the moment. Real-time
  moderation pushes you toward over-deletion (you delete things that
  felt sharp at first read but were on-topic). Asynchronous review
  filters that.
- **Realtime impact**: deleting a message via Studio does NOT make the
  message disappear from currently-open lesson tabs (S-02's chat island
  doesn't listen for postgres_changes DELETE events — see plan §
  "What We're NOT Doing"). Peers see the gap on their next reload. For
  moderation cadence (rare events) this is acceptable; live
  disappearance is a post-MVP follow-up.
- **Re-running the RLS regression assertion outside `db reset`**:
  ```
  docker exec supabase_db_10x-astro-starter \
    psql -U postgres -d postgres -f /dev/stdin < supabase/tests/rls_matrix.sql
  ```
  (Project container name depends on your local stack — check
  `docker ps`.)
- **Audit integrity depends on you**. If you forget to log a deletion
  in moderation-log.md, there is no technical trace beyond the gap in
  message IDs. Add the log row immediately after committing the DELETE
  to make this discipline a single uninterrupted flow.
