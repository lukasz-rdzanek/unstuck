import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { applyRating, emptyCardFields, SRS_CARD_COLUMNS } from "@/lib/srs";

export const prerender = false;

interface JsonResponseInit {
  status: number;
}

function jsonResponse(body: unknown, { status }: JsonResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// answers: { [questionId]: optionId[] }. Option ids are validated for uuid
// SYNTAX (Postgres-lenient — accepts any 8-4-4-4-12 hex, unlike strict RFC
// z.uuid() which rejects non-v4 ids like operator-authored/seed ids) so the SQL
// ::uuid casts inside submit_test_attempt can't throw on bad input.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const submitSchema = z.object({
  answers: z.record(z.string(), z.array(z.string().regex(UUID_RE))),
});

/**
 * POST = grade this test attempt. Grading runs entirely in the
 * `submit_test_attempt` SECURITY DEFINER function so the answer key
 * (question_options.is_correct) never reaches the client. user_id is taken
 * inside the function from auth.uid(); RLS + the function's own access check
 * gate it. Returns { score, passed, perQuestion:[{questionId, isCorrect,
 * correctOptionIds}] } for post-submit feedback.
 */
export const POST: APIRoute = async (context) => {
  const userId = context.locals.user?.id;
  if (!userId) {
    return jsonResponse({ error: "unauthenticated" }, { status: 401 });
  }
  const testId = context.params.testId;
  if (!testId) {
    return jsonResponse({ error: "missing_test_id" }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await context.request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = submitSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse({ error: "invalid_answers" }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "supabase_not_configured" }, { status: 500 });
  }

  const { data, error } = await supabase.rpc("submit_test_attempt", {
    p_test_id: testId,
    p_answers: parsed.data.answers,
  });
  if (error) {
    console.error("[tests] submit failed:", { code: error.code, message: error.message });
    return jsonResponse({ error: "grade_failed" }, { status: 500 });
  }

  const result = data as {
    score: number;
    passed: boolean;
    perQuestion: { questionId: string; isCorrect: boolean; correctOptionIds: string[] }[];
  };

  // Spaced re-quizzing (learning-loop P3): schedule missed questions. Wrong →
  // enrol + Again; correct-with-an-existing-card → Good (advances it). Correct
  // first-timers are not enrolled. Best-effort/non-fatal — never fails grading.
  try {
    const questionIds = result.perQuestion.map((p) => p.questionId);
    const { data: existing } = await supabase
      .from("srs_question_state")
      .select(`question_id, ${SRS_CARD_COLUMNS}`)
      .eq("user_id", userId)
      .in("question_id", questionIds);
    const byQuestion = new Map((existing ?? []).map((row) => [row.question_id, row]));
    const now = new Date();
    const rows = result.perQuestion.flatMap((p) => {
      const card = byQuestion.get(p.questionId);
      if (!p.isCorrect) {
        return [
          {
            user_id: userId,
            question_id: p.questionId,
            ...applyRating(card ?? emptyCardFields(now), 1, now),
            updated_at: now.toISOString(),
          },
        ];
      }
      if (card) {
        return [
          { user_id: userId, question_id: p.questionId, ...applyRating(card, 3, now), updated_at: now.toISOString() },
        ];
      }
      return [];
    });
    if (rows.length > 0) {
      const { error: scheduleError } = await supabase
        .from("srs_question_state")
        .upsert(rows, { onConflict: "user_id,question_id" });
      if (scheduleError) {
        console.error("[reviews] requiz schedule failed:", scheduleError.message);
      }
    }
  } catch (scheduleError) {
    console.error("[reviews] requiz schedule error:", scheduleError);
  }

  return jsonResponse(result, { status: 200 });
};
