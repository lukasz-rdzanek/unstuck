/**
 * Text → embedding via Cloudflare Workers AI (ai-answer-matching).
 *
 * SERVER-ONLY. Imports `cloudflare:workers`, which must never enter the client
 * bundle — only API routes import this. The same model + dimensionality are
 * used for both the backfill (stored messages) and the live query embedding;
 * comparing vectors from different models is meaningless, so the constants here
 * are the single source of truth and must match the `vector(768)` column.
 */

import { env } from "cloudflare:workers";

export const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
export const EMBEDDING_DIM = 768;

/** Minimal shape of the Workers AI binding's `run` for text embeddings. */
interface AiBinding {
  run(model: string, inputs: { text: string[] }): Promise<{ data?: number[][] }>;
}

/**
 * Embed a single string. Normalizes whitespace + lowercases (bge is
 * case-insensitive in practice and search inputs are rarely capitalized) and
 * caps length defensively. Throws on a missing binding or an unexpected vector
 * shape — callers treat embedding as best-effort and degrade silently.
 */
export async function embedText(text: string): Promise<number[]> {
  const ai = (env as unknown as { AI?: AiBinding }).AI;
  if (!ai) throw new Error("ai_binding_missing");

  const input = text.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 2000);
  if (!input) throw new Error("empty_text");

  const res = await ai.run(EMBEDDING_MODEL, { text: [input] });
  const vec = res.data?.[0];
  if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) {
    throw new Error(
      `embedding_failed: expected ${EMBEDDING_DIM} dims, got ${Array.isArray(vec) ? vec.length : "none"}`,
    );
  }
  return vec;
}

/** pgvector text literal for a vector RPC arg, e.g. "[0.1,0.2,...]". */
export function toVectorLiteral(vec: number[]): string {
  return JSON.stringify(vec);
}
