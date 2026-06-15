/**
 * Code-review agent — "assemble-it-yourself" category (Vercel AI SDK 6).
 * M5L2. Same scenario, same JSON out — but the provider is swappable in one line,
 * which is exactly why the lesson recommends this path for the course project
 * (model-juggling). Repo rules are injected manually (no harness reads them).
 *
 * Run:   git diff | npx tsx review-vercel.ts
 *        npm run review:sample:vercel            (uses samples/sample.diff)
 *
 * Auth:  needs OPENROUTER_API_KEY (this path does NOT use the Claude Code session).
 *        Swap provider by changing the import + model line (e.g. @ai-sdk/anthropic).
 */
import { ToolLoopAgent, Output, stepCountIs } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { REVIEW_SCHEMA, SYSTEM_PROMPT, readDiff, type Review } from "./common/review-schema.ts";
import { buildSystemPrompt } from "./common/repo-rules.ts";

async function review(diff: string): Promise<{ review: Review; usage: unknown; cost?: number }> {
  const reviewer = new ToolLoopAgent({
    // podmiana dostawcy = zmiana tej jednej linii; usage:{include:true} włącza
    // raportowanie realnego, rozliczonego kosztu z OpenRoutera.
    model: openrouter("z-ai/glm-5.1", { usage: { include: true } }),
    instructions: buildSystemPrompt(SYSTEM_PROMPT), // reguły repo wstrzykujemy sami
    tools: {},
    output: Output.object({ schema: REVIEW_SCHEMA }), // ten sam zod, bez konwersji
    stopWhen: stepCountIs(2), // review nie potrzebuje więcej kroków
  });

  const { output, totalUsage, providerMetadata } = await reviewer.generate({
    prompt: `Zrecenzuj ten diff:\n\n${diff}`,
    onStepFinish: ({ stepNumber, usage, finishReason }) => {
      console.error(
        `[krok ${stepNumber}] ${usage.inputTokens ?? "?"} in / ${usage.outputTokens ?? "?"} out (${finishReason})`,
      );
    },
  });

  const cost = (providerMetadata?.openrouter as { usage?: { cost?: number } } | undefined)?.usage?.cost;
  return { review: output, usage: totalUsage, cost };
}

if (!process.env.OPENROUTER_API_KEY) {
  console.error(
    "Brak OPENROUTER_API_KEY. Ta ścieżka (Vercel AI SDK + OpenRouter) wymaga klucza.\n" +
      "Ustaw go: export OPENROUTER_API_KEY=... — albo użyj ścieżki Claude (review-claude.ts),\n" +
      "która działa na sesji Claude Code bez jawnego klucza.",
  );
  process.exit(1);
}

const diff = await readDiff();
if (!diff.trim()) {
  console.error("Brak diffa na stdin. Użyj: git diff | npx tsx review-vercel.ts");
  process.exit(1);
}

const { review: reviewResult, usage, cost } = await review(diff);
console.log(JSON.stringify(reviewResult, null, 2));
console.error(
  `\n[metryki] usage=${JSON.stringify(usage)} cost=${cost != null ? `$${cost}` : "n/d (provider nie raportuje)"}`,
);

process.exit(reviewResult.verdict === "pass" ? 0 : 2);

export {};
