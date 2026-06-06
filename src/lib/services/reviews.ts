/**
 * Read-side helpers for spaced-repetition review (spaced-repetition-review).
 *
 * Both helpers accept an already-constructed Supabase client (from
 * `createClient()` in `@/lib/supabase`). RLS reminder (srs_review_state is
 * own-only): SELECT returns only rows where `user_id = auth.uid()`, so passing
 * a different userId yields zero rows — fine, callers always pass the session
 * user's id.
 *
 * Write-side (the FSRS rate/upsert) lives in `/api/reviews/[lessonId]/rate`,
 * not here — service helpers are read-only by convention.
 */

import type { createClient } from "@/lib/supabase";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

/** One due review card, joined to its lesson + course for rendering. */
export interface DueReviewItem {
  lessonId: string;
  title: string;
  autodescriptionMd: string | null;
  courseSlug: string;
  lessonSlug: string;
  due: string;
}

/**
 * Lessons due for review for one user (due <= now), soonest first. Joined to
 * the lesson (title, autodescription, slug) and parent course (slug) so the
 * /review page can render the prompt + answer + a link without extra queries.
 * Backed by the `(user_id, due)` index. Empty array on error.
 */
export async function getDueReviewQueue(supabase: SupabaseClient, userId: string, now: Date): Promise<DueReviewItem[]> {
  const { data, error } = await supabase
    .from("srs_review_state")
    .select("lesson_id, due, lessons!inner(title, slug, autodescription_md, courses!inner(slug))")
    .eq("user_id", userId)
    .lte("due", now.toISOString())
    .order("due", { ascending: true });
  if (error) {
    console.error("[reviews] getDueReviewQueue failed:", error.message);
    return [];
  }
  return data.map((row) => ({
    lessonId: row.lesson_id,
    title: row.lessons.title,
    autodescriptionMd: row.lessons.autodescription_md,
    courseSlug: row.lessons.courses.slug,
    lessonSlug: row.lessons.slug,
    due: row.due,
  }));
}

/** Count of review cards due now for one user (dashboard entry point). 0 on error. */
export async function getDueReviewCount(supabase: SupabaseClient, userId: string, now: Date): Promise<number> {
  const { count, error } = await supabase
    .from("srs_review_state")
    .select("lesson_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .lte("due", now.toISOString());
  if (error) {
    console.error("[reviews] getDueReviewCount failed:", error.message);
    return 0;
  }
  return count ?? 0;
}
