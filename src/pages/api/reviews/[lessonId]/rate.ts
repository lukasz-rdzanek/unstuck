import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { applyRating, emptyCardFields, SRS_CARD_COLUMNS, type ReviewRating, type SrsCardFields } from "@/lib/srs";

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

const ratingSchema = z.object({
  rating: z.number().int().gte(1).lte(4),
});

/**
 * POST = grade this lesson's review card. Computes the next FSRS-6 state
 * server-side (authoritative; the client never sends scheduling state) and
 * upserts it. If no card exists yet (edge: rating before enrol), start from an
 * empty card so the rating still initializes one.
 *
 * user_id is derived from the session; RLS (srs_review_state_*_own) additionally
 * enforces user_id = auth.uid(), so a forged request can only touch its own row.
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

  let rawBody: unknown;
  try {
    rawBody = await context.request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = ratingSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse({ error: "invalid_rating" }, { status: 400 });
  }
  const rating = parsed.data.rating as ReviewRating;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "supabase_not_configured" }, { status: 500 });
  }

  const now = new Date();

  const { data: row, error: loadError } = await supabase
    .from("srs_review_state")
    .select(SRS_CARD_COLUMNS)
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (loadError) {
    console.error("[reviews] rate load failed:", { code: loadError.code, message: loadError.message });
    return jsonResponse({ error: "load_failed" }, { status: 500 });
  }

  const current: SrsCardFields = row ?? emptyCardFields(now);
  const next = applyRating(current, rating, now);

  const { error: upsertError } = await supabase
    .from("srs_review_state")
    .upsert(
      { user_id: userId, lesson_id: lessonId, ...next, updated_at: now.toISOString() },
      { onConflict: "user_id,lesson_id" },
    );
  if (upsertError) {
    console.error("[reviews] rate upsert failed:", { code: upsertError.code, message: upsertError.message });
    return jsonResponse({ error: "save_failed" }, { status: 500 });
  }

  return jsonResponse({ ok: true, due: next.due }, { status: 200 });
};
