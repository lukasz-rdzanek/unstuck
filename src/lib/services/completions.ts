/**
 * Read-side helpers for per-user lesson completion (S-06).
 *
 * Both helpers accept an already-constructed Supabase client (returned by
 * `createClient()` in `@/lib/supabase`). RLS reminder (per S-06 migration):
 *   - `lesson_completions` is own-only — SELECT returns only rows where
 *     `user_id = auth.uid()`. Passing a different userId from the caller
 *     yields zero rows even if it exists in the table; that's fine for
 *     the page-render path because pages always pass the session user's id.
 *
 * Write-side (INSERT/DELETE) lives in the `/api/lessons/[lessonId]/complete`
 * endpoint, not here — service helpers are read-only by convention.
 */

import type { createClient } from "@/lib/supabase";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

/**
 * Completed lesson IDs for one user in one course. The course detail page
 * uses this to render green-check + faded styling on completed lesson cards.
 * Returns a Set for O(1) `.has(lessonId)` checks during render.
 *
 * Empty Set on error (matches the `console.error` + empty-fallback
 * convention in `src/lib/services/courses.ts`).
 */
export async function getCompletedLessonIdsForCourse(
  supabase: SupabaseClient,
  courseId: string,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("lesson_completions")
    .select("lesson_id, lessons!inner(course_id)")
    .eq("user_id", userId)
    .eq("lessons.course_id", courseId);
  if (error) {
    console.error("[completions] getCompletedLessonIdsForCourse failed:", error.message);
    return new Set();
  }
  return new Set(data.map((row) => row.lesson_id));
}

/**
 * Has this user already completed this lesson? Seed for the
 * MarkCompleteButton React island so the initial render reflects the
 * persisted state (no flash of "Mark as complete" on a refresh).
 *
 * Returns false on error or absent row.
 */
export async function isLessonCompletedByUser(
  supabase: SupabaseClient,
  lessonId: string,
  userId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("lesson_completions")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("lesson_id", lessonId);
  if (error) {
    console.error("[completions] isLessonCompletedByUser failed:", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}
