# Moderation log

Append-only changelog of every operator-initiated deletion in lesson
chats. This file IS the audit trail — git history is its persistence
layer.

**Workflow**: after running `DELETE FROM public.messages WHERE id = ...`
in Supabase Studio (per [moderation.md § Step 3](./moderation.md#step-3--delete-the-message)),
add a new row to the table below with the captured metadata. Then commit:
`git add docs/operator/moderation-log.md && git commit -m "moderation: <reason>"`.

**Do NOT edit or remove past rows.** If a deletion turns out to have been
a mistake, add a corrective row noting the error (and apologize to the
learner via a seeded message — see
[moderation.md § Operating notes](./moderation.md#operating-notes)).

## Column convention

- `date_utc` — ISO date of the deletion (e.g. `2026-06-01`)
- `lesson` — `course_slug/lesson_slug` of the lesson the message lived in
- `message_id` — UUID of the deleted message
- `body_excerpt` — first ~80 characters of the original body, ellipsis if longer
- `reason` — one of the rubric categories (targeted attack / illegal / spam-offtopic / corrective)
  plus a one-line note
- `operator` — operator's email (or initials if shared in future)

## Log

| date_utc   | lesson                                              | message_id                             | body_excerpt                                                       | reason                                       | operator                |
| ---------- | --------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------- | ----------------------- |
| 2026-05-30 | sample/sample (NOT A REAL DELETION — format anchor) | 00000000-0000-0000-0000-000000000000   | (sample row — first ~80 chars of body would go here, ellipsis if…) | sample / format demonstration only, no event | sample@unstuck.local    |

<!-- Append new rows below this line. -->
