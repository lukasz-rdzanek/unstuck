# Unstuck — 10xDevs 3.0 Certification Assessment

> **Goal: 🏆 10xChampion** (Builder + Architect + Champion).
> Assessed: 2026-06-07 · Project phase: **beta-complete → testing** (see `roadmap.md`).
> Prod: https://unstuck.lukasz-rdzanek.workers.dev · Supabase `rhcioqeawpbuylbmkxnr` · Worker `88f7e67b`.

## TL;DR — where we stand

| Pillar                          | Verdict                                                                                                                       | Distance                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 🚀 **10xBuilder** (mandatory)   | **All mandatory items met** — incl. automated tests (Vitest + Playwright) running in CI as of `testing-baseline` (2026-06-07) | **Complete**                                                                                  |
| 🔧 **10xArchitect** (ambitious) | **Strongly demonstrated** — iterative architecture, refactor/supersession, AI-at-scale, lessons register                      | **Essentially there**; package the evidence                                                   |
| 🏆 **10xChampion** (ambitious)  | **All 3 pieces addressed** — test-in-CI ✅, CD ✅, AI-assisted PR pipeline ✅ (documented, self-enforced)                     | **There** — enforcement is document-only (private-free repo); flip on if repo goes public/Pro |

**Update (2026-06-07):** all three Champion pieces are in. `testing-baseline` → Builder test gap closed (Vitest 13 + Playwright e2e + `npm run test` in CI); `auto-deploy` → **CD** (`deploy` job auto-ships to Cloudflare on merge to master, gated on green CI + leak-check; first live deploy Worker `75b6d9cf`); `ai-pr-pipeline` → the **AI-assisted PR pipeline** (PR template + `CONTRIBUTING.md` documenting branch → PR → green CI → `/code-review ultra` + triage → merge → auto-deploy). Builder complete; Architect strongly evidenced; Champion addressed (enforcement document-only — branch protection needs the repo public or GitHub Pro).

---

## "Good vs bad project" self-rating (from the criteria table)

| Criterion          | Bar                             | Unstuck                                                                                                             | Verdict     |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------- |
| **User**           | Know who uses it & why          | Self-taught learner who hits a blocker mid-lesson                                                                   | ✅ Good     |
| **Problem**        | One concrete pain               | Get unblocked _without leaving the lesson page_                                                                     | ✅ Good     |
| **MVP**            | 1–2 key flows                   | North star S-02: post + read lesson-scoped chat, live                                                               | ✅ Good     |
| **Data**           | Emerges from the domain         | courses → chapters → lessons → messages; tests/questions/options/attempts; SRS state; completions                   | ✅ Good     |
| **Business logic** | App makes a domain decision     | FSRS spaced-repetition scheduling, semantic answer-matching, all-or-nothing quiz grading, seed-boosted ranking      | ✅✅ Strong |
| **Stack**          | Known, well-documented          | Astro 6 + React 19 + Tailwind 4 + Supabase + Cloudflare Workers                                                     | ✅ Good     |
| **Test**           | Can sensibly test the main flow | Vitest unit suite (13) + a Playwright e2e of the take-a-test flow                                                   | ✅ Good     |
| **CI/CD**          | Build + tests run automatically | `ci.yml` runs lint + **test** + build on every push/PR (green) **and auto-deploys to prod on merge to master** (CD) | ✅✅ Strong |

8 / 8 criteria land in "good project". CI/CD now runs build + tests automatically **and deploys automatically** on merge — the full pipeline.

---

## 🚀 10xBuilder — mandatory checklist

