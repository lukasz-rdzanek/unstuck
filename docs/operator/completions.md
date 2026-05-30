# Operator note — lesson completions

Per-user lesson completion tracking (S-06) is a user-driven feature —
the operator does not actively manage anyone else's completions. This
note covers the two day-to-day operator scenarios: checking what you
yourself have completed, and clearing your own completions for
end-to-end testing.

> **Prerequisites** are the same as
> [seeding.md § Prerequisites](./seeding.md#prerequisites): Studio
> access to the prod Supabase project + your operator `auth.users` row.

All SQL blocks use `$$ … $$` dollar-quoting per the standing
convention (see [seeding.md](./seeding.md) and
[moderation.md](./moderation.md)).

---

## See all of MY completions

```sql
SELECT
  lc.completed_at,
  c.slug AS course_slug,
  ch.title AS chapter_title,
  l.slug AS lesson_slug,
  l.title AS lesson_title
FROM public.lesson_completions lc
JOIN public.lessons l ON l.id = lc.lesson_id
JOIN public.chapters ch ON ch.id = l.chapter_id
JOIN public.courses c ON c.id = l.course_id
WHERE lc.user_id = $$YOUR_USER_UUID$$
ORDER BY lc.completed_at DESC;
```

Replace `YOUR_USER_UUID` with your operator UUID (find it via the
seeding.md Step 1 recipe if you don't have it handy).

Studio runs as `service_role` so RLS is bypassed — you could query
other users' completions by changing the `WHERE lc.user_id = ...`
predicate. **Don't.** Other users' completion history is private by
design; the only legitimate reason to read it is debugging a specific
support issue, and even then it should be tied to a paper trail
(Slack message, GitHub issue) explaining why.

---

## Clear MY OWN completions (for testing the flow end-to-end)

Use this when you want to retest the mark-complete → particle →
unmark loop without manually unmarking each lesson through the UI.
Wrapped in a transaction so the RETURNING echo lets you inspect what
you're about to delete BEFORE the COMMIT lands.

```sql
BEGIN;

DELETE FROM public.lesson_completions
WHERE user_id = $$YOUR_USER_UUID$$
RETURNING lesson_id, completed_at;

-- Inspect the RETURNING output:
--   • lesson_id list matches what you expected to delete  → COMMIT;
--   • anything looks off (wrong user, more rows than expected) → ROLLBACK;

COMMIT;  -- or ROLLBACK;
```

After commit, refresh `/courses/<course>/lessons/<lesson>` on prod →
button shows "Mark as complete" again; course detail page no longer
shows green checks.

---

## Emergency revert (rollback the completions migration)

Should only be needed if the feature is causing user-visible breakage
and we need to fall back to "no completion tracking at all". Loses all
completion history.

```sql
BEGIN;

-- Drop the table; cascade removes its index and the FKs from the
-- referencing side (auth.users + lessons stay intact — they only had
-- inbound references from lesson_completions).
DROP TABLE public.lesson_completions CASCADE;

-- Inspect: confirm the table is gone and the surrounding tables are intact.
SELECT count(*) FROM public.lessons;
SELECT count(*) FROM auth.users;

COMMIT;  -- or ROLLBACK;
```

The application code from S-06 Phase 2 will then fail to typecheck
against the dropped table — plan to revert the corresponding commits
(`efd7a43` data layer, `73f57dd` UI + API) at the same time, or land
a forward patch that no-ops the completions surface during the
cutover.
