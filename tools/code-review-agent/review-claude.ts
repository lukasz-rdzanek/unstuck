/**
 * Code-review agent — "ready agent" category (Claude Agent SDK v0.3).
 * Local CLI wrapper around the shared review core. M5L2/L3.
 *
 * Run:   git diff | npx tsx review-claude.ts
 *        npm run review:sample:claude            (uses samples/sample.diff)
 *
 * Auth:  with an active Claude Code session, no explicit key is needed. For CI,
 *        set ANTHROPIC_API_KEY (commercial key → no training, 30-day retention).
 */
import { readDiff } from "./common/review-schema.ts";
import { runReview } from "./common/run-review.ts";

const diff = await readDiff();
if (!diff.trim()) {
  console.error("Brak diffa na stdin. Użyj: git diff | npx tsx review-claude.ts");
  process.exit(1);
}

const { review, metrics } = await runReview({
  diff,
  prTitle: process.env.PR_TITLE,
  prBody: process.env.PR_BODY,
});

console.log(JSON.stringify(review, null, 2));
console.error(
  `\n[metryki] turns=${metrics.numTurns ?? "?"} duration=${metrics.durationMs ?? "?"}ms ` +
    `cost=${metrics.totalCostUsd != null ? `$${metrics.totalCostUsd.toFixed(6)}` : "n/d"}\n` +
    `[usage] ${metrics.usage ? JSON.stringify(metrics.usage) : "n/d"}`,
);

// Werdykt steruje kodem wyjścia → gotowa bramka CI.
process.exit(review.verdict === "pass" ? 0 : 2);

export {};
