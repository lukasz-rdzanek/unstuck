# requirements.md — ci-cd-code-review

> Brainstorm note that scopes the first version of the pipeline (the lesson's
> `requirements.md`). Deliberately MVP-narrow: a complete loop (diff in → verdict
>
> - label out), not a perfect architecture-aware reviewer.

## Overall concept

- GHA workflow run for every new pull request to `master` (+ `workflow_dispatch`).
- Composite action for the review itself so the main workflow stays easy to reason about.
- Reuse the existing local agent (`tools/code-review-agent/`) — do NOT rebuild it.

## Input parameters

- pull request title
- pull request description (conscious cost tradeoff — included; small)
- git diff (computed on the runner vs the base branch, `fetch-depth: 0`)

## Code Review Criteria

Each criterion is scored on a 1–10 scale, where 1 is the worst outcome and 10 is the
best. Full anchors live in `tools/code-review-agent/criteria.md`; summary:

1. **Implementation correctness** — does the code do what it claims, incl. edge cases & error handling.
2. **Idiomaticity / conventions** — matches the repo's AGENTS.md/CLAUDE.md rules (Astro, not Next; `cn()`; etc.).
3. **Complexity** — simplest solution adequate to the problem.
4. **Test coverage vs risk** — tests proportional to the risk of the changed paths (logic, RLS, security).
5. **Documentation** — changes are documented where it matters (context docs, comments on non-obvious code).
6. **Security** — no vulnerabilities or secret leaks; RLS on new tables; access gated; no IDOR.

The reviewer must also honor Unstuck's load-bearing tripwires (RLS on every new
table, no Next.js directives, `prerender = false` on API routes, answer-key
protection, the `SRS_CARD_COLUMNS` string-literal gotcha) — injected from the repo's
own `AGENTS.md` + `context/foundation/lessons.md` at runtime.

## Parked for later

- business alignment (requires broader context than the diff)
- architectural fit (requires broader context than the diff)
- plan-adherence review (the `readPlan` agentic path — present in `review-agentic.ts`,
  off the default CI path to keep cost/determinism predictable)

## Expected side-effects

- PR comment with the summary
- labels: `ai-cr:failed` (red) OR `ai-cr:passed` (green)

## Expected behavior

- on-demand retry when label `ai-cr:review` is added (nice-to-have; documented)
- the verdict drives the step exit code → a future required status check can gate merge
  (enforcement stays advisory until the repo is public/Pro — see certification.md)
