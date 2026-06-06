-- ============================================================================
-- spaced-repetition-review / Phase 3: author-controlled review config
-- ============================================================================
-- Course author (operator) control over spaced-repetition review:
--   courses.review_enabled  — when true, completing a lesson in this course
--                             enrols it for review.
--   lessons.review_format   — how a lesson presents in review:
--                             'video' (re-watch embed) | 'text' (autodescription)
--                             | 'title' (cue only).
-- Both are operator-set; writes to courses/lessons are already restricted to
-- service_role by existing RLS, so no new policy is needed. Additive columns
-- with safe defaults (review off, text format) — no backfill required.
-- ============================================================================

alter table public.courses
  add column review_enabled boolean not null default false;

alter table public.lessons
  add column review_format text not null default 'text'
    check (review_format in ('video', 'text', 'title'));

comment on column public.courses.review_enabled is
  'Course-author switch: when true, completing a lesson in this course enrols it for spaced-repetition review.';
comment on column public.lessons.review_format is
  'How this lesson presents in review: video (re-watch embed) | text (autodescription) | title (cue only).';
