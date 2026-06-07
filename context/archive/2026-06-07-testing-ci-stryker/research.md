---
date: 2026-06-07T17:10:00+02:00
researcher: Lukasz Rdzanek
git_commit: ef3b35e5be46e5a4e5e1fc38f9f212e1eaf05ce3
branch: master
repository: Unstuck
topic: "CI integration + Stryker mutation testing (test-plan Phase 4): run the integration suite in CI + a selective Stryker gate, without breaking green CI/auto-deploy"
tags: [research, ci, github-actions, supabase, stryker, mutation-testing, vitest]
status: complete
last_updated: 2026-06-07
last_updated_by: Lukasz Rdzanek
---

# Research: CI integration + Stryker mutation testing (test-plan Phase 4)

**Date**: 2026-06-07T17:10:00+02:00
**Researcher**: Lukasz Rdzanek
**Git Commit**: ef3b35e5be46e5a4e5e1fc38f9f212e1eaf05ce3
**Branch**: master
**Repository**: Unstuck

## Research Question

Ground rollout **Phase 4 (final)** of `context/foundation/test-plan.md` (change `testing-ci-stryker`): wire the Phase-1/2 **integration suite** into CI (needs Supabase in GitHub Actions) and add **Stryker** mutation testing as a selective gate — the quality gate over R1–R7 — **without breaking the existing green CI or the auto-deploy job**. Plus the carry-in F4 follow-up (backfill null-guard).

## Summary

Both halves have clean, low-risk solutions that **extend** the existing `ci.yml` rather than rebuild it (Module-1/2-L5 boundary respected), and neither touches the `deploy` job's gate.

- **CI integration** → add a **separate `integration` job** using `supabase/setup-cli@v2` + `supabase start` + `npm run test:integration`. This is the high-fidelity match to local dev: `supabase start` boots the full stack (Postgres 17 + GoTrue + PostgREST), applies `supabase/migrations/*` + `supabase/seed.sql`, and the harness self-discovers URL + **built-in demo keys** via `npx supabase status -o json` — **no new repo secret**, no `astro sync`/CF tokens (it doesn't build). The bare `postgres:17` service-container alternative is **rejected** — it has no GoTrue/PostgREST/admin-API/`supabase status`, so it'd force a harness rewrite and test SQL-against-Postgres instead of RLS-via-the-real-API (defeating R1/R2/R4). **Recommended placement: PR-triggered (+ `workflow_dispatch`), NOT in `deploy`'s `needs`** — satisfies "the new tests run in CI" while a heavy/flaky Docker run can never gate or slow prod deploy (per CLAUDE.md's "the integration gate can stay ad-hoc when infra is expensive"). Cost: the Supabase Docker image pull (~minutes; not cached by default on GitHub-hosted runners).
- **Stryker** → `@stryker-mutator/core@^9.6.1` + `@stryker-mutator/vitest-runner@^9.6.1` (9.6.1 is the **minimum** for correct coverage on Vitest 4.1). The load-bearing trap is the two-`projects` vitest config: point Stryker at a **dedicated unit-only config** (`vitest.stryker.config.ts`, no `projects`/`globalSetup`, reusing the `@`/`cloudflare:workers` alias block) so a mutation run never boots Supabase. `mutate: []` in config, driven by `--mutate` CLI (narrow scope); conscious thresholds (high 80 / low 60 / break 50); HTML + clear-text reporters. **NOT in CI** — selective gate per CLAUDE.md. First target: **`src/lib/safe-next.ts`** (pure, security-relevant, already well-covered → informative score); second: `src/lib/srs.ts`.
- **F4 carry-in** → `src/pages/api/embeddings/backfill.ts:63` iterates `pending` with no `?? []` (line 83 already guards `rest`). One-line fix `const pending = data ?? [];` + one hermetic test (list RPC `{data:null,error:null}` → 200, embedded 0, no throw). Small, hermetic, in-scope.

## Detailed Findings

### CI integration — Supabase in GitHub Actions

Existing [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml): one `ci` job (checkout → setup-node 22 +npm cache → `npm ci` → `npx astro sync` [CF tokens] → `npm run lint` → `npm run test` [unit] → `npm run build` [prod SUPABASE_* + CF tokens]); `deploy` job `needs:[ci]`, `if: push && master`, does build + leak-check + `wrangler deploy`; global `concurrency` cancel-in-progress.

- **The harness contract CI must satisfy** ([`tests/integration/setup/supabase-env.ts`](../../../tests/integration/setup/supabase-env.ts), [`global-setup.ts`](../../../tests/integration/setup/global-setup.ts)): shells `npx supabase status -o json` for `{API_URL, ANON_KEY, SERVICE_ROLE_KEY}` then probes `${url}/auth/v1/health`. So CI needs the `supabase` CLI on PATH **and the full stack up** (not just Postgres — the health check is GoTrue and tests use the GoTrue→PostgREST JWT path). `supabase` is a devDep (`^2.x`), so `npx supabase` resolves post-`npm ci`; `supabase/setup-cli@v2` with no `version` reads it from the lockfile.
- **Recommended job** (extend ci.yml; concrete shape from the agent):
  ```yaml
  integration:
    runs-on: ubuntu-latest
    # PR gate (+ manual). Deliberately NOT in deploy.needs — a Docker-based run
    # must never gate/slow/flake prod deploy (CLAUDE.md: integration gate may be ad-hoc).
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - uses: supabase/setup-cli@v2     # version from package-lock.json
      - run: supabase start             # applies migrations + seed.sql; demo keys
      - run: npm run test:integration   # harness self-discovers via `supabase status -o json`
      - if: failure()
        run: supabase status || true
  ```
