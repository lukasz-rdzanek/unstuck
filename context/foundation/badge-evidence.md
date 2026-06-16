# 10xDevs 3.0 — Badge Evidence Map (Architect + Champion)

> **For a reviewer.** This is a self-contained map of **where and how** each badge
> requirement was realized in the **Unstuck** project, so it can be verified quickly.
>
> **How to read it.** Every item points to a path **inside this repository** (open the
> file) and, where the proof is a run/artifact rather than a file, to a **screenshot
> category** (the repo is private, so CI runs / the published package are shown as
> screenshots — the 10xChampion rules accept screenshots; no public company repo needed).
>
> **Privacy.** No secrets, keys, tokens, project refs, worker IDs, dashboards, or
> production credentials are listed here, and none are needed to follow it. A read-only
> audit confirms the repo carries no leaked secrets (see
> [`async-delegation.md`](./async-delegation.md), Task 4). Internal/sensitive assessment
> notes live in [`certification.md`](./certification.md) (not needed for review).

## Status at a glance

| Badge                         | Verdict                                       | Where the proof lives                                                                                              |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 🚀 **10xBuilder** (mandatory) | Complete                                      | access control, CRUD, business logic, context docs, tests, CI — see below                                          |
| 🔧 **10xArchitect**           | Strongly demonstrated                         | `context/archive/` (28 changes), `context/architect-report.md`, `context/domain/`, `context/foundation/lessons.md` |
| 🏆 **10xChampion**            | **Two independent proof projects, both live** | (1) AI code-review CI/CD pipeline; (2) shared AI registry published to GitHub Packages                             |

---

## 🔧 10xArchitect — architecture, modernization, refactoring, AI at scale

| Requirement                                          | How it was realized                                                                                                                                 | Where to look (open these)                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Iterative architecture via a repeatable workflow** | Every change ran plan → implement → impl-review → archive, each with a `## Progress` contract + SHA-stamped phases                                  | `context/archive/` (28 archived changes); each has `change.md` + `reviews/impl-review.md`                 |
| **Refactoring / supersession (reuse, not rewrite)**  | The FSRS spaced-repetition engine was kept and **re-pointed** onto quiz questions; semantic answer-matching **extends** the v1 curated-seeding rule | `context/archive/2026-06-06-learning-loop/`, `context/archive/2026-06-07-ai-answer-matching/`             |
| **Domain modeling (DDD)**                            | Domain distillation, invariant/aggregate refactor, anti-corruption layer, event storming                                                            | `context/domain/01..04*.md`                                                                               |
| **AI at scale**                                      | pgvector + Cloudflare Workers AI embeddings for semantic search over chat; FSRS-6 scheduling                                                        | `src/lib/embeddings.ts`, `src/lib/srs.ts`, the `match_lesson_answers` migration in `supabase/migrations/` |
| **Load-bearing invariants captured as rules**        | Answer-key protection (enable-not-force RLS + definer-owned fns); the `SRS_CARD_COLUMNS` string-literal gotcha                                      | `context/foundation/lessons.md`                                                                           |
| **Deliberate tech selection + research**             | Stack chosen against agent-friendliness gates; SRS library chosen via research                                                                      | `context/foundation/tech-stack.md`; `context/architect-report.md` (synthesis)                             |
| **Module-4 architecture analysis**                   | Repo map, blast-radius, feature research, refactor backlog                                                                                          | `context/architect-report.md`, `context/map/`, `context/changes/` analyses                                |

**To verify Architect:** open `context/architect-report.md` (the synthesis), then sample
2–3 folders in `context/archive/` to see the plan → impl-review → archive loop, and skim
`context/domain/`. No screenshots required — it's all in-repo.

---

## 🏆 10xChampion — AI in modern dev teams, CI/CD pipelines (Module 5)

The badge needs **one** practical project. Unstuck has **two**, both live.

### The three foundational "pieces" (pre-Module-5 groundwork)

| Piece                                | Where                                                                      | Verify                                   |
| ------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------- |
| **Tests in CI**                      | `.github/workflows/ci.yml` (`npm run test`: Vitest unit + Playwright e2e)  | open `ci.yml`; screenshot a green CI run |
| **CD (auto-deploy)**                 | `ci.yml` `deploy` job → Cloudflare on merge to `master`, gated on green CI | open `ci.yml`; screenshot a `deploy` run |
| **AI-assisted PR flow (documented)** | `CONTRIBUTING.md` + `.github/pull_request_template.md`                     | open both files                          |

