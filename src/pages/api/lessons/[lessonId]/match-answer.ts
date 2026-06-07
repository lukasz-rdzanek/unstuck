import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { embedText, toVectorLiteral } from "@/lib/embeddings";
import { getCourseIdForLesson, matchAnswer } from "@/lib/services/answer-match";

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

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const bodySchema = z.object({
  question: z.string().min(1).max(4000),
  excludeMessageId: z.string().regex(UUID_RE).optional(),
});

/**
 * POST = find the single most relevant prior answer to `question` in the same
 * course (ai-answer-matching P3). Embeds the question with Workers AI, then
 * ranks via match_lesson_answers (course-gated, seed-boosted, threshold).
 *
 * Best-effort: any failure (no access, embedding error, RPC error, no match)
 * returns { ok: true, match: null } so the chat never breaks over a missing
 * suggestion. The answer body is gated by has_course_access at two layers (lesson
 * read + definer fn), so a learner can never see content from a course they lack.
 */
export const POST: APIRoute = async (context) => {
  const userId = context.locals.user?.id;
  if (!userId) return jsonResponse({ error: "unauthenticated" }, { status: 401 });

  const lessonId = context.params.lessonId;
  if (!lessonId) return jsonResponse({ error: "missing_lesson_id" }, { status: 400 });

  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return jsonResponse({ error: "invalid_request" }, { status: 400 });

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return jsonResponse({ error: "supabase_not_configured" }, { status: 500 });

  // Everything below is best-effort: course resolve, embed, and the match RPC
  // all degrade to { match: null } rather than 500-ing the suggestion lookup.
  try {
    const courseId = await getCourseIdForLesson(supabase, lessonId);
    if (!courseId) return jsonResponse({ ok: true, match: null }, { status: 200 });

    const embeddingLiteral = toVectorLiteral(await embedText(parsed.data.question));
    const match = await matchAnswer(supabase, {
      courseId,
      embeddingLiteral,
      excludeAuthor: userId,
      excludeMessageId: parsed.data.excludeMessageId,
    });
    return jsonResponse({ ok: true, match }, { status: 200 });
  } catch (err) {
    console.error("[answer-match] match failed:", String(err));
    return jsonResponse({ ok: true, match: null }, { status: 200 });
  }
};
