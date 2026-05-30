# Operator chapter & lesson authoring guide

You (the operator, single platform owner) shape every course's structure
directly through Supabase Studio's SQL editor. Per PRD non-goals there
is no in-product CRUD for chapters or lessons — Studio is the surface.
This guide gives copy-paste recipes for the standing operations.

> **Prerequisites** are the same as
> [seeding.md § Prerequisites](./seeding.md#prerequisites): Studio access
> to the prod Supabase project, knowledge that the SQL editor runs as
> `service_role` (bypasses RLS — that's how chapter/lesson INSERTs work
> at all; learner-authenticated sessions cannot mutate this content),
> and an `auth.users` row for your operator identity if you also plan
> to author seeded messages alongside (see seeding.md).

All SQL blocks use `$$ … $$` dollar-quoting for any string literal that
might contain apostrophes — same convention as
[seeding.md](./seeding.md) and [moderation.md](./moderation.md). Without
it, an apostrophe inside a title or markdown body breaks the literal.

---

## Add a new chapter to a course

```sql
INSERT INTO public.chapters (course_id, slug, title, position)
SELECT
  c.id,
  $$ai-writing-and-analysis$$,         -- slug (kebab-case, unique within course)
  $$AI Writing and Analysis$$,         -- display title
  COALESCE(MAX(ch.position), 0) + 1    -- next available position within this course
FROM public.courses c
LEFT JOIN public.chapters ch ON ch.course_id = c.id
WHERE c.slug = $$generative-ai-leader$$
GROUP BY c.id
RETURNING id, slug, title, position;
```

`COALESCE(MAX(...), 0) + 1` makes the recipe idempotent in terms of
ordering: each new chapter lands at the end of the course's existing
chapter list. If you want a specific position (e.g., insert at the
beginning), set the integer directly and run a `UPDATE … SET position =
position + 1 WHERE course_id = ... AND position >= <new>` first (see
"Reorder chapters" below) to keep the per-course position uniqueness
constraint happy.

---

## Add a video lesson to a chapter

```sql
INSERT INTO public.lessons (course_id, chapter_id, slug, title, position, video_url, content_md)
SELECT
  c.id,
  ch.id,
  $$prompting-frameworks$$,            -- lesson slug (kebab-case, unique within course)
  $$Prompting frameworks compared$$,
  COALESCE(MAX(l.position), 0) + 1,    -- next position within the chapter
  $$https://www.youtube.com/watch?v=YOUR_VIDEO_ID$$,
  $$## What you'll learn

A side-by-side comparison of ReAct, ToT, and DSPy prompting frameworks
with a worked example from a customer-support routing task.$$
FROM public.courses c
JOIN public.chapters ch ON ch.course_id = c.id
LEFT JOIN public.lessons l ON l.chapter_id = ch.id
WHERE c.slug = $$generative-ai-leader$$
  AND ch.slug = $$ai-writing-and-analysis$$
GROUP BY c.id, ch.id
RETURNING id, slug, title, position, video_url IS NOT NULL AS has_video;
```

`video_url` is required for a video lesson — populate it with the natural
watch URL (`https://www.youtube.com/watch?v=...` or
`https://vimeo.com/<id>`); the app converts it to an embed URL via
`src/lib/video-embed.ts`.

---

## Add a text-only lesson to a chapter

Same shape as above, but `video_url` is `NULL`:

```sql
INSERT INTO public.lessons (course_id, chapter_id, slug, title, position, video_url, content_md)
SELECT
  c.id,
  ch.id,
  $$reading-prompting-pitfalls$$,
  $$Reading: common prompting pitfalls$$,
  COALESCE(MAX(l.position), 0) + 1,
  NULL,                                -- text-only lesson
  $$## Why this reading exists

Some pitfalls aren't worth a full video — a short read with examples
is faster. Cover this between video lessons when learners often hit
the same dead end.

## The five pitfalls

1. Over-instructing the model about format before clarifying the task.
2. ...

$$
FROM public.courses c
JOIN public.chapters ch ON ch.course_id = c.id
LEFT JOIN public.lessons l ON l.chapter_id = ch.id
WHERE c.slug = $$generative-ai-leader$$
  AND ch.slug = $$ai-writing-and-analysis$$
GROUP BY c.id, ch.id
RETURNING id, slug, title, position;
```

The app's lesson page detects `video_url IS NULL` and renders the
markdown body without a video region, plus a small "Reading" badge so
users know the lesson type at a glance.

---

## Reorder chapters within a course

Swap two chapters' positions inside one transaction (so the per-course
position uniqueness constraint never sees a duplicate mid-step):

