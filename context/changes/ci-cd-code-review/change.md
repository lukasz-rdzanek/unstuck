---
change_id: ci-cd-code-review
title: AI code-review pipeline on GitHub Actions (M5L3 — Champion proof #1)
status: in-progress
created: 2026-06-15
updated: 2026-06-15
---

## Notes

M5L3 deliverable: promote the local L2 agent (`tools/code-review-agent/`) into a
CI/CD code-review pipeline on GitHub Actions, human-in-the-loop. The agent already
exists and is verified (M5L2); this change adds the **infrastructure around it**:

- A consumer workflow `.github/workflows/review.yml` — runs on every PR to `master`
  (+ `workflow_dispatch` for manual testing). Computes the diff, passes PR
  title/body/diff to the reviewer, gates on the verdict.
- A **composite action** `.github/actions/ai-reviewer/action.yml` — wraps the agent
  as a reusable, parameterized step (the lesson's option 2: in-repo `.github/actions/`).
- A **CI entrypoint** `review-ci.ts` — reads PR inputs from env, runs the same
  Claude Agent SDK review used locally, writes `verdict`/`score` to `$GITHUB_OUTPUT`,
  posts a PR comment, and sets the `ai-cr:passed` / `ai-cr:failed` labels.
- **promptfoo evals** (`evals/`) — a regression gate comparing 2-3 models on the
  same fixtures, so "cheaper or pricier model?" is decided by a results matrix.
- **Optional agentic tools** (`review-agentic.ts`) — the agency ladder: `readPlan`,
  `readReviewCriteria` (read), `postPrComment` (write).

Implements FS-2 "PR Risk Triage" (see `context/foundation/opportunity-map.md`) at
the CI tier. This is 10xChampion proof project #1; evidence = pipeline view + job
logs + the LLM review comment on a real PR.

Requirements brainstorm: `requirements.md` (this folder).
Credential-gated step (only the repo owner can do): add an `ANTHROPIC_API_KEY`
(or `OPENROUTER_API_KEY`) repo secret, then push a branch + open a PR to capture
the Champion screenshots.