### ✅ Proof project #1 — AI code-review CI/CD pipeline (M5L2 + M5L3)

| Aspect                   | Where (open)                                                                                                                          | Evidence (screenshot)                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| The agent                | `tools/code-review-agent/` (Claude Agent SDK + Vercel/OpenRouter alt; shared zod schema; repo-tripwire injection; 6-criteria + score) | `tools/code-review-agent/samples/sample-output.claude.json`     |
| The pipeline             | `.github/workflows/review.yml` + `.github/actions/ai-reviewer/action.yml` + `tools/code-review-agent/review-ci.ts`                    | the **"AI Code Review" workflow run** view + a job's logs       |
| Criteria / DoD           | `tools/code-review-agent/criteria.md`                                                                                                 | —                                                               |
| Model-comparison evals   | `tools/code-review-agent/evals/` (promptfoo, 3 models, 2 fixtures)                                                                    | —                                                               |
| Agency ladder (optional) | `tools/code-review-agent/review-agentic.ts` + `common/tools.ts`                                                                       | —                                                               |
| **Live result**          | merged via **PR #1**                                                                                                                  | the **LLM review comment** on the PR + the `ai-cr:passed` label |

**Verification path:** Repository → **Actions** → "AI Code Review" → open a successful run
(pipeline view + job logs) → open **PR #1** → the bot's review comment (per-criterion table,
verdict, score) + label. Notable: the reviewer **caught a real bug in its own PR** (a
prompt/schema mismatch) which was then fixed (score 7→8) — a genuine human-in-the-loop loop.

### ✅ Proof project #2 — Shared AI registry (M5L4)

| Aspect                      | Where (open)                                                                                                                                       | Evidence (screenshot)                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Distribution-model decision | `context/foundation/ai-distribution.md` (consumer = solo-on-GitHub → Model 1: GitHub Packages)                                                     | —                                                                                                                                                           |
| The package                 | `tools/ai-toolkit/` — `package.json`, `install.js`/`uninstall.js` (sentinel + manifest + guards), `skills/code-review/SKILL.md`, `rules/CLAUDE.md` | `tools/ai-toolkit/package.json`                                                                                                                             |
| Publish pipeline            | `.github/workflows/publish-ai-toolkit.yml` (ephemeral `GITHUB_TOKEN`, 409-guarded)                                                                 | the **"Publish AI Toolkit" run** view                                                                                                                       |
| **Released versions**       | published to GitHub Packages                                                                                                                       | the repository **Packages** page (`@lukasz-rdzanek/unstuck-ai-toolkit`, **v0.1.0**) + the publish run log line `+ @lukasz-rdzanek/unstuck-ai-toolkit@0.1.0` |

**Verification path:** Repository → **Packages** → `unstuck-ai-toolkit` → version `0.1.0`;
and Repository → **Actions** → "Publish AI Toolkit" → the run with a successful `publish` job.
Source of truth + package definition (`package.json`) + version list = the three Champion
evidence categories.

---

## Module 5 lesson-by-lesson artifacts (completeness)

| Lesson                         | Artifact(s)                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **M5L1** AI Internal Builders  | `context/foundation/opportunity-map.md` + `context/foundation/mom-test.md` (5 friction signals qualified; chosen helper = "PR Risk Triage") |
| **M5L2** Your first team agent | `tools/code-review-agent/` (agent on two SDK categories, verified locally)                                                                  |
| **M5L3** Code review in CI     | `.github/workflows/review.yml` + `.github/actions/ai-reviewer/` + evals (live on PR #1)                                                     |
| **M5L4** Shared AI registry    | `tools/ai-toolkit/` + `.github/workflows/publish-ai-toolkit.yml` (published v0.1.0)                                                         |
| **M5L5** Async & remote agents | `context/foundation/async-delegation.md` (boundary contract + executed audit + dry-run matrix)                                              |

---

## What is intentionally NOT here (and why)

To keep this reviewable without exposing anything sensitive or unreachable:

- **No secrets/keys/tokens** — the review pipeline's API key lives only in the repo's
  GitHub Actions secret store; the toolkit publishes with the ephemeral `GITHUB_TOKEN`.
- **No private dashboards** — Supabase/Cloudflare consoles and production credentials are
  not referenced; nothing here requires them to verify.
- **Runtime proofs are screenshots** — CI runs and the published package are shown as
  screenshots because the repository is private (per 10xChampion rules).
