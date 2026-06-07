# Unstuck — 10xDevs 3.0 Certification Assessment

> **Goal: 🏆 10xChampion** (Builder + Architect + Champion).
> Assessed: 2026-06-07 · Project phase: **beta-complete → testing** (see `roadmap.md`).
> Prod: https://unstuck.lukasz-rdzanek.workers.dev · Supabase `rhcioqeawpbuylbmkxnr` · Worker `88f7e67b`.

## TL;DR — where we stand

| Pillar | Verdict | Distance |
| --- | --- | --- |
| 🚀 **10xBuilder** (mandatory) | **1 blocking gap** — everything met/exceeded except *automated tests* | **Very close** — one test + a CI test step away |
| 🔧 **10xArchitect** (ambitious) | **Strongly demonstrated** — iterative architecture, refactor/supersession, AI-at-scale, lessons register | **Essentially there**; package the evidence |
| 🏆 **10xChampion** (ambitious) | **Furthest** — needs CI/CD maturity (tests-in-pipeline + automated deploy/CD + AI-in-team-workflow) | **In reach** once Builder's test gap closes and CI/CD grows |

**One thing blocks all three badges: there are no automated tests.** It's the single mandatory Builder item missing, and it's also the foundation of the Champion CI/CD story. Close that first.

---

## "Good vs bad project" self-rating (from the criteria table)

| Criterion | Bar | Unstuck | Verdict |
| --- | --- | --- | --- |
| **User** | Know who uses it & why | Self-taught learner who hits a blocker mid-lesson | ✅ Good |
| **Problem** | One concrete pain | Get unblocked *without leaving the lesson page* | ✅ Good |
| **MVP** | 1–2 key flows | North star S-02: post + read lesson-scoped chat, live | ✅ Good |
| **Data** | Emerges from the domain | courses → chapters → lessons → messages; tests/questions/options/attempts; SRS state; completions | ✅ Good |
| **Business logic** | App makes a domain decision | FSRS spaced-repetition scheduling, semantic answer-matching, all-or-nothing quiz grading, seed-boosted ranking | ✅✅ Strong |
| **Stack** | Known, well-documented | Astro 6 + React 19 + Tailwind 4 + Supabase + Cloudflare Workers | ✅ Good |
| **Test** | Can sensibly test the main flow | The main flows are very testable — **but no automated test exists yet** | ❌ **Gap** (testable, untested) |
| **CI/CD** | Build + tests run automatically | `ci.yml` runs lint + build on every push/PR automatically; **no test step; deploy is manual** | 🟡 Partial |

7 / 8 criteria land in "good project". The **Test** row is the one real gap; **CI/CD** is partial (build/quality automated, tests not yet).

---

## 🚀 10xBuilder — mandatory checklist

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Access control for the app type (e.g. login) | ✅✅ Exceeds | `src/lib/supabase.ts` (SSR auth), `src/middleware.ts` (route gating), `src/pages/auth/{signin,signup,confirm-email}.astro`, RLS on every table (`supabase/migrations/…_lesson_chat_rls.sql`) |
| 2 | CRUD sensible for the domain | ✅✅ Exceeds | Courses/chapters/lessons/messages/tests/attempts/completions/SRS — `supabase/migrations/`, `src/lib/services/*` |
| 3 | Business logic (AI optional) | ✅✅ Exceeds | FSRS (`src/lib/srs.ts`), semantic match (`match_lesson_answers` + Workers AI embeddings, `src/lib/embeddings.ts`), grading (`submit_test_attempt`) |
| 4 | Context docs (prd/infrastructure/roadmap) | ✅✅ Exceeds | `context/foundation/{prd,infrastructure,roadmap,tech-stack,shape-notes,lessons}.md` |
| 5 | **≥1 test from the user's perspective** | ❌ **MISSING** | No runner (no vitest/playwright), no `*.test/*.spec`, no `test` script, no test deps. `supabase/tests/rls_matrix.sql` is a **manual** probe, not automated |
| 6 | CI/CD — automated build + quality check | 🟡 Partial | `.github/workflows/ci.yml`: `npm ci → astro sync → lint → build` on push/PR. Automated quality (lint+build) ✅; **no test stage**; deploy is manual (`wrangler deploy`) |
| ⭐ | (Optional) public URL / store / installable | ✅ | Live on Cloudflare Workers |

**Builder verdict:** all six are met or exceeded **except #5 (tests)**. #6 is satisfied for "build + quality" but will need a test stage once #5 lands. Closing #5 makes Builder solidly complete.

