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
