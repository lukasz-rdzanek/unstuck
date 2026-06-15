/**
 * CI entrypoint for the code-review agent (M5L3).
 * Runs on a GitHub Actions runner inside the composite action `.github/actions/ai-reviewer`.
 *
 * Reads (env):
 *   DIFF          — the git diff to review (required)
 *   PR_TITLE      — pull request title (optional context)
 *   PR_BODY       — pull request body  (optional context)
 *   PR_NUMBER     — PR number, for posting the comment/labels (optional)
 *   GITHUB_OUTPUT — set by GHA; we append `verdict`/`score` for the consumer workflow
 *   GH_TOKEN      — token for `gh` (PR comment + labels). Side-effects skipped if absent.
 *
 * Auth: ANTHROPIC_API_KEY (commercial key) on CI.
 *
 * Exit code: 0 on verdict=pass, 2 on verdict=fail → the step (and a future required
 * status check) can gate the merge.
 */
import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { runReview } from "./common/run-review.ts";

function ghOutput(key: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  // Multiline-safe heredoc form required by GHA.
  const delim = `__GHA_${key}_${Math.abs(hash(value))}__`;
  appendFileSync(file, `${key}<<${delim}\n${value}\n${delim}\n`);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function gh(args: string[]): void {
  try {
    execFileSync("gh", args, { stdio: "inherit" });
  } catch (err) {
    console.error(`[gh] krok pominięty (${args[0]} ${args[1]}): ${(err as Error).message}`);
  }
}

const diff = process.env.DIFF ?? "";
if (!diff.trim()) {
  console.error("Brak DIFF w env. Czy workflow policzył `git diff` z fetch-depth: 0?");
  process.exit(1);
}

const { review, metrics } = await runReview({
  diff,
  prTitle: process.env.PR_TITLE,
  prBody: process.env.PR_BODY,
});

// Konsola CI: pełny wynik + metryki kosztowe.
console.log(JSON.stringify(review, null, 2));
console.error(
  `[metryki] turns=${metrics.numTurns ?? "?"} duration=${metrics.durationMs ?? "?"}ms ` +
    `cost=${metrics.totalCostUsd != null ? `$${metrics.totalCostUsd.toFixed(6)}` : "n/d"}`,
);

// Wynik dla scenariusza konsumenta (bramka na verdict/score).
ghOutput("verdict", review.verdict);
ghOutput("score", String(review.score));

// Efekty uboczne: komentarz + etykieta (tylko gdy mamy numer PR-a i token).
const prNumber = process.env.PR_NUMBER;
const passed = review.verdict === "pass";
if (prNumber && process.env.GH_TOKEN) {
  const scores =
    `| kryterium | ocena |\n| --- | --- |\n` +
    `| poprawność implementacji | ${review.implementationCorrectness} |\n` +
    `| idiomatyczność | ${review.idiomaticity} |\n` +
    `| złożoność | ${review.complexity} |\n` +
    `| pokrycie testami vs ryzyko | ${review.testRiskCoverage} |\n` +
    `| dokumentacja | ${review.documentation} |\n` +
    `| bezpieczeństwo | ${review.securitySafety} |\n`;
  const body =
    `## 🤖 AI Code Review — ${passed ? "✅ pass" : "❌ fail"} (ocena ogólna: ${review.score}/10)\n\n` +
    `${scores}\n${review.summary}\n\n` +
    `<sub>FS-2 PR Risk Triage · model ${process.env.REVIEW_MODEL ?? "claude-sonnet-4-6"} · ` +
    `koszt ${metrics.totalCostUsd != null ? `$${metrics.totalCostUsd.toFixed(4)}` : "n/d"}</sub>`;

  gh(["pr", "comment", prNumber, "--body", body]);
  // Wyczyść poprzednią etykietę przeciwną, dodaj aktualną.
  gh(["pr", "edit", prNumber, "--remove-label", passed ? "ai-cr:failed" : "ai-cr:passed"]);
  gh(["pr", "edit", prNumber, "--add-label", passed ? "ai-cr:passed" : "ai-cr:failed"]);
}

process.exit(passed ? 0 : 2);

export {};