**Wyróżnienie note:** Unstuck is a *custom* project (not 10xCards), so the custom-project distinction path applies — it needs **all mandatory requirements** by the 1st deadline (**5.07.2026**); public URL is optional for custom but we already have it. The blocker for wyróżnienie is the same: the test (#5).

---

## 🔧 10xArchitect — architecture, modernization, refactoring, AI at scale

**Strongly demonstrated already** — this is arguably the project's biggest strength:

- **Iterative architecture via the 10x workflow**: every change ran plan → implement → impl-review → archive, with a `## Progress` contract and SHA-stamped phases. See `context/archive/` (8+ archived changes) and `reviews/impl-review.md` in each.
- **Refactor / supersession at the architecture level**: the `spaced-repetition-review` FSRS engine was kept and **re-pointed** onto quiz questions by `learning-loop`; `ai-answer-matching` **extends** the v1 curated-seeding rule into v2 semantic matching — reuse, not rewrite.
- **AI at scale**: pgvector + Cloudflare Workers AI embeddings (`@cf/baai/bge-base-en-v1.5`) for semantic search over chat; FSRS-6 via `ts-fsrs`.
- **Load-bearing architecture invariants captured as rules**: `context/foundation/lessons.md` (answer-key protection: enable-not-force RLS + definer-owned functions); SECURITY DEFINER + `has_course_access` reuse pattern.
- **Deliberate tech selection with research**: `tech-stack.md`, deep-research run for the SRS algorithm/library choice.

**Architect verdict:** essentially satisfied by the existing change history + context artifacts. Action = *package/point to the evidence* in the submission, not new build work.

---

## 🏆 10xChampion — AI in modern dev teams, CI/CD pipelines (Module 5)

**Furthest from done — this is the work to do for the Champion badge.** Current state vs the bar:

- **CI**: ✅ automated lint + build on push/PR. ❌ no automated tests in the pipeline.
- **CD**: ❌ deploys are **manual** (`wrangler deploy` + the `.dev.vars`-aside ritual). No automated deploy on merge.
- **Team workflow / AI-in-pipeline**: 🟡 AI is heavily used in *development* (10x skills, Exa/Context7 research, AI impl-reviews) but not yet wired into the **team CI/CD pipeline** (e.g. AI code review on PRs, automated quality gates, branch-protection + PR flow).

**Champion gap list:**
1. A **test stage in CI** (depends on Builder #5).
2. **Automated deploy (CD)** to Cloudflare on merge to `master` (move the manual ritual into a GitHub Action with secrets).
3. **AI-assisted team pipeline** evidence — e.g. AI code review on PRs (the course's `/code-review ultra`), PR-based flow with branch protection, or an AI quality gate in CI.

---

## Path to Champion (recommended order)

1. **Close Builder #5 — add ≥1 user-perspective automated test.**
   - Pick a runner that fits the stack: **Vitest** for unit/integration (e.g. FSRS scheduling, quiz grading set-logic, the match candidate-filter), and/or **Playwright** for an end-to-end user flow (sign in → open lesson → post chat → see it; or take a test → see score).
   - At minimum one e2e "main flow" test satisfies the letter of the requirement; a small Vitest suite over the domain logic strengthens it.
2. **Add a test stage to `ci.yml`** (`npm run test`) so build + tests run automatically → upgrades CI/CD from 🟡 to ✅ and feeds the Champion story.
3. **Automate deploy (CD)** — a GitHub Action that builds with prod env + `wrangler deploy` on merge to `master` (store `CLOUDFLARE_API_TOKEN`, account id, Supabase prod vars as repo secrets). Folds the manual ritual into the pipeline.
4. **AI-in-team-workflow** — adopt PR-based flow + an AI review gate (e.g. `/code-review ultra` on the branch/PR) and document it; this is the distinctly *Champion* (Module 5) piece.
5. **Package Architect evidence** — the archives, lessons, impl-reviews, and refactor/supersession story are the Architect submission; point to them.

**Carry-forward (independent of certification):** operator prod backfill for ai-answer-matching; the gated-course `## Blocked` cluster.

---

## Bottom line

Unstuck already **exceeds** the Builder bar on 5 of 6 mandatory items and the optional public-URL, and has a **strong Architect** story baked into its history. The **single highest-leverage move** — one that unlocks Builder completion *and* opens the Champion CI/CD track — is **adding automated tests + a CI test stage**. After that, automated deploy and an AI-assisted PR pipeline complete the Champion picture. We are well-positioned to aim for all three badges.
