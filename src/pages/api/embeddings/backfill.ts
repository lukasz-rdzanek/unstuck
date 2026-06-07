import type { APIRoute } from "astro";
import { z } from "zod";
import { OPERATOR_USER_ID } from "astro:env/server";
import { createClient } from "@/lib/supabase";
import { embedText, toVectorLiteral } from "@/lib/embeddings";

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

const bodySchema = z.object({ batchSize: z.number().int().min(1).max(200).optional() });

/**
 * POST = embed messages that still lack an embedding (ai-answer-matching P2).
 *
 * Operator-gated + idempotent. Reads a batch via list_unembedded_messages,
 * embeds each body with Workers AI, and persists via set_message_embedding
 * (the null-only column-scoped definer writer — the messages table is otherwise
 * immutable). The insert/Realtime chat path is untouched: embeddings are filled
 * out-of-band ("lazy embed"). The caller re-invokes until `embedded` is 0.
 *
 * Fail-closed: if OPERATOR_USER_ID is unset the endpoint is disabled. Per-row
 * embedding failures are counted, not fatal — a permanently failing row simply
 * stays NULL and the loop terminates when a batch embeds nothing new.
 */
export const POST: APIRoute = async (context) => {
  const userId = context.locals.user?.id;
  if (!userId) return jsonResponse({ error: "unauthenticated" }, { status: 401 });
  if (!OPERATOR_USER_ID) return jsonResponse({ error: "backfill_disabled" }, { status: 503 });
  if (userId !== OPERATOR_USER_ID) return jsonResponse({ error: "forbidden" }, { status: 403 });

  let raw: unknown = {};
  try {
    raw = await context.request.json();
  } catch {
    raw = {};
  }
  const parsed = bodySchema.safeParse(raw ?? {});
  const batchSize = parsed.success ? (parsed.data.batchSize ?? 50) : 50;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return jsonResponse({ error: "supabase_not_configured" }, { status: 500 });

  const { data, error: listError } = await supabase.rpc("list_unembedded_messages", {
    p_limit: batchSize,
  });
  if (listError) {
    console.error("[embeddings] list failed:", listError.message);
    return jsonResponse({ error: "list_failed" }, { status: 500 });
  }
  // A `{ data: null, error: null }` list result must be treated as empty, not
  // iterated (mirrors the `rest ?? []` guard below). Otherwise `for (const row
  // of null)` throws and 500s a non-error, no-work case. The generated RPC types
  // narrow `data` to non-null after the error guard, so the linter flags `?? []`
  // as "unnecessary" — but PostgREST returns null for an empty SETOF at runtime
  // (the F4 bug; backfill.test.ts pins it). The guard stays; the rule is wrong here.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const pending = data ?? [];

  let embedded = 0;
  let failed = 0;
  for (const row of pending) {
    try {
      const vec = await embedText(row.body);
      const { error: setError } = await supabase.rpc("set_message_embedding", {
        p_message_id: row.id,
        p_embedding: toVectorLiteral(vec),
      });
      if (setError) {
        console.error("[embeddings] set failed:", { id: row.id, message: setError.message });
        failed += 1;
        continue;
      }
      embedded += 1;
    } catch (err) {
      console.error("[embeddings] embed failed:", { id: row.id, err: String(err) });
      failed += 1;
    }
  }

  // Approximate remaining (capped at 200 by the RPC). Caller loops until embedded === 0.
  const { data: rest } = await supabase.rpc("list_unembedded_messages", { p_limit: 200 });
  const remaining = (rest ?? []).length;

  return jsonResponse({ ok: true, embedded, failed, remaining }, { status: 200 });
};
