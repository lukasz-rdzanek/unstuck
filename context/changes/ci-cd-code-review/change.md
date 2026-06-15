---
change_id: ci-cd-code-review
title: AI code-review pipeline on GitHub Actions (M5L3 — Champion proof #1)
status: done
created: 2026-06-15
updated: 2026-06-16
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

## Live run (2026-06-16) — DONE

`ANTHROPIC_API_KEY` secret set; PR #1 (`ci/ai-code-review-pipeline → master`) ran the
pipeline green. The agent posted a review comment (per-criterion table + verdict),
applied `ai-cr:passed`, cost ~$0.42/run (Sonnet 4.6). CI debugging that was needed and
fixed along the way (good lessons): diff passed as a **file** not env (E2BIG on large
PRs), `maxTurns` 2→6 (large diff needs room for structured output), lockfile regenerated
with **npm 10** to match the runner's `.nvmrc` (npm-11 lock → "Missing gcp-metadata"),
promptfoo dropped from deps (local-only via `npx`). Dogfood: the reviewer caught a real
SYSTEM_PROMPT/schema mismatch in its own PR; fixed → score 7→8/10. Champion proof #1 complete.
