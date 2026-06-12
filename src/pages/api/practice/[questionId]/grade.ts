import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { applyRating, emptyCardFields } from "@/lib/srs";

export const prerender = false;

const CARD_COLUMNS = "due, stability, difficulty, scheduled_days, learning_steps, reps, lapses, state, last_review";

interface JsonResponseInit {
  status: number;
}

function jsonResponse(body: unknown, { status }: JsonResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// uuid SYNTAX check (Postgres-lenient; strict RFC z.uuid() rejects non-v4 ids).
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const gradeSchema = z.object({ selected: z.array(z.string().regex(UUID_RE)) });

/**
 * POST = grade ONE practice (re-quiz) question and reschedule its FSRS card.
 * Grading runs in the `grade_question` SECURITY DEFINER fn (answer key stays
 * server-side); correctness → grade (correct→Good, wrong→Again) reschedules the
 * srs_question_state card. Returns { isCorrect, correctOptionIds }.
 */
export const POST: APIRoute = async (context) => {
  const userId = context.locals.user?.id;
  if (!userId) {
    return jsonResponse({ error: "unauthenticated" }, { status: 401 });
  }
  const questionId = context.params.questionId;
  if (!questionId) {
    return jsonResponse({ error: "missing_question_id" }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await context.request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = gradeSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse({ error: "invalid_selection" }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "supabase_not_configured" }, { status: 500 });
  }

  const { data, error } = await supabase.rpc("grade_question", {
    p_question_id: questionId,
    p_selected: parsed.data.selected,
  });
  if (error) {
    console.error("[reviews] practice grade failed:", { code: error.code, message: error.message });
    return jsonResponse({ error: "grade_failed" }, { status: 500 });
  }
  const result = data as { isCorrect: boolean; correctOptionIds: string[] };

  // Reschedule the card from correctness. This IS the point of grading a due
  // practice card: if the persisted schedule write fails, the card's `due` never
  // moves and the same question keeps coming back. Propagate the failure (a 500,
  // consistent with reviews/rate's `save_failed`) instead of swallowing it and
  // returning a false 200 (a swallowed error — OWASP A10:2025).
  try {
    const now = new Date();
    const { data: existing } = await supabase
      .from("srs_question_state")
      .select(CARD_COLUMNS)
      .eq("user_id", userId)
      .eq("question_id", questionId)
      .maybeSingle();
    const next = applyRating(existing ?? emptyCardFields(now), result.isCorrect ? 3 : 1, now);
    const { error: upsertError } = await supabase
      .from("srs_question_state")
      .upsert(
        { user_id: userId, question_id: questionId, ...next, updated_at: now.toISOString() },
        { onConflict: "user_id,question_id" },
      );
    if (upsertError) {
      console.error("[reviews] practice reschedule failed:", upsertError.message);
      return jsonResponse({ error: "reschedule_failed" }, { status: 500 });
    }
  } catch (rescheduleError) {
    console.error("[reviews] practice reschedule error:", rescheduleError);
    return jsonResponse({ error: "reschedule_failed" }, { status: 500 });
  }

  return jsonResponse(result, { status: 200 });
};
