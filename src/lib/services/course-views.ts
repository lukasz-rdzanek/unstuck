/**
 * Read + write helpers for the per-user course-view-history (UNS-14).
 *
 * `course_views` is own-only by RLS: SELECT/INSERT/UPDATE policies all
 * enforce `user_id = auth.uid()`. service_role bypasses for operator
 * debugging per the standing pattern. There is no DELETE policy — no
 * user-facing "forget history" feature yet.
 *
 * `getCourseLatestUpdatedAt` is a read against courses + their lessons;
 * returns the MAX of all updated_at timestamps so the consumer can
 * compare against the user's last_seen_at to decide whether to show
 * the course-updated indicator.
 */

import type { createClient } from "@/lib/supabase";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

// PGRST116: `.maybeSingle()` returns null without error when no rows match,
// but `.single()` errors with this code. Treat both as "no row" silently.
const NOT_FOUND_CODE = "PGRST116";

/**
 * The user's last_seen_at for a given course, or null if no row exists yet
 * (first visit after deploy — graceful default per UNS-14 Q5 decision:
 * no indicator until the user has established a baseline).
 */
export async function getCourseLastSeenAt(
  supabase: SupabaseClient,
  courseId: string,
  userId: string,
): Promise<Date | null> {
  const { data, error } = await supabase
    .from("course_views")
    .select("last_seen_at")
    .eq("course_id", courseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error && error.code !== NOT_FOUND_CODE) {
    console.error("[course-views] getCourseLastSeenAt failed:", error.message);
    return null;
  }
  return data?.last_seen_at ? new Date(data.last_seen_at) : null;
}

/**
 * Record (or refresh) the user's visit to the given course. Idempotent —
 * subsequent calls just bump last_seen_at to now(). Errors logged but not
 * thrown — failure to record a view is not worth blocking the lesson page
 * render over.
 */
export async function upsertCourseView(supabase: SupabaseClient, courseId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("course_views").upsert(
    {
      course_id: courseId,
      user_id: userId,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id,course_id" },
  );
  if (error) {
    console.error("[course-views] upsertCourseView failed:", error.message);
  }
}

/**
 * Latest update timestamp across the course row + every lesson in the
 * course (per UNS-14 Q3: operator edits to ANY lesson count as a
 * course-level update). Returns null on error or empty course.
 *
 * Implementation: PostgREST `select=updated_at,lessons(updated_at)` embed
 * returns the course's own updated_at plus an array of lesson updated_at
 * values. We pick the MAX client-side (course has at most a few dozen
 * lessons; trivial).
 */
export async function getCourseLatestUpdatedAt(supabase: SupabaseClient, courseId: string): Promise<Date | null> {
  const { data, error } = await supabase
    .from("courses")
    .select("updated_at, lessons(updated_at)")
    .eq("id", courseId)
    .maybeSingle();
  if (error && error.code !== NOT_FOUND_CODE) {
    console.error("[course-views] getCourseLatestUpdatedAt failed:", error.message);
    return null;
  }
  if (!data) return null;
  const courseTs = new Date(data.updated_at);
  // data.lessons is non-nullable per PostgREST embed shape — empty array when
  // the course has no lessons (the seed has at least one but defensive code
  // here is wasted; types guarantee an array).
  const lessonTimes = data.lessons.map((l: { updated_at: string }) => new Date(l.updated_at));
  return lessonTimes.reduce((max, t) => (t > max ? t : max), courseTs);
}
