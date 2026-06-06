import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { emptyCardFields } from "@/lib/srs";

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

/**
 * POST = mark this lesson complete for the signed-in user.
 *
 * Uses upsert with onConflict so a double-click race that bypasses the
 * MarkCompleteButton's inflight ref guard (browser quirk, devtools
 * throttling, etc.) doesn't surface as a PK conflict — the second
 * INSERT silently becomes a no-op.
 *
 * The user_id is derived server-side from the session
 * (context.locals.user); the client never sends it. RLS additionally
 * enforces user_id = auth.uid() via the completions_insert_own policy,
 * so even a forged request can only insert the caller's own row.
 */
export const POST: APIRoute = async (context) => {
  const userId = context.locals.user?.id;
  if (!userId) {
    return jsonResponse({ error: "unauthenticated" }, { status: 401 });
  }
  const lessonId = context.params.lessonId;
  if (!lessonId) {
    return jsonResponse({ error: "missing_lesson_id" }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "supabase_not_configured" }, { status: 500 });
  }

  const { error } = await supabase
    .from("lesson_completions")
    .upsert({ user_id: userId, lesson_id: lessonId }, { onConflict: "user_id,lesson_id" });
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[completions] POST failed:", { code: error.code, message: error.message });
    return jsonResponse({ error: "save_failed" }, { status: 500 });
  }

  // Enrol the lesson for spaced-repetition review (spaced-repetition-review).
  // Best-effort + idempotent: ignoreDuplicates preserves an existing card's
  // schedule on re-completion, and any failure here is logged but never fails
  // the completion itself (completion is the user's primary action). RLS
  // (srs_review_state_insert_own) enforces user_id = auth.uid().
  const { error: enrolError } = await supabase
    .from("srs_review_state")
    .upsert(
      { user_id: userId, lesson_id: lessonId, ...emptyCardFields() },
      { onConflict: "user_id,lesson_id", ignoreDuplicates: true },
    );
  if (enrolError) {
    // eslint-disable-next-line no-console
    console.error("[srs] enrol failed:", { code: enrolError.code, message: enrolError.message });
  }

  return jsonResponse({ ok: true }, { status: 200 });
};

/**
 * DELETE = unmark this lesson for the signed-in user.
 *
 * Deleting a non-existent row is not an error (the .eq filters match
 * zero rows; Supabase returns success with affected=0). Matches the
 * idempotent "make the world look like X" contract the toggle button
 * expects.
 */
export const DELETE: APIRoute = async (context) => {
  const userId = context.locals.user?.id;
  if (!userId) {
    return jsonResponse({ error: "unauthenticated" }, { status: 401 });
  }
  const lessonId = context.params.lessonId;
  if (!lessonId) {
    return jsonResponse({ error: "missing_lesson_id" }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "supabase_not_configured" }, { status: 500 });
  }

  const { error } = await supabase.from("lesson_completions").delete().eq("user_id", userId).eq("lesson_id", lessonId);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[completions] DELETE failed:", { code: error.code, message: error.message });
    return jsonResponse({ error: "delete_failed" }, { status: 500 });
  }

  return jsonResponse({ ok: true }, { status: 200 });
};
