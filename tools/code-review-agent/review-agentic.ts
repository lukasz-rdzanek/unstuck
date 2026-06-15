/**
 * Agentic reviewer (M5L3, Task 4) — the agency ladder in action.
 * Same ToolLoopAgent as review-vercel.ts, but now with tools: it can READ the
 * plan + criteria from the repo and (optionally) WRITE a PR comment. The single-shot
 * "scorer" becomes an actor that reads, decides, and acts — without re-architecting.
 *
 * Run:   export OPENROUTER_API_KEY=...
 *        git diff | npx tsx review-agentic.ts
 *        (writes are dry-run unless REVIEW_ALLOW_WRITE=1 and GH_TOKEN are set)
 *
 * Cost guard: hard step cap (stopWhen) + per-step telemetry (onStepFinish).
 */
import { ToolLoopAgent, Output, stepCountIs } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { REVIEW_SCHEMA, SYSTEM_PROMPT, readDiff } from "./common/review-schema.ts";
import { buildSystemPrompt } from "./common/repo-rules.ts";
import { readPlan, readReviewCriteria, postPrComment } from "./common/tools.ts";

const AGENTIC_INSTRUCTIONS = `${buildSystemPrompt(SYSTEM_PROMPT)}

Masz narzędzia:
- readReviewCriteria: wczytaj rubrykę oceny ZANIM ocenisz diff.
- readPlan: jeśli tytuł/opis PR-a wskazuje plan (np. 'Plan: <change-id>' albo ścieżkę
  context/changes/<id>/plan.md), wczytaj go i oceń, czy diff realizuje plan.
- postPrComment: jeśli podano numer PR-a, opublikuj końcowe podsumowanie (raz, na końcu).

Najpierw wczytaj kryteria, opcjonalnie plan, potem zwróć ustrukturyzowany werdykt.`;

if (!process.env.OPENROUTER_API_KEY) {
  console.error("Brak OPENROUTER_API_KEY. Ścieżka agentowa (Vercel AI SDK + OpenRouter) wymaga klucza.");
  process.exit(1);
}

const diff = await readDiff();
if (!diff.trim()) {
  console.error("Brak diffa na stdin. Użyj: git diff | npx tsx review-agentic.ts");
  process.exit(1);
}

const reviewer = new ToolLoopAgent({
  model: openrouter(process.env.REVIEW_MODEL ?? "z-ai/glm-5.1", { usage: { include: true } }),
  instructions: AGENTIC_INSTRUCTIONS,
  tools: { readReviewCriteria, readPlan, postPrComment },
  output: Output.object({ schema: REVIEW_SCHEMA }),
  stopWhen: stepCountIs(8), // twardy sufit — bez tego rozbiegana pętla pali budżet na każdym PR
});

const prContext = process.env.PR_NUMBER ? `\n\nNumer PR-a: ${process.env.PR_NUMBER}` : "";
const { output } = await reviewer.generate({
  prompt: `Zrecenzuj ten diff:${prContext}\n\n${diff}`,
  onStepFinish: ({ stepNumber, usage, finishReason, toolCalls }) => {
    const tools = toolCalls?.map((t) => t.toolName).join(", ") || "—";
    console.error(
      `[krok ${stepNumber}] narzędzia: ${tools} | ${usage.inputTokens ?? "?"} in / ${usage.outputTokens ?? "?"} out (${finishReason})`,
    );
  },
});

console.log(JSON.stringify(output, null, 2));
process.exit(output.verdict === "pass" ? 0 : 2);

export {};