```sql
BEGIN;

-- Move chapter "B" up to position 1, push old chapter "A" to position 2.
-- Use a temporary high integer to dodge the unique constraint during the swap.
UPDATE public.chapters SET position = 9999
 WHERE course_id = (SELECT id FROM public.courses WHERE slug = $$generative-ai-leader$$)
   AND slug = $$ai-writing-and-analysis$$;

UPDATE public.chapters SET position = 2
 WHERE course_id = (SELECT id FROM public.courses WHERE slug = $$generative-ai-leader$$)
   AND slug = $$introduction$$;

UPDATE public.chapters SET position = 1
 WHERE course_id = (SELECT id FROM public.courses WHERE slug = $$generative-ai-leader$$)
   AND slug = $$ai-writing-and-analysis$$;

-- Inspect the result before committing.
SELECT slug, title, position FROM public.chapters
 WHERE course_id = (SELECT id FROM public.courses WHERE slug = $$generative-ai-leader$$)
 ORDER BY position;

COMMIT;  -- or ROLLBACK if the order isn't what you wanted.
```

For larger reorders, the same trick generalises: push every affected
chapter to a temporary high integer first, then set the final positions.

---

## Reorder lessons within a chapter

Same shape as chapter reorder but scoped to `WHERE chapter_id = …`.
The uniqueness constraint is on `(chapter_id, position)`, so the
temporary-high-integer dodge is local to the chapter.

---

## Rename a chapter

```sql
UPDATE public.chapters
SET title = $$Generative AI: Foundations$$
WHERE course_id = (SELECT id FROM public.courses WHERE slug = $$generative-ai-leader$$)
  AND slug = $$introduction$$
RETURNING id, slug, title;
```

Slug stays the same on rename — the slug isn't exposed in any URL
(lesson URLs are flat per course, not nested under chapter slug), but
keeping it stable still helps when grepping logs or referencing in
operator-doc updates.

If you genuinely want to change the slug, do it in one statement
(`UPDATE … SET slug = $$new-slug$$ WHERE …`) — nothing in the
application references `chapters.slug` directly today; it's metadata
for operator-side organization.

---

## Emergency revert (rollback the chapters migration)

Should only be needed if a downstream slice breaks something
catastrophically and we need to fall back to the flat
"one course → many lessons" shape. **Loses chapter metadata**;
lesson content is preserved.

> ⚠️ **Pre-flight check (do this BEFORE the SQL below).** If any course
> has lessons across multiple chapters with overlapping positions
> (e.g., chapter A position 1 + chapter B position 1 in the same
> course), the `ADD CONSTRAINT lessons_course_id_position_key` step
> below will fail because two rows now share `(course_id, position)`.
> The BEGIN/COMMIT wrap catches the failure so no data is corrupted —
> but you'll need to `UPDATE lessons SET position = ...` to make
> positions unique per-course first. Find collisions with:
> ```sql
> SELECT course_id, position, COUNT(*) AS dup
> FROM public.lessons
> GROUP BY course_id, position
> HAVING COUNT(*) > 1;
> ```
> Resolve each collision (typically by reassigning the higher-numbered
> chapter's lessons to positions that don't clash), then run the
> revert below.

```sql
BEGIN;

-- Restore lesson-level position uniqueness scoped to the course.
ALTER TABLE public.lessons DROP CONSTRAINT lessons_chapter_id_position_key;
ALTER TABLE public.lessons ADD CONSTRAINT lessons_course_id_position_key UNIQUE (course_id, position);

-- Remove the chapter FK and the column.
ALTER TABLE public.lessons DROP COLUMN chapter_id;

-- Drop the chapters table (CASCADE removes the FK index too).
DROP TABLE public.chapters CASCADE;

-- Re-enforce video_url presence (optional — only do this if you've
-- ensured no text-only lessons exist in the database).
ALTER TABLE public.lessons ALTER COLUMN video_url SET NOT NULL;

-- Inspect; abort if anything looks wrong.
SELECT count(*) AS lessons_remaining FROM public.lessons;

COMMIT;  -- or ROLLBACK;
```

The application code from S-05 Phase 2 will then fail to type-check
against the reverted schema — plan to revert the corresponding commit
(`ea3dff0`) at the same time, or land a forward patch that handles
both schemas during the cutover.
