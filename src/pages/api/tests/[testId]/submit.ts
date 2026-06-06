import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

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

// answers: { [questionId]: optionId[] }. Option ids are uuid-validated so the
// SQL ::uuid casts inside submit_test_attempt can't throw on bad input.
const submitSchema = z.object({
  answers: z.record(z.string(), z.array(z.uuid())),
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

  return jsonResponse(data, { status: 200 });
};
