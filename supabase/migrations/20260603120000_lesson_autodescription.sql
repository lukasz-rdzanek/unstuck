-- ============================================================================
-- UNS-20: Lesson autodescription (text-only video summary)
-- ============================================================================
-- Adds a nullable, operator-authored markdown column to lessons. A non-null
-- value surfaces a "Content / Autodescription" tab on the lesson page — a
-- text-only summary for readers who skip the video. NULL = no summary = no tab
-- strip (existing lessons render unchanged).
--
-- No RLS change needed: the lessons SELECT policy (has_course_access) already
-- grants learners every column, and there is no authenticated INSERT/UPDATE
-- policy — writes remain service_role-only (operator authors via Studio / SQL).
-- Additive + nullable: prod-safe, no backfill.
-- ============================================================================

alter table public.lessons
  add column autodescription_md text;

comment on column public.lessons.autodescription_md is
  'Operator-authored markdown summary of the lesson video (UNS-20). Nullable; NULL means no Autodescription tab is shown on the lesson page.';
