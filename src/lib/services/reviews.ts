/**
 * Read-side helpers for course-scoped spaced-repetition review
 * (spaced-repetition-review). RLS reminder: srs_review_state is own-only, so
 * SELECT returns only the caller's rows.
 *
 * Write-side (the FSRS rate/upsert) lives in `/api/reviews/[lessonId]/rate`.
 */

import type { createClient } from "@/lib/supabase";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

export type ReviewFormat = "video" | "text" | "title";

/** One due review card, joined to its lesson + course for rendering. */
export interface DueReviewItem {
  lessonId: string;
  title: string;
  reviewFormat: ReviewFormat;
  autodescriptionMd: string | null;
  videoUrl: string | null;
  courseSlug: string;
  lessonSlug: string;
  due: string;
}

/**
 * Lessons due for review in ONE course for one user (due <= now), soonest
 * first. Joined to the lesson (title, slug, autodescription, video, format) and
 * parent course (slug) so the per-course /review page renders without extra
 * queries. Empty array on error.
 */
export async function getDueReviewQueue(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
  now: Date,
): Promise<DueReviewItem[]> {
  const { data, error } = await supabase
    .from("srs_review_state")
    .select(
      "lesson_id, due, lessons!inner(title, slug, autodescription_md, video_url, review_format, course_id, courses!inner(slug))",
    )
    .eq("user_id", userId)
    .eq("lessons.course_id", courseId)
    .lte("due", now.toISOString())
    .order("due", { ascending: true });
  if (error) {
    console.error("[reviews] getDueReviewQueue failed:", error.message);
    return [];
  }
  return data.map((row) => ({
    lessonId: row.lesson_id,
    title: row.lessons.title,
    reviewFormat: row.lessons.review_format as ReviewFormat,
    autodescriptionMd: row.lessons.autodescription_md,
    videoUrl: row.lessons.video_url,
    courseSlug: row.lessons.courses.slug,
    lessonSlug: row.lessons.slug,
    due: row.due,
  }));
}

/** Count of review cards due now for one user in one course. 0 on error. */
export async function getDueReviewCount(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
  now: Date,
): Promise<number> {
  const { count, error } = await supabase
    .from("srs_review_state")
    .select("lesson_id, lessons!inner(course_id)", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("lessons.course_id", courseId)
    .lte("due", now.toISOString());
  if (error) {
    console.error("[reviews] getDueReviewCount failed:", error.message);
    return 0;
  }
  return count ?? 0;
}
