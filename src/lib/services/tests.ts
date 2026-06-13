/**
 * Read-side helpers for tests/quizzes (learning-loop). The answer key
 * (question_options.is_correct) is never read here — taking-questions come from
 * the `get_test_questions` SECURITY DEFINER RPC (which omits is_correct), and
 * grading lives in `/api/tests/[testId]/submit`.
 */

import type { createClient } from "@/lib/supabase";
import type { Test } from "@/types";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

export interface TakingOption {
  id: string;
  body: string;
  position: number;
}
export interface TakingQuestion {
  id: string;
  prompt: string;
  multi: boolean;
  position: number;
  options: TakingOption[];
}

/** All tests for a course (course-level + per-chapter), to drive entry points. */
export async function listTestsForCourse(supabase: SupabaseClient, courseId: string): Promise<Test[]> {
  const { data, error } = await supabase.from("tests").select("*").eq("course_id", courseId);
  if (error) {
    console.error("[tests] listTestsForCourse failed:", error.message);
    return [];
  }
  return data;
}

/**
 * Test IDs the user has PASSED (any attempt with `passed = true`) in one course.
 * Drives the green completion check on test rows in the course nav, mirroring
 * `getCompletedLessonIdsForCourse` for lessons. `test_attempts` is own-only RLS,
 * so this returns only the caller's attempts. Returns a Set for O(1) lookup;
 * empty Set on error.
 */
export async function getPassedTestIdsForCourse(
  supabase: SupabaseClient,
  courseId: string,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("test_attempts")
    .select("test_id, tests!inner(course_id)")
    .eq("user_id", userId)
    .eq("passed", true)
    .eq("tests.course_id", courseId);
  if (error) {
    console.error("[tests] getPassedTestIdsForCourse failed:", error.message);
    return new Set();
  }
  return new Set(data.map((row) => row.test_id));
}

/** A single test by course + slug (the test page). Null on miss/error. */
export async function getTestBySlug(supabase: SupabaseClient, courseId: string, slug: string): Promise<Test | null> {
  const { data, error } = await supabase
    .from("tests")
    .select("*")
    .eq("course_id", courseId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.error("[tests] getTestBySlug failed:", error.message);
    return null;
  }
  return data;
}

/** Taking payload (questions + options WITHOUT is_correct) via the definer RPC. */
export async function getTakingQuestions(supabase: SupabaseClient, testId: string): Promise<TakingQuestion[]> {
  const { data, error } = await supabase.rpc("get_test_questions", { p_test_id: testId });
  if (error) {
    console.error("[tests] getTakingQuestions failed:", error.message);
    return [];
  }
  return (data as TakingQuestion[] | null) ?? [];
}

/** A due practice question (no `position`; ordered by due via the RPC). */
export type PracticeQuestion = Omit<TakingQuestion, "position">;

/** Due re-quiz questions for one course (options WITHOUT is_correct) via the definer RPC. */
export async function getDuePracticeQuestions(supabase: SupabaseClient, courseId: string): Promise<PracticeQuestion[]> {
  const { data, error } = await supabase.rpc("get_due_practice_questions", { p_course_id: courseId });
  if (error) {
    console.error("[tests] getDuePracticeQuestions failed:", error.message);
    return [];
  }
  return (data as PracticeQuestion[] | null) ?? [];
}

/** Count of re-quiz questions due now for one user in one course. 0 on error. */
export async function getDuePracticeCount(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
  now: Date,
): Promise<number> {
  const { count, error } = await supabase
    .from("srs_question_state")
    .select("question_id, questions!inner(tests!inner(course_id))", { count: "exact", head: true })
    .eq("user_id", userId)
    .lte("due", now.toISOString())
    .eq("questions.tests.course_id", courseId);
  if (error) {
    console.error("[tests] getDuePracticeCount failed:", error.message);
    return 0;
  }
  return count ?? 0;
}