| #   | Requirement                                  | Status       | Evidence                                                                                                                                                                                     |
| --- | -------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Access control for the app type (e.g. login) | ✅✅ Exceeds | `src/lib/supabase.ts` (SSR auth), `src/middleware.ts` (route gating), `src/pages/auth/{signin,signup,confirm-email}.astro`, RLS on every table (`supabase/migrations/…_lesson_chat_rls.sql`) |
| 2   | CRUD sensible for the domain                 | ✅✅ Exceeds | Courses/chapters/lessons/messages/tests/attempts/completions/SRS — `supabase/migrations/`, `src/lib/services/*`                                                                              |
| 3   | Business logic (AI optional)                 | ✅✅ Exceeds | FSRS (`src/lib/srs.ts`), semantic match (`match_lesson_answers` + Workers AI embeddings, `src/lib/embeddings.ts`), grading (`submit_test_attempt`)                                           |
| 4   | Context docs (prd/infrastructure/roadmap)    | ✅✅ Exceeds | `context/foundation/{prd,infrastructure,roadmap,tech-stack,shape-notes,lessons}.md`                                                                                                          |
| 5   | **≥1 test from the user's perspective**      | ✅ Met       | Playwright e2e `e2e/test-taking.spec.ts` (sign in → take test → graded result) + Vitest unit suite `src/lib/*.test.ts` (13 tests). `npm run test` / `test:e2e`.                              |
| 6   | CI/CD — automated build + quality check      | ✅ Met       | `.github/workflows/ci.yml`: `npm ci → astro sync → lint → test → build` on push/PR, green. (Deploy still manual — CD is Champion-tier, not required here.)                                   |
| ⭐  | (Optional) public URL / store / installable  | ✅           | Live on Cloudflare Workers                                                                                                                                                                   |

