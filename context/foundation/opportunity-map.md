# Opportunity Map — internal team helpers (M5L1)

> **What this is.** The practical artifact for Module 5, Lesson 1 (_AI Internal
> Builders_). It qualifies recurring team-friction signals _before_ any of them
> gets code, using the lesson's **buy / complement / build** framing and the
> four-field opportunity map. It is a working note, not a product backlog or
> market analysis.
>
> **Honesty caveat (Mom-Test spirit).** Unstuck is a **solo project** (one
> developer + a fleet of AI agents driving the `/10x-*` workflow). So "team
> friction" here means: friction between the human, the AI agents, the trackers,
> and any _future_ contributor. Where a signal only bites at multi-person scale,
> it is flagged. Signals are drawn from how the project **actually** runs today
> (Linear `UNS`, `roadmap.md`, per-change `change.md`/`plan.md`, `certification.md`,
> agent memory, the documented `ai-pr-pipeline`, and `AGENTS.md`/`lessons.md`
> tripwires) — not invented. Validation lives in [`mom-test.md`](./mom-test.md).
>
> Created 2026-06-15 · author: Łukasz · related: [`certification.md`](./certification.md),
> [`lessons.md`](./lessons.md), `context/archive/2026-06-07-ai-pr-pipeline/`.

---

## Krok 1 — Friction signals (the raw list)

