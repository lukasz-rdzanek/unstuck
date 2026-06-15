import { tool } from "ai";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Agentic tools for the "agency ladder" (M5L3, Task 4): read local context →
 * write to GitHub. Each tool is the same three things: description (so the model
 * decides WHEN to call it), inputSchema (Zod, validated both ways), execute.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

// --- READ: implementation plan the diff claims to implement ----------------
export const readPlan = tool({
  description:
    "Read an implementation plan from context/changes/<change-id>/plan.md. " +
    "Accepts a change-id (e.g. 'ci-cd-code-review') or a path to a plan.md. " +
    "Returns the plan contents, or { found: false } so you can proceed without it.",
  inputSchema: z.object({
    target: z.string().describe("A change-id or a plan.md path under context/changes/."),
  }),
  execute: async ({ target }) => {
    const candidates = target.endsWith(".md") ? [target] : [`context/changes/${target}/plan.md`];
    for (const rel of candidates) {
      try {
        return { found: true, path: rel, contents: readFileSync(resolve(repoRoot, rel), "utf8") };
      } catch {
        /* try next */
      }
    }
    return { found: false as const };
  },
});

// --- READ: the review rubric (same criteria the human DoD uses) -------------
export const readReviewCriteria = tool({
  description:
    "Read the code-review criteria (the rubric for judging a diff). Call this " +
    "before scoring so the review matches the team's Definition of Done.",
  inputSchema: z.object({}),
  execute: async () => {
    try {
      return { criteria: readFileSync(resolve(repoRoot, "tools/code-review-agent/criteria.md"), "utf8") };
    } catch {
      return { criteria: "(criteria.md not found)" };
    }
  },
});

// --- WRITE: comment on a PR (guarded; dry-run unless explicitly enabled) ----
export const postPrComment = tool({
  description:
    "Post a comment on a pull request. Use once, at the end, with the final review " +
    "summary. Requires PR_NUMBER + GH_TOKEN; otherwise returns a dry-run preview.",
  inputSchema: z.object({
    prNumber: z.string().describe("PR number to comment on."),
    body: z.string().describe("Markdown comment body."),
  }),
  execute: async ({ prNumber, body }) => {
    const enabled = process.env.REVIEW_ALLOW_WRITE === "1" && !!process.env.GH_TOKEN;
    if (!enabled) {
      return { posted: false as const, dryRun: true, preview: body.slice(0, 280) };
    }
    try {
      execFileSync("gh", ["pr", "comment", prNumber, "--body", body], { stdio: "inherit" });
      return { posted: true as const };
    } catch (err) {
      return { posted: false as const, error: (err as Error).message };
    }
  },
});
