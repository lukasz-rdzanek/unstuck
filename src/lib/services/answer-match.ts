/**
 * Read helpers for ai-answer-matching's live query path.
 *
 * Both run against the request-scoped Supabase client, so RLS applies:
 * getCourseIdForLesson can only resolve a lesson the caller may read (lessons
 * SELECT is gated by has_course_access), and match_lesson_answers re-checks
 * access inside the definer fn. Two layers of the same gate.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import type { AnswerMatch } from "@/types";

type AppSupabaseClient = SupabaseClient<Database>;

/** Similarity floor (cosine, 1=identical). Starting value — tune with real data. */
export const MATCH_THRESHOLD = 0.72;

// The match RPC's p_exclude_message_id is a non-null uuid; the nil uuid means
// "exclude nothing extra" (no message has this id). p_exclude_author already
// excludes the asker's own messages, so this secondary guard is usually a no-op.
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/** Resolve a lesson's course_id (RLS-gated → null if the caller lacks access). */
export async function getCourseIdForLesson(supabase: AppSupabaseClient, lessonId: string): Promise<string | null> {
  const { data, error } = await supabase.from("lessons").select("course_id").eq("id", lessonId).single();
  if (error) return null;
  return data.course_id;
}

interface MatchArgs {
  courseId: string;
  embeddingLiteral: string;
  excludeAuthor: string;
  excludeMessageId?: string | null;
}

/** Run the semantic match RPC and shape the single best row (or null). */
export async function matchAnswer(
  supabase: AppSupabaseClient,
  { courseId, embeddingLiteral, excludeAuthor, excludeMessageId }: MatchArgs,
): Promise<AnswerMatch | null> {
  const { data, error } = await supabase.rpc("match_lesson_answers", {
    p_course_id: courseId,
    p_query_embedding: embeddingLiteral,
    p_exclude_author: excludeAuthor,
    p_exclude_message_id: excludeMessageId ?? NIL_UUID,
    p_match_threshold: MATCH_THRESHOLD,
    p_match_count: 1,
  });
  if (error || data.length === 0) return null;

  const row = data[0];
  return {
    messageId: row.message_id,
    lessonId: row.lesson_id,
    lessonSlug: row.lesson_slug,
    lessonTitle: row.lesson_title,
    body: row.body,
    isSeeded: row.is_seeded,
    similarity: row.similarity,
  };
}