Five recurring coordination costs, scored _concrete vs wish_. Wishes ("build a
dashboard", "add an agent") are deliberately excluded — these are unpacked
problems, each tied to an observable, repeated cost.

| #        | Friction signal (concrete)                                                                                                                                                                                                                                                                                                                         | How it shows up today                                                                                                                                                                        | Frequency                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **FS-1** | **State drifts across trackers.** Every status change must be hand-propagated to Linear (`UNS`), `roadmap.md`, the change's `change.md`/`plan.md`, `certification.md`, and agent memory.                                                                                                                                                           | This is already a _standing operating rule_ (the `consistency-maintenance` memory exists precisely because the drift recurred). Linear says one thing, `roadmap.md` another, memory a third. | Every slice / status flip      |
| **FS-2** | **PR review criteria are implicit and tripwire-dependent.** Nothing flags _which_ PR is risky. The load-bearing rules (RLS on every new table, no Next.js directives, `prerender=false`, answer-key protection, the `SRS_CARD_COLUMNS` string-literal gotcha) live in `AGENTS.md`/`lessons.md` and rely on the reviewer _remembering_ them per PR. | The AI gate (`/code-review ultra`) is human-triggered + billed; it runs only when someone remembers to run it, and it has no cheap "is this PR even risky?" pre-filter.                      | Every PR                       |
| **FS-3** | **AI artifacts are per-repo, copied by hand.** 25 `/10x-*` skills in `.claude/skills/`, plus the `CLAUDE.md`/`AGENTS.md` conventions and `lessons.md` rules. No shared, versioned source of truth across repos.                                                                                                                                    | A rule improved here (e.g. the `SRS_CARD_COLUMNS` literal gotcha) doesn't propagate; a second repo would re-learn it.                                                                        | Per new repo / per rule change |
| **FS-4** | **"What changed since the last session" is scattered.** Reconstructing project state means opening git log, the 25+ `context/archive/` folders, Linear, CI runs, and memory.                                                                                                                                                                       | Each new agent session re-derives context from scratch; there is no single read-only "since yesterday" view.                                                                                 | Every session start            |
| **FS-5** | **Release-readiness needs ≥3 separate checks.** Safe-to-merge = CI green **+** the Supabase migration applied (a deliberate _manual_ pre-merge step — the documented gotcha) **+** RLS/answer-key invariants verified.                                                                                                                             | No single view answers "is this safe to merge and auto-deploy?"; the manual-migration step is the easiest to forget and the most dangerous to miss.                                          | Every release-bearing PR       |

All five satisfy the "concrete signal" bar: a repeated, observable cost, not a
feature wish.

---

## Krok 2 — The opportunity map

For each signal: the friction, whether existing SaaS/defaults already solve it
(answered **honestly** — sometimes the right move is _don't build_), the thinnest
helper that could connect the local signals, and the cheapest first useful
version.

### FS-1 · State drift across trackers

| Field                     | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Friction signal**       | Project state must be manually mirrored across Linear, `roadmap.md`, per-change docs, `certification.md`, and memory; the copies drift.                                                                                                                                                                                                                                                                                                       |
| **SaaS / default answer** | Linear has GitHub sync (issue ↔ PR/branch status). It does **not** know about the repo-local markdown trackers (`roadmap.md`, `change.md`, `certification.md`) — that's the part no SaaS sees. **Honest counter:** a chunk of this is _essential_ complexity I created by keeping 5 sources of truth; the cheapest fix may be **deleting duplication** (make Linear canonical, demote markdown to generated views), not building a sync tool. |
| **Thin helper**           | A read-only drift checker: parse the markdown trackers + the Linear API, and emit a diff list ("`roadmap.md` says S-04 done; UNS-? still In Progress"). Reports drift; never writes.                                                                                                                                                                                                                                                          |
| **First useful version**  | A local script over a `linear` JSON export + the markdown files, printing a drift table to stdout. No write-back, no scheduler.                                                                                                                                                                                                                                                                                                               |

### FS-2 · PR review criteria are implicit ⭐ _chosen — see Krok 3_

| Field                     | Answer                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Friction signal**       | Review blocks merge because quality criteria are tacit; nothing flags _which_ PR touches load-bearing security (RLS, answer-key, `prerender`) or known gotchas.                                                                                                                                                                                                                                                      |
| **SaaS / default answer** | CODEOWNERS, required status checks, GitHub Copilot PR review, Linear Triage Intelligence all exist and overlap. **But** none of them know _this repo's_ tripwires (`AGENTS.md` / `lessons.md`): "new `CREATE TABLE` without `ENABLE ROW LEVEL SECURITY`", "a `"use client"` directive in an Astro repo", "`SRS_CARD_COLUMNS` turned into a `.join()`". That local rule-set is the gap a generic reviewer can't fill. |
| **Thin helper**           | A PR-risk classifier: read the diff, match it against the repo's own tripwire list, and post a short risk label + which tripwires to check + a suggested reviewer. **Complements** `/code-review ultra` (cheap pre-filter), does not replace it.                                                                                                                                                                     |
| **First useful version**  | An agent comment on **3–5 sample PRs** (historical, replayed locally): "Risk: HIGH — adds a migration with a new table; confirm RLS enabled + policies (`AGENTS.md` rule 1). Touches `srs.ts`: confirm `SRS_CARD_COLUMNS` stays a string literal (`lessons.md`)." Markdown only.                                                                                                                                     |

### FS-3 · AI artifacts copied by hand

| Field                     | Answer                                                                                                                                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Friction signal**       | Skills, rules, and conventions are per-repo; an improvement in one repo doesn't reach the others.                                                                                                                                                                     |
| **SaaS / default answer** | Internal wiki, an npm/private registry, git submodules, or the emerging skills-distribution ecosystem. **Honest counter:** at **solo + single-repo** scale, manual copy is genuinely fine — this only earns a helper once there's a 2nd active repo. Don't build yet. |
| **Thin helper**           | One versioned source of truth for AI artifacts (a `skills/` package with a manifest + version list), installed into a repo rather than copy-pasted.                                                                                                                   |
| **First useful version**  | A git repo holding the artifacts + a manifest, manually installed into one project. (This is the **M5L4 _Shared AI Registry_** project — parked here, qualified for later.)                                                                                           |

> **Status (M5L4, 2026-06-16):** built as **Champion proof #2** —
> `@lukasz-rdzanek/unstuck-ai-toolkit` published to GitHub Packages v0.1.0
> (`tools/ai-toolkit/`, decision in `ai-distribution.md`). The original "defer at solo
> scale" call still holds on pure _utility_ grounds — built for the certification goal,
> not because the friction yet demanded it; real payoff arrives with a 2nd repo.

### FS-4 · "What changed since yesterday" is scattered

| Field                     | Answer                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Friction signal**       | Reconstructing recent state requires opening 5+ tools/folders every session.                                                                                                                     |
| **SaaS / default answer** | GitHub notifications + Linear views + the CI dashboard each cover a slice. None _join_ git history + archive folders + Linear + CI + deploy status into one read.                                |
| **Thin helper**           | A read-only morning digest joining: merged-since-X commits, newly-archived changes, open Linear items, last CI result, last Cloudflare deploy. Links to sources; decides nothing.                |
| **First useful version**  | A static Markdown report generated from `git log`, `ls context/archive`, a Linear export, and the last CI run — printed once, by hand. (This is the lesson's flagship "morning digest" example.) |

### FS-5 · Release-readiness needs ≥3 checks

| Field                     | Answer                                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Friction signal**       | "Safe to merge?" = CI green + migration applied (manual!) + invariants verified, with no single view.                                                                                                                                                        |
| **SaaS / default answer** | Branch protection + required status checks cover _CI green_ (already documented in `ai-pr-pipeline`). They do **not** cover the out-of-band Supabase `migration up` step or the RLS/answer-key invariants — those are this project's specific, non-CI gates. |
| **Thin helper**           | A pre-merge checklist generator: from the PR diff, detect "contains a migration" / "touches RLS-relevant SQL" and emit the exact manual steps to run before merge. Overlaps heavily with **FS-2** — best folded into the same PR helper.                     |
| **First useful version**  | Extend the FS-2 PR comment with a "before you merge" section when the diff includes `supabase/migrations/`.                                                                                                                                                  |

**Constraint acknowledged (the lesson's core discipline):** _I can build any one of
these, but not all of them._ FS-3 is explicitly **deferred** (solo scale → manual
copy is fine until a 2nd repo exists). FS-1 may be better solved by **removing
duplication** than by tooling. FS-4 and FS-5 are real but **fold into FS-2**
(FS-5 is literally a section of the FS-2 PR comment; FS-4 is the same "read-only
join + link to source" pattern). That leaves **one** helper worth building first.

---

## Krok 3 — The chosen helper

**Chosen signal: FS-2 — the PR risk-triage + review-criteria helper.**

**Why this one** (against the lesson's three selection tests):

1. **Recurs regularly** — every PR; and the project just moved commit-straight-to-master → a PR flow (`ai-pr-pipeline`), so PR volume is now real.
2. **Connects ≥2 sources / ≥2 roles** — joins the **GitHub PR diff** + the repo's **own tripwire rules** (`AGENTS.md`/`lessons.md`) + **CI status**, across the **author** and **reviewer/AI-gate** roles.
3. **Validatable without a product** — a Markdown comment on a handful of sample PRs proves or kills the value with zero infra.

It is also the **strongest Champion thread**: M5L2 (_Twój pierwszy Agent
zespołowy_) and M5L3 (_Code Review w erze AI_) build exactly this — the CI/CD
code-review pipeline that is one of the two 10xChampion proof projects. Qualifying
it here makes the whole module one arc: **M5L1 qualifies → M5L2/L3 build → Champion
evidence.** And it _complements_ rather than replaces: it never becomes the source
of truth, it points the reviewer at the diff, the rule, and the CI run.

### First useful version (lesson format)

```text
Helper:
PR Risk Triage (read-only review pre-filter for Unstuck)

Czyta / Reads:
- the PR diff (changed files + hunks) via GitHub API or a local `git diff`
- the repo's own tripwire rules: AGENTS.md ("Key conventions") + context/foundation/lessons.md
- CI status for the PR's head SHA (green/red)
- (when present) supabase/migrations/* in the diff

Zwraca / Returns:
- a single PR comment: a risk label (LOW / MED / HIGH) + a 1-line reason,
  the specific tripwires to verify (e.g. "new CREATE TABLE → confirm RLS
  enabled + per-op policies"; "touches srs.ts → SRS_CARD_COLUMNS must stay a
  string literal"), a suggested reviewer, and — if the diff adds a migration —
  a "before you merge: run supabase migration up against prod" section (folds in FS-5).
- links back to the diff, the rule, and the CI run. It decides nothing.

Nie robi / Does NOT (deliberately, for now):
- does not replace /code-review ultra (it's the cheap pre-filter that says
  WHETHER to spend the billed deep review)
- does not block/merge, does not write to Linear, has no DB, no admin panel,
  no login, no deployment
- does not become a source of truth — every line links to GitHub/Supabase/CI

Ryzyko danych / Data risk:
- LOW. First version runs on read-only signals: public-to-me repo metadata, the
  diff, and local markdown rules. No customer data, no production secrets in the
  helper. If/when it runs in CI it needs only a read-scoped GitHub token + (for
  the optional automated LLM step) an API key with cost — deferred past v1.
```

**Next move after this map** (per the lesson's routing): FS-2 is a _narrow signal
with a clear first version_ → go straight to build in the next lessons
(`/10x-new → /10x-research → /10x-plan → /10x-implement`), **after** the cheapest
validation step — see [`mom-test.md`](./mom-test.md). The cheapest pre-build step
(the lesson's "talk to your manager/team first") is, for a solo project, replaced
by: replay it on real past PRs and check it would have caught a real defect.

> **Status (M5L2, 2026-06-15):** first useful version **built + verified** in
> `tools/code-review-agent/` (Claude Agent SDK primary + Vercel AI SDK alt, shared
> schema, repo-tripwire injection). The replay test passed: on a seeded diff it
> caught all 6 tripwires and returned `verdict: fail`.
>
> **Status (M5L3, 2026-06-15):** promoted to a **CI/CD pipeline** (`ci-cd-code-review`):
> GitHub Actions workflow + composite action + `review-ci.ts` (PR comment + `ai-cr:*`
> labels), promptfoo model-comparison evals, optional agency ladder. The
> document-only AI-PR-pipeline now has a real, automated review step — the Champion
> proof. Only the credential-gated live run remains (repo secret + a PR).

---

## Krok 4 — What the 10xChampion path expects (and where this lands)

Module 5 is **optional** relative to the base Builder certificate (Modules 1–3).
The **10xChampion** badge needs **one** of two M5 projects, with evidence captured
as screenshots (no public company repo required):

1. **CI/CD code-review pipeline** — built across M5L2 + M5L3. Evidence: the
   pipeline view + ≥1 visible job, pipeline/job logs, and a screenshot of an
   LLM review comment on a real PR.
2. **Shared AI artifacts registry** — built in M5L4. Evidence: the repo/registry,
   a package/artifact definition, and a list of released versions.

**Where Unstuck stands** (from [`certification.md`](./certification.md), 2026-06-07):
all three Champion _pieces_ are already **addressed** — test-in-CI ✅, CD ✅
(auto-deploy to Cloudflare on merge), and a documented AI-assisted PR pipeline ✅
(`ai-pr-pipeline`: PR template + `CONTRIBUTING.md` + `/code-review ultra` gate,
enforcement document-only). So the gap to a _defensible Champion submission_ is
**not** more pieces — it is **turning the documented pipeline into demonstrable,
screenshot-able evidence**:

- The **FS-2 helper** chosen above _is_ the concrete artifact that converts the
  document-only pipeline into project #1's evidence: an actual automated/agentic
  review step that leaves a visible comment + logs on a real PR.
- This lesson's deliverable (this map + `mom-test.md`) is the M5L1 practical-task
  proof and the qualification note that justifies building it.

**This lesson's checklist:** Krok 1 ✅ (5 signals), Krok 2 ✅ (map filled, SaaS
column answered honestly incl. two "don't build" calls), Krok 3 ✅ (one helper +
first-version spec), optional `/10x-mom-test` ✅ → [`mom-test.md`](./mom-test.md),
Krok 4 ✅ (this section).
