import { query } from "@anthropic-ai/claude-agent-sdk";
import { REVIEW_SCHEMA, REVIEW_JSON_SCHEMA, SYSTEM_PROMPT, type Review } from "./review-schema.ts";
import { buildSystemPrompt } from "./repo-rules.ts";

/**
 * Shared review core (Claude Agent SDK). Used by the local CLI (review-claude.ts)
 * and the CI entrypoint (review-ci.ts) so there is exactly one reviewer codepath.
 *
 * Auth: uses ANTHROPIC_API_KEY when present (CI), otherwise the active Claude Code
 * session (local). The SDK resolves this for us.
 */

export interface ReviewInput {
  diff: string;
  prTitle?: string;
  prBody?: string;
}

export interface ReviewMetrics {
  usage?: unknown;
  modelUsage?: unknown;
  totalCostUsd?: number;
  numTurns?: number;
  durationMs?: number;
}

export interface ReviewOutput {
  review: Review;
  metrics: ReviewMetrics;
}

const MODEL = process.env.REVIEW_MODEL ?? "claude-sonnet-4-6";

function buildPrompt({ diff, prTitle, prBody }: ReviewInput): string {
  const header: string[] = [];
  if (prTitle) header.push(`Tytuł PR-a: ${prTitle}`);
  if (prBody) header.push(`Opis PR-a:\n${prBody}`);
  const ctx = header.length ? `${header.join("\n\n")}\n\n` : "";
  return `${ctx}Zrecenzuj ten diff:\n\n${diff}`;
}

export async function runReview(input: ReviewInput): Promise<ReviewOutput> {
  const result = query({
    prompt: buildPrompt(input),
    options: {
      systemPrompt: buildSystemPrompt(SYSTEM_PROMPT), // rola recenzenta + tripwire'y repo (FS-2)
      model: MODEL, // dobrany do roli; nadpisywalny przez REVIEW_MODEL
      allowedTools: [], // wąsko i przewidywalnie — bez narzędzi
      maxTurns: 2, // tura 1: ocena; tura 2: structured JSON
      outputFormat: { type: "json_schema", schema: REVIEW_JSON_SCHEMA },
    },
  });

  for await (const message of result) {
    if (message.type !== "result") continue;

    if (message.subtype === "success") {
      const raw = message.structured_output ?? tryParseJson(message.result);
      const parsed = REVIEW_SCHEMA.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`Niepoprawny structured output: ${parsed.error.message}\nOtrzymano: ${JSON.stringify(raw)}`);
      }
      return {
        review: parsed.data,
        metrics: {
          usage: message.usage,
          modelUsage: message.modelUsage,
          totalCostUsd: message.total_cost_usd,
          numTurns: message.num_turns,
          durationMs: message.duration_ms,
        },
      };
    }

    throw new Error(`Review nie powiodło się (${message.subtype}): ${message.errors.join("; ")}`);
  }
  throw new Error("Agent nie zwrócił wyniku");
}

export function tryParseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(value);
  const candidate = fenced ? fenced[1] : value;
  try {
    return JSON.parse(candidate.trim());
  } catch {
    return value;
  }
}