**Builder verdict:** **all mandatory items met or exceeded** (incl. #5 tests + #6 build/test CI) plus the optional public URL. Builder is complete.

**Wyróżnienie note:** Unstuck is a _custom_ project (not 10xCards), so the custom-project distinction path applies — it needs **all mandatory requirements** by the 1st deadline (**5.07.2026**); public URL is optional for custom but we already have it. All mandatory items are now met, so the custom-project wyróżnienie path is open if submitted by the 1st deadline.

---

## 🔧 10xArchitect — architecture, modernization, refactoring, AI at scale

**Strongly demonstrated already** — this is arguably the project's biggest strength:

- **Iterative architecture via the 10x workflow**: every change ran plan → implement → impl-review → archive, with a `## Progress` contract and SHA-stamped phases. See `context/archive/` (8+ archived changes) and `reviews/impl-review.md` in each.
- **Refactor / supersession at the architecture level**: the `spaced-repetition-review` FSRS engine was kept and **re-pointed** onto quiz questions by `learning-loop`; `ai-answer-matching` **extends** the v1 curated-seeding rule into v2 semantic matching — reuse, not rewrite.
- **AI at scale**: pgvector + Cloudflare Workers AI embeddings (`@cf/baai/bge-base-en-v1.5`) for semantic search over chat; FSRS-6 via `ts-fsrs`.
- **Load-bearing architecture invariants captured as rules**: `context/foundation/lessons.md` (answer-key protection: enable-not-force RLS + definer-owned functions); SECURITY DEFINER + `has_course_access` reuse pattern.
- **Deliberate tech selection with research**: `tech-stack.md`, deep-research run for the SRS algorithm/library choice.

**Architect verdict:** essentially satisfied by the existing change history + context artifacts. Action = _package/point to the evidence_ in the submission, not new build work.

---

## 🏆 10xChampion — AI in modern dev teams, CI/CD pipelines (Module 5)

**Furthest from done — this is the work to do for the Champion badge.** Current state vs the bar:

- **CI**: ✅ automated lint + **test** + build on push/PR (green as of `testing-baseline`).
- **CD**: ✅ **automated deploy** to Cloudflare on merge to `master` (`auto-deploy`: `deploy` job gated on green CI, leak-check, `wrangler deploy`; cancel-in-progress). Migrations stay a deliberate manual pre-merge step.
- **Team workflow / AI-in-pipeline**: ✅ documented PR-based flow with an AI review gate (`ai-pr-pipeline`): `.github/pull_request_template.md` (quality checklist incl. the AI-review step) + `CONTRIBUTING.md` (branch → PR → green CI → `/code-review ultra` + triage → merge → auto-deploy). CI already runs on PRs; the deploy job is guarded off PRs. Enforcement is **document-only** (branch protection unavailable on the private-free repo).

**Champion gap list:**

1. ~~A test stage in CI~~ — ✅ done (`testing-baseline`).
2. ~~Automated deploy (CD)~~ — ✅ done (`auto-deploy`).
3. ~~AI-assisted team pipeline~~ — ✅ done (`ai-pr-pipeline`, document-only enforcement).

**Optional hardening** (not required for the badge): make the repo public (or GitHub Pro) to enable real branch protection (required CI check + required PR); add an automated LLM-review CI step; dogfood a real PR through `/code-review ultra`.

**Module 5 lesson work (2026-06-15 →):** M5L1 (_AI Internal Builders_) practical
tasks done — `opportunity-map.md` (5 friction signals qualified via buy/complement/build;
chosen helper = **PR Risk Triage**, the read-only review pre-filter that converts our
document-only AI-PR-pipeline into screenshot-able Champion evidence) + `mom-test.md`
(assumption critique + build/kill rule). The chosen helper is the M5L2/L3 build target
(CI/CD code-review pipeline = Champion proof project #1).

M5L2 (_Twój pierwszy Agent zespołowy_) **done + verified** — built `tools/code-review-agent/`,
a standalone package implementing the FS-2 helper twice: **Claude Agent SDK** (primary,
`review-claude.ts`) and **Vercel AI SDK 6 + OpenRouter** (`review-vercel.ts`), sharing
one zod schema (`common/review-schema.ts`) and injecting the repo's own tripwires
(`common/repo-rules.ts`). Verified end-to-end: the Claude agent (Sonnet 4.6, zero-key via
the Claude Code session) reviewed a seeded diff and caught all 6 planted tripwires
(RLS, `prerender=false`, `"use client"`, IDOR, manual class-concat, no tests),
returning schema-valid JSON with `verdict: fail` (exit 2). Cost $0.20 → $0.066 cached.
Evidence: `tools/code-review-agent/samples/sample-output.claude.json`. Lesson hint done:
`npx skills add vercel/ai` (→ `.agents/skills/ai-sdk`, `skills-lock.json`).

M5L3 (_Code Review w erze AI_) **built + locally verified** — the agent is now a CI/CD
pipeline (`change_id: ci-cd-code-review`). Added: composite action `.github/actions/ai-reviewer/`,
consumer workflow `.github/workflows/review.yml` (PR→master + manual; computes diff w/
`fetch-depth:0`; advisory Gate), `review-ci.ts` (env→`$GITHUB_OUTPUT` + PR comment + `ai-cr:*`
labels), the Claude Code Action alt (`claude-review.yml`, manual-only, SHA-pinned). All 4
tasks done: (1) `criteria.md` (6 criteria + anchors); (2) schema extended to 6 scores +
overall `score`, verified (`score:2`, `verdict:fail`); (3) promptfoo evals comparing 3 models
on 2 fixtures (SQL-injection, React16→19) — config validated; (4) optional agency ladder
(`review-agentic.ts` + `common/tools.ts`: readPlan/readReviewCriteria/postPrComment, step-capped).
Repo labels `ai-cr:passed|failed|review` created. **Credential-gated live run** (the only
remaining step for screenshots): add `ANTHROPIC_API_KEY` repo secret + push a branch/open a PR.

---

## Path to Champion (recommended order)

1. ~~**Close Builder #5** — add ≥1 user-perspective automated test.~~ ✅ **Done** (`testing-baseline`): Vitest unit suite + Playwright take-a-test e2e.
2. ~~**Add a test stage to `ci.yml`**~~ ✅ **Done** (`testing-baseline`): `npm run test` runs in CI; pipeline green.
3. ~~**Automate deploy (CD)**~~ ✅ **Done** (`auto-deploy`): `deploy` job auto-ships to Cloudflare on merge to master (gated on green CI + leak-check).
4. ~~**AI-in-team-workflow**~~ ✅ **Done** (`ai-pr-pipeline`): PR template + `CONTRIBUTING.md` documenting the PR flow + `/code-review ultra` gate (document-only enforcement).
5. **Package Architect evidence** — the archives, lessons, impl-reviews, and refactor/supersession story are the Architect submission; point to them. ← **the remaining work is packaging, not building**

**Carry-forward (independent of certification):** operator prod backfill for ai-answer-matching; the gated-course `## Blocked` cluster.

---

## Bottom line

**All three badges are now addressed.** Builder is complete (tests + CI, `testing-baseline`); CD is live (`auto-deploy` — full lint→test→build→deploy on merge); the AI-assisted PR pipeline is documented (`ai-pr-pipeline` — PR template + CONTRIBUTING + `/code-review ultra` gate, document-only enforcement). Architect is strongly evidenced by the change history (8+ archived changes, impl-reviews, refactors, lessons). Remaining work is **packaging the submission**, plus optional hardening (public repo → real branch protection; automated LLM-review in CI; dogfood a live PR).
