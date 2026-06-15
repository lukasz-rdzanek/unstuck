# Code Review Agent (M5L2)

A standalone, scripted AI **code-review agent** for Unstuck. It reads a `git diff`
and returns a structured, 5-criteria review as JSON. This is the first, local
version of the **FS-2 "PR Risk Triage"** helper qualified in
[`context/foundation/opportunity-map.md`](../../context/foundation/opportunity-map.md);
M5L3 wires it into CI/CD with a human in the loop (Champion proof project #1).

> It is a **standalone package** with its own `package.json`/`node_modules`,
> deliberately independent of the Astro app — exactly the lesson's
> _"niezależna paczka, działająca lokalnie"_.

## The lesson's core idea: two SDK categories, one agent

The same agent is implemented twice to feel the difference the lesson draws:

| File                                     | SDK                              | Category                                                 | Why it's here                                                                                                       |
| ---------------------------------------- | -------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [`review-claude.ts`](./review-claude.ts) | **Claude Agent SDK**             | _Ready agent_ — the loop, tools, sandbox come in the box | **Primary, verified.** Native structured output, zero-key auth via the Claude Code session, can inherit repo rules. |
| [`review-vercel.ts`](./review-vercel.ts) | **Vercel AI SDK 6 + OpenRouter** | _Assemble-it-yourself_ — you mount the parts             | The model-juggling path the lesson recommends for the course project. Provider swap = one line.                     |

Both share one source of truth — [`common/review-schema.ts`](./common/review-schema.ts)
(the zod schema + system prompt + the `Review` type) — and both inject the repo's
own tripwires via [`common/repo-rules.ts`](./common/repo-rules.ts). The loop itself
is hidden behind `query()` (Claude) and `ToolLoopAgent` (Vercel); the only real
difference is _how much lives outside the loop_.

## Run it

```bash
npm install

# Primary path — Claude Agent SDK (uses your active Claude Code session, no key):
git diff | npx tsx review-claude.ts
npm run review:sample:claude          # uses samples/sample.diff

# Model-juggling path — Vercel AI SDK + OpenRouter (needs a key):
export OPENROUTER_API_KEY=...         # required for this path only
npm run review:sample:vercel
```

Output is the review JSON on **stdout**; metrics (turns, duration, cost, token
usage) go to **stderr**. The process exits `0` on `verdict: "pass"` and `2` on
`"fail"` — ready to be a CI gate in M5L3.

## What the schema returns

Five 1–10 scores (implementation correctness, idiomaticity, complexity,
test-vs-risk coverage, security), a binding `pass`/`fail` verdict, and a Markdown
`summary` ready to post as a PR comment. Scores are plain `z.number()` because
Anthropic's structured output rejects `minimum`/`maximum` on integers — the 1–10
range is enforced via field descriptions + the prompt (per the lesson).

## Verified run (evidence)

Ran against [`samples/sample.diff`](./samples/sample.diff) — a diff deliberately
seeded with six real Unstuck tripwires. The agent (Claude Agent SDK, model
`claude-sonnet-4-6`) caught **all** of them and returned `verdict: fail`:

1. New table `lesson_bookmarks` **without RLS** → AGENTS.md rule #1
2. API route **without `export const prerender = false`** → AGENTS.md
3. **`"use client"`** directive in an Astro repo → AGENTS.md
4. `user_id` taken from the **request body** (IDOR) → security
5. **manual Tailwind class concat** instead of `cn()` → AGENTS.md
6. **no tests** for a security-relevant path

Saved output: [`samples/sample-output.claude.json`](./samples/sample-output.claude.json)

- metrics in `samples/sample-output.claude.metrics.txt`. First run: 2 turns, ~50 s,
  **$0.20**; second run hit the prompt cache → **$0.066** (46k cached tokens). A
  generic reviewer can't produce this — it cites _this repo's_ rules by name, which
  is the whole point of FS-2.

## Auth & data privacy (who sees your diff)

The **auth path**, not the SDK, decides data handling:

- **Claude Agent SDK + commercial `ANTHROPIC_API_KEY`** — no training on your
  code, 30-day retention. The safe default for company code and CI.
- **Claude Agent SDK + Claude Code session (subscription)** — convenient, no key,
  but falls under consumer terms (training default-on, up to 5-yr retention until
  you opt out). Fine for this course/demo; switch to a commercial key for CI.
- **Vercel AI SDK** — the `ai` library is _not_ in your data path by default; the
  request goes straight to whichever provider you imported, under _their_ terms.

## Cost control

- Both SDKs expose token usage on the result (`usage` / `totalUsage`).
- Claude Agent SDK computes `total_cost_usd` for you and supports a hard cap via
  `maxBudgetUsd`. OpenRouter Agent SDK has `maxCost`; Vercel AI SDK needs a custom
  `StopCondition`. The OpenRouter _provider_ reports real billed cost when you set
  `usage: { include: true }` (already wired in `review-vercel.ts`).
- Rule of thumb (from the lesson): run on a **meaningful event** (PR opened, red
  build), and pick the **cheapest model that's good enough** — hence Sonnet, not
  Opus, for review.

## CI/CD pipeline (M5L3)

The local agent is now wired into GitHub Actions (Champion proof project #1):

```
.github/workflows/review.yml          # consumer: runs on every PR to master (+ manual)
.github/actions/ai-reviewer/action.yml # composite action wrapping the agent
.github/workflows/claude-review.yml    # alt: Anthropic's Claude Code Action (manual-only)
tools/code-review-agent/review-ci.ts   # CI entrypoint: env in → $GITHUB_OUTPUT + PR comment/labels
```

Flow: PR opened → workflow checks out (`fetch-depth: 0`) → computes the diff vs base
→ composite action runs the agent with the diff + PR title/body → agent posts a PR
comment with per-criterion scores + summary, sets `ai-cr:passed`/`ai-cr:failed`, and
emits `verdict`/`score` outputs → the **Gate** step turns the check red on `fail`
(advisory; can become a required check when the repo is public/Pro).

### Tasks covered (M5L3)

1. **Criteria** — [`criteria.md`](./criteria.md): 6 criteria with 1/10 anchors + tripwires.
2. **Criteria + forced output** — the zod schema (6 scores + overall `score` + `verdict`)
   is enforced via `outputFormat`; verified on the seeded diff (`score: 2`, `verdict: fail`).
3. **Model comparison (evals)** — [`evals/`](./evals/): promptfoo compares 3 models on
   two fixtures (SQL-injection, React 16→19 with 3 flaws) with `is-json` + `llm-rubric`
   - hard `score`/`verdict` assertions. Config validated. Run: `npm run eval` (needs
     `OPENROUTER_API_KEY`). Doubles as a regression gate before prompt changes.
4. **Agency ladder (optional)** — [`review-agentic.ts`](./review-agentic.ts) +
   [`common/tools.ts`](./common/tools.ts): `readPlan`, `readReviewCriteria` (read) and
   `postPrComment` (write, dry-run unless `REVIEW_ALLOW_WRITE=1`), bounded by
   `stepCountIs(8)` with per-step token telemetry.

### To run it live (repo owner only)

1. Add a repo secret `ANTHROPIC_API_KEY` (commercial key → no training, 30-day retention):
   `gh secret set ANTHROPIC_API_KEY`.
2. Push a branch, open a PR to `master` → the pipeline runs and comments.
3. Champion evidence = the Actions run view + a job's logs + the LLM comment on the PR.

The custom pipeline (`review.yml`) is primary; `claude-review.yml` is the off-the-shelf
comparison (manual trigger so it never double-charges). Both pin third-party actions to a
commit SHA, not a moving tag.