- **No new secret**: `supabase start` uses built-in demo anon/service keys; the build job's `SUPABASE_URL/KEY` are the *prod* client bundle creds — irrelevant here. **No CF tokens / no `astro sync`** in this job (it never builds; adding them would needlessly fail).
- **Cost**: the Supabase image pull dominates (~minutes, not cached by default). Optional `supabase start -x <services>` to exclude studio/inbucket/imgproxy/etc. is a tuning lever, not day-1.
- **Placement decision (cost×signal)**: a **separate PR-triggered job + `workflow_dispatch`, not in `deploy.needs`** is the recommendation. PR-trigger gates the change before merge (push-to-master already auto-deploys, so gating belongs on the PR); a separate job isolates the Docker cost/flake from the fast `ci` job and from deploy; `workflow_dispatch` is the explicit ad-hoc escape hatch CLAUDE.md sanctions. Alternatives: a step inside `ci` (rejected — serializes the pull in front of lint/build and could block deploy) or fully ad-hoc/manual only (weaker — doesn't auto-gate PRs).

### Stryker mutation testing (Vitest)

- **Packages** (dated 2026-06-07; Stryker latest 9.6.1): `@stryker-mutator/core@^9.6.1` + `@stryker-mutator/vitest-runner@^9.6.1` as devDeps. **9.6.1 is the floor** — the vitest-runner fix for Vitest 4.1 hit-count/coverage (PR #5928) is required since the repo runs `vitest ^4.1.8`; older majors mis-score. No `typescript-checker` needed (Vite/esbuild transpiles; the checker adds a slow per-mutant `tsc` — skip for v1).
- **The two-project trap** ([`vitest.config.ts`](../../../vitest.config.ts)): the runner loads `vitest.config.ts` by default, whose `integration` project has a `globalSetup` that boots Supabase. **Mitigation (Option A, recommended): a dedicated `vitest.stryker.config.ts`** with a single top-level test config (NO `projects`, NO `globalSetup`) that **reuses the exact `resolve.alias`** (`@`→`./src`, `cloudflare:workers`→the stub). Point Stryker at it via `vitest.configFile`.
- **Minimal `stryker.conf.json`**: `testRunner: "vitest"`, `plugins: ["@stryker-mutator/vitest-runner"]`, `vitest: { configFile: "vitest.stryker.config.ts", related: true }`, `mutate: []` (empty → driven entirely by `--mutate` CLI, so a run never mutates the whole repo by accident), `concurrency: 2`, `reporters: ["html","clear-text","progress"]`, `thresholds: { high: 80, low: 60, break: 50 }` (conscious, not 100), html report under `reports/mutation/`.
- **Script + workflow**: `"test:mutation": "stryker run"`. Selective use (matches CLAUDE.md §"Mutation testing"): after a risk phase is green, `npx stryker run --mutate "src/lib/safe-next.ts"` → open the HTML report → kill survivors that matter, ignore equivalent/cosmetic ones → don't chase 100%. **Stays OUT of ci.yml.**
- **First target `src/lib/safe-next.ts`** (`isSafeNext`): pure, security-relevant (open-redirect guard), and already well-covered by `safe-next.test.ts` → survivors are real test gaps, not untested code. Second target `src/lib/srs.ts` (pure FSRS; `srs.test.ts` asserts only coarse properties, so expect more — actionable — survivors). Avoid route handlers first (they pull the fake-supabase harness + virtual modules; slower, harder to attribute).
- **Gotchas**: replicate the `resolve.alias` in the Stryker config (mandatory the moment a target's import graph touches `@/` or `cloudflare:workers`; `safe-next.ts`/`srs.ts` themselves don't, so the first targets are clean); do NOT add an `astro:env` alias (keep targets off `src/lib/supabase.ts`); `.gitignore` needs `.stryker-tmp/` (+ `reports/`); `npx astro sync` recommended as a consistency pre-step (not strictly required for the esbuild run).

### F4 carry-in — backfill null-guard

- [`src/pages/api/embeddings/backfill.ts:63`](../../../src/pages/api/embeddings/backfill.ts) `for (const row of pending)` — `pending` is the `list_unembedded_messages` `data`, unguarded; line 83 already uses `const remaining = (rest ?? []).length`. On a `{data:null,error:null}` the loop throws.
- **Fix**: `const pending = data ?? [];` after the list-error guard. **Test** (hermetic, route-contracts or backfill.test.ts): list RPC returns `{data:null,error:null}` → assert 200, `embedded:0`, no throw. Small production-hardening + 1 test; in-scope for Phase 4 (decide fold-in vs note in planning).

### CI-gating facts (so a new job doesn't break deploy)

- `deploy` is `needs:[ci]` + `if: push && master`. A new `integration` job **not** in `needs` leaves deploy unaffected; adding it to `needs:[ci, integration]` would make deploy wait on it (not recommended).
- `concurrency` cancel-in-progress is workflow-global → a re-pushed PR cancels the prior in-flight integration run (good).
- Secrets referenced: `CLOUDFLARE_API_TOKEN/ACCOUNT_ID`, `SUPABASE_URL/KEY` — none needed by the integration job.
- No existing Stryker config/deps/`.stryker-tmp`. `.gitignore` currently has `dist/`, `node_modules/`, `.astro/`, `test-results/`, `playwright-report/` — add `.stryker-tmp/` (+ `reports/`).

## Code References

- `.github/workflows/ci.yml` — extend with the `integration` job; `deploy` gate untouched.
- `tests/integration/setup/supabase-env.ts`, `global-setup.ts` — the `supabase status` + GoTrue-health contract CI must satisfy.
- `supabase/config.toml` (ports 54321/54322, major_version 17, seed `./seed.sql`), `supabase/migrations/`, `supabase/seed.sql` — applied by `supabase start`.
- `vitest.config.ts` — the two-project config; the Stryker config must avoid the `integration` project.
- `src/lib/safe-next.ts` (+ test) — first Stryker target; `src/lib/srs.ts` (+ test) — second.
- `src/pages/api/embeddings/backfill.ts:63,83` — the F4 null-guard.
- `package.json` — scripts (`test`/`test:integration`), `supabase` devDep; add Stryker devDeps + `test:mutation`.
- `CLAUDE.md` — §"Mutation testing (Stryker) — selective quality gate" (lines ~87–98) + "integration gate can stay ad hoc … Mark it … in test-plan.md §4" (line ~100).

## Architecture Insights

- **Two different gate philosophies in one phase.** The integration suite is a *real-infra* gate → isolate it (separate job, PR-only, off the deploy path) so its cost/flake never touches the fast `ci`→`deploy` contract. Stryker is a *selective local* gate → never in CI; its job is to prove the Phase 1–3 tests would catch a real break, run narrowly after a phase.
- **High-fidelity over cheap.** `supabase start` (full stack) is chosen over a Postgres service container precisely because the risks under test (R1/R2/R4) are about RLS *through the real GoTrue→PostgREST path* — a bare DB would test the wrong thing and force a harness rewrite.
- **Extend, don't rebuild.** Both deliverables are additive to the existing ci.yml + package.json; the deploy job, leak-check, and auto-deploy-on-green contract are left intact (CLAUDE.md: authoring CI/CD from scratch is a different lesson).
- **The vitest-projects split is the recurring gotcha** — it bit Phase 3 (astro:env) and bites Stryker here. The fix is the same family: keep the infra-bound `integration` project out of the hermetic path (there via `vi.mock`; here via a unit-only Stryker config).

## Historical Context (from prior changes)

- `context/archive/2026-06-07-testing-access-control-rls/` + `…-testing-grading-srs-integration/` — the integration suite this phase puts in CI (the `npm run test:integration` harness + `supabase start` dependency).
- `context/archive/2026-06-07-testing-hermetic-service-api/` — Phase 3; the hermetic unit run already in CI, and the **F4 follow-up** (`follow-ups/review-fixes.md`) carried in here.
- `context/archive/2026-06-07-testing-baseline/` / `auto-deploy` / `ai-pr-pipeline` — the existing `ci.yml` + deploy job + CF/Supabase secrets this phase extends.
- `context/foundation/lessons.md` — answer-key invariant (now CI-gated via the integration job); [[feedback-no-db-reset]] (CI uses a fresh `supabase start`, not a reset of a persistent DB — n/a but aligned).

## Related Research

- `context/archive/2026-06-07-testing-access-control-rls/research.md` — the harness + `supabase status` discovery this CI job depends on.
- `context/foundation/test-plan.md` §3 Phase 4, §4 ("Integration tests are NOT in CI yet → Phase 4 wires them"), §6 cookbook.
- `CLAUDE.md` — the mutation-testing + ad-hoc-integration-gate rules cited above.

## Open Questions

1. **Integration CI placement** (for `/10x-plan`): confirm the recommendation — a separate `integration` job, **PR-triggered + `workflow_dispatch`, not in `deploy.needs`**. (Alt: also-on-push, or step-in-ci, or ad-hoc-only.) The recommendation maximizes signal while protecting deploy.
2. **Stryker scope for this phase**: scaffold the config + run `safe-next` as the demonstrated target and document the workflow (minimal), vs also harden `srs.ts`'s assertions from its survivors (more work, real signal). Likely: scaffold + safe-next demo in this phase; srs hardening optional.
3. **F4 fold-in**: include the backfill `?? []` guard + test in this phase (small, hermetic) vs leave as a separate change. Likely fold in — it's a one-liner and closes the archived follow-up.
4. **Image-pull cost mitigation**: ship the plain `supabase start` first; add `-x` service excludes only if CI time/flake warrants (note, don't pre-optimize).
