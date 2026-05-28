/**
 * Read-side query helpers for catalog, course detail, and lesson pages.
 *
 * All helpers accept an already-constructed Supabase client (returned by
 * `createClient()` in `@/lib/supabase`). The page is responsible for the
 * client lifecycle and for the null-client branch when env vars are
 * missing — services only handle the happy path where a client exists.
 *
 * RLS reminder (per F-01):
 *   - `courses` is anon-readable.
 *   - `lessons` is gated by `has_course_access(course_id)` → authenticated
 *     viewers see free-course lessons; anon sees zero rows.
 *   - `messages` (not queried here) is gated the same way.
 */

import type { createClient } from "@/lib/supabase";
import type { Course, Lesson } from "@/types";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

// PGRST116: ".single()" found no rows — treated as a normal not-found, not
// a service error worth logging.
const NOT_FOUND_CODE = "PGRST116";

export async function listCourses(supabase: SupabaseClient): Promise<Course[]> {
  const { data, error } = await supabase.from("courses").select("*").order("created_at", { ascending: true });
  if (error) {
    console.error("[courses] listCourses failed:", error.message);
    return [];
  }
  return data;
}

export async function getCourseBySlug(supabase: SupabaseClient, slug: string): Promise<Course | null> {
  const { data, error } = await supabase.from("courses").select("*").eq("slug", slug).single();
  if (error) {
    if (error.code !== NOT_FOUND_CODE) {
      console.error("[courses] getCourseBySlug failed:", error.message);
    }
    return null;
  }
  return data;
}

export async function listLessonsForCourse(supabase: SupabaseClient, courseId: string): Promise<Lesson[]> {
  const { data, error } = await supabase
    .from("lessons")
    .select("*")
    .eq("course_id", courseId)
    .order("position", { ascending: true });
  if (error) {
    console.error("[courses] listLessonsForCourse failed:", error.message);
    return [];
  }
  return data;
}

export async function getLessonBySlugs(
  supabase: SupabaseClient,
  courseSlug: string,
  lessonSlug: string,
): Promise<{ course: Course; lesson: Lesson } | null> {
  const course = await getCourseBySlug(supabase, courseSlug);
  if (!course) return null;

  const { data, error } = await supabase
    .from("lessons")
    .select("*")
    .eq("course_id", course.id)
    .eq("slug", lessonSlug)
    .single();
  if (error) {
    if (error.code !== NOT_FOUND_CODE) {
      console.error("[courses] getLessonBySlugs failed:", error.message);
    }
    return null;
  }
  return { course, lesson: data };
}
