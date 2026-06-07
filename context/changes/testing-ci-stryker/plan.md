# CI integration + Stryker mutation testing (test-plan Phase 4) — Implementation Plan

## Overview

Wire the **quality gates** that close the test rollout (test-plan Phase 4), by **extending** the existing CI — not rebuilding it:

- **CI integration** — run the Phase-1/2 integration suite (`npm run test:integration`, RLS/answer-key/grading/match against a real Supabase) in GitHub Actions via a dedicated job, so R1–R5 regressions are caught on PRs.
- **Stryker mutation testing** — a *selective* (not per-commit) gate that proves the Phase 1–3 tests would actually fail if the code broke.
- **F4 carry-in** — the deferred `backfill.ts` list-RPC null-guard (one-line fix + one hermetic test).

This is test/CI infrastructure: no app behavior changes except the one-line backfill guard. The existing `deploy` job, leak-check, and auto-deploy-on-green contract are left intact.

## Current State Analysis

- **CI** ([`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml)): one `ci` job (npm ci → astro sync [CF tokens] → lint → `npm run test` [unit, hermetic] → build [prod SUPABASE_* + CF tokens]); `deploy` job `needs:[ci]`, `if: push && master`, build + leak-check + `wrangler deploy`; global `concurrency` cancel-in-progress. The hermetic unit run is already in CI; the integration suite is NOT.
- **Integration harness** ([`tests/integration/setup/supabase-env.ts`](../../../tests/integration/setup/supabase-env.ts), [`global-setup.ts`](../../../tests/integration/setup/global-setup.ts)): discovers `{url, anon, service_role}` from `npx supabase status -o json` + probes GoTrue health → CI must run the full stack (`supabase start`), which applies `supabase/migrations/*` + `supabase/seed.sql`. `supabase` is a devDep; built-in demo keys mean **no new secret**.
- **Vitest** ([`vitest.config.ts`](../../../vitest.config.ts)): two `projects` — `unit` (hermetic) + `integration` (boots Supabase via `globalSetup`). Stryker must avoid the `integration` project.
- **F4** ([`src/pages/api/embeddings/backfill.ts:63`](../../../src/pages/api/embeddings/backfill.ts)): `for (const row of pending)` is unguarded (line 83 already guards `rest` with `?? []`); a `{data:null,error:null}` list result throws.
- No Stryker config/deps yet. `.gitignore` lacks `.stryker-tmp/`/`reports/`. Full grounding: `context/changes/testing-ci-stryker/research.md`.

## Desired End State

- A green `integration` job runs the integration suite on PRs to master (and on demand via `workflow_dispatch`); `npm run test` (unit) + build still gate `ci`→`deploy` unchanged; deploy is never blocked by the integration job.
- `npx stryker run --mutate "<file>"` works against a unit-only config, produces an HTML report, and has a documented selective workflow + conscious threshold; demonstrated on `src/lib/safe-next.ts`.
- `backfill.ts` no longer throws on a null list result; a hermetic test pins it.
- test-plan §6 has a Phase-4 cookbook entry; §4 reflects the integration gate's CI posture; §3 Phase 4 = `complete` → **the rollout is done**.

### Key Discoveries:

- `supabase/setup-cli@v2` (version from the lockfile) + `supabase start` is the high-fidelity CI match; the bare-Postgres-container alt is rejected (no GoTrue/PostgREST → harness rewrite, defeats R1/R2/R4).
- Stryker needs `@stryker-mutator/core@^9.6.1` + `@stryker-mutator/vitest-runner@^9.6.1` (9.6.1 floor for Vitest 4.1 coverage), pointed at a unit-only `vitest.stryker.config.ts` that reuses the `@`/`cloudflare:workers` alias block.
- CI changes can't be fully exercised locally — verification is trust-the-proven-commands + observe on the first real PR.

## What We're NOT Doing

- Not rebuilding `ci.yml` / the deploy pipeline from scratch (that's Module-1/2-L5); we extend it. Not touching the `deploy` job, leak-check, or auto-deploy contract.
- Not adding the integration job to `deploy.needs` (a Docker flake must never wedge prod deploy).
- Not running integration on every push (PR-trigger + dispatch only; master pushes auto-deploy on the fast `ci` job).
- Not putting Stryker in CI (selective local gate per CLAUDE.md); not chasing 100% mutation score; not hardening `srs.ts` from its survivors in this phase (possible follow-up).
- No new repo secrets; no rewrite of the integration harness.

## Implementation Approach

Four independent phases, ordered headline-first (CI), then the local gate (Stryker), then the small production fix (F4), then close-out. Each is additive and independently committable. Because CI behavior can't be run locally, Phase 1's verification is YAML-validity + the already-proven underlying commands, with a manual "confirm on first PR" item; Phases 2–3 are verified by running them locally.

## Critical Implementation Details

- **Don't break green CI.** The `integration` job is ADDITIVE and scoped (`if: github.event_name == 'pull_request'` for the auto-run, plus `workflow_dispatch`); it is NOT in `deploy.needs`. Do not edit the `ci` or `deploy` jobs' steps. The integration job needs NO CF tokens and NO `astro sync` (it doesn't build) and NO secrets (local demo keys).
- **Stryker must not boot Supabase.** Point it at `vitest.stryker.config.ts` (a single top-level test config, NO `projects`, NO `globalSetup`) that reuses the exact `resolve.alias` from `vitest.config.ts`. Keep `mutate: []` in the config so only `--mutate <path>` drives scope.
- **Verification reality:** a CI-config change cannot be proven without a push. Phase 1 success = the YAML is valid + the commands it runs are the same ones already green locally (`supabase start`, `npm run test:integration`); the live CI run is a manual check on the first PR after this lands.

## Phase 1: CI integration job

### Overview

Add a dedicated `integration` job to the workflow that boots local Supabase and runs the integration suite on PRs.

### Changes Required:

#### 1. Add the integration job

**File**: `.github/workflows/ci.yml`

**Intent**: Run `npm run test:integration` against a real local Supabase stack on PRs to master (+ manual dispatch), isolated from the `ci`/`deploy` path so it can never block prod.

**Contract**: A new top-level job `integration` (sibling of `ci`): `runs-on: ubuntu-latest`; steps = checkout → setup-node 22 (npm cache) → `npm ci` → `supabase/setup-cli@v2` → `supabase start` → `npm run test:integration` → (`if: failure()`) `supabase status || true`. Gate the job to PRs + manual via `if: github.event_name == 'pull_request' || github.event_name == 'workflow_dispatch'`, and add `workflow_dispatch:` to the top-level `on:`. Do NOT add `integration` to `deploy.needs`; do NOT add CF tokens or secrets to this job. Leave `ci` and `deploy` unchanged.

### Success Criteria:

#### Automated Verification:

- Workflow YAML is valid (parses; e.g. `npx --yes @action-validator/cli ... ` or a YAML lint, or `python -c "import yaml,sys;yaml.safe_load(open('.github/workflows/ci.yml'))"`).
- The commands the job runs are green locally (already proven): `npm run test:integration` passes with the local stack up.
- `git diff` shows the `ci` and `deploy` jobs are byte-for-byte unchanged (only an added job + `workflow_dispatch`).

#### Manual Verification:

- On the first PR after this lands (or a manual `workflow_dispatch`), the `integration` job runs `supabase start` + the suite and goes green; `deploy` is unaffected by it.

**Implementation Note**: CI can't be fully exercised locally — pause for manual confirmation that the YAML + diff are correct before committing; the live-run check is the first-PR item above.

---

## Phase 2: Stryker scaffold + safe-next demo

### Overview

Add Stryker pointed at a unit-only config and demonstrate it on the open-redirect guard.

### Changes Required:

#### 1. Stryker deps + unit-only vitest config + config + script + gitignore

**File**: `package.json`, `vitest.stryker.config.ts` (new), `stryker.conf.json` (new), `.gitignore`

**Intent**: Make `npx stryker run --mutate "<file>"` work without booting Supabase, with a conscious threshold and HTML report, runnable selectively (never in CI).

**Contract**: devDeps `@stryker-mutator/core@^9.6.1` + `@stryker-mutator/vitest-runner@^9.6.1`. `vitest.stryker.config.ts`: a single top-level `test` config (node env, `include src/**/*.test.ts`, NO `projects`, NO `globalSetup`) reusing the `@`→`./src` + `cloudflare:workers`→stub `resolve.alias`. `stryker.conf.json`: `testRunner: "vitest"`, `plugins: ["@stryker-mutator/vitest-runner"]`, `vitest: { configFile: "vitest.stryker.config.ts" }`, `mutate: []`, `concurrency: 2`, `reporters: ["html","clear-text","progress"]`, `thresholds: { high: 80, low: 60, break: 50 }`, html report under `reports/mutation/`. `package.json` script `"test:mutation": "stryker run"`. `.gitignore` += `.stryker-tmp/` and `reports/`.

#### 2. Demonstrate on safe-next + kill meaningful survivors

**File**: `src/lib/safe-next.test.ts` (only if survivors warrant)

**Intent**: Run Stryker on the security-critical `isSafeNext` guard, record the score, and add an assertion for any survivor that represents a real regression (ignore equivalent/cosmetic ones).

**Contract**: `npx stryker run --mutate "src/lib/safe-next.ts"` runs green-enough against the threshold; for each survived mutant, decide kill (add an `it`/`it.each` case to `safe-next.test.ts`) vs ignore-consciously. Record the resulting mutation score + decisions for the §6 cookbook.

### Success Criteria:

#### Automated Verification:

- `npx stryker run --mutate "src/lib/safe-next.ts"` completes and emits `reports/mutation/index.html`.
- Unit run still green: `npm run test`; lint + type check pass.

#### Manual Verification:

- The mutation report was reviewed; survivors were triaged (killed or consciously ignored with a one-line reason); the score is recorded for §6.

**Implementation Note**: Pause for manual confirmation of the survivor triage before Phase 3.

---

## Phase 3: F4 backfill null-guard

### Overview

Close the archived F4 follow-up: guard the list-RPC iteration + pin it hermetically.

### Changes Required:

#### 1. Guard + test

**File**: `src/pages/api/embeddings/backfill.ts`, `src/pages/api/embeddings/backfill.test.ts`

**Intent**: Prevent a throw when `list_unembedded_messages` returns `{data:null,error:null}`; pin the behavior (treated as empty, not fatal).

**Contract**: in `backfill.ts`, derive `const pending = data ?? []` after the list-error guard (mirrors line 83's `rest ?? []`). Add a hermetic test: list RPC → `{data:null,error:null}` (operator user) → response `{ok:true, embedded:0, failed:0, remaining:0}`/200, no throw.

#### 2. Prove-it-fails (manual, reverted)

**Intent**: Confirm the new test catches the unguarded case.

**Contract**: temporarily revert the `?? []` guard → the new test throws/red → restore the guard → green.

### Success Criteria:

#### Automated Verification:

- Backfill tests pass: `npm run test -- backfill`.
- Full unit run green: `npm run test`; lint + type check pass.

#### Manual Verification:

- Prove-it-fails performed: removing the guard reds the new test; restoring it greens.

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Cookbook & close-out

### Overview

Capture the recipes, record the CI posture, and close the rollout.

### Changes Required:

#### 1. Cookbook entry

**File**: `context/foundation/test-plan.md` (§6)

**Intent**: Fill the Phase-4 TBD with the CI recipe + the Stryker selective workflow.

**Contract**: replace the "CI integration + Stryker" §6 bullet with: the `setup-cli@v2` + `supabase start` + `test:integration` job recipe (PR-trigger, off deploy.needs, no secret), and the Stryker selective workflow (unit-only config, `--mutate` narrow, conscious threshold, HTML report, run-after-a-phase, the safe-next score as the worked example).

#### 2. Stack/status sync

**File**: `context/foundation/test-plan.md` (§4 + §3 table)

**Intent**: Reflect the integration gate's CI posture and mark the rollout complete.

**Contract**: update §4 to note the integration suite now runs in CI as a PR-triggered job (not per-commit/not gating deploy) + Stryker as a selective local gate; set §3 Phase-4 Status to `complete`.

### Success Criteria:

#### Automated Verification:

- Full unit run + lint + type check green.
- §3 Phase 4 shows `complete`; §6 has no remaining Phase-4 TBD.

#### Manual Verification:

- §6 entry is concrete enough to reproduce the CI job + a Stryker run from the doc alone.

**Implementation Note**: Final phase — after automated verification, pause for manual confirmation, then the implement epilogue closes the change. After archive, the rollout is complete (`/10x-test-plan` prints the completion summary).

---

## Testing Strategy

### What's added:
- A CI `integration` job (verified on the first PR; commands proven locally).
- Stryker config + `test:mutation` script + the safe-next demo (mutation score recorded).
- One hermetic backfill test (the F4 guard).

### Oracle rule:
The F4 test asserts the contract (null list → empty, not a throw). The Stryker "oracle" is the survivor triage (would breaking this line hurt a user?), not a coverage number. CI verification is empirical (the job runs green on a PR).

## Performance Considerations

The `integration` job's cost is the Supabase Docker image pull (~minutes; not cached by default on GitHub-hosted runners). Ship plain `supabase start` first; add `-x <services>` excludes only if CI time/flake warrants. Stryker runs locally and is scoped per `--mutate` file, so it's seconds-to-minutes, not a CI cost.

## Migration Notes

No DB migrations. CI changes take effect only once pushed to GitHub. The one production edit (backfill `?? []`) is behavior-preserving for the normal (array) case.

## References

- Research: `context/changes/testing-ci-stryker/research.md`
- F4 follow-up: `context/archive/2026-06-07-testing-hermetic-service-api/follow-ups/review-fixes.md`
- Existing CI + deploy: `.github/workflows/ci.yml`; integration harness: `tests/integration/setup/`
- CLAUDE.md: §"Mutation testing (Stryker) — selective quality gate"; "the integration gate can stay ad hoc … Mark it … in test-plan.md §4"
- Rollout: `context/foundation/test-plan.md` (§3 Phase 4, §4, §6)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: CI integration job

#### Automated

- [x] 1.1 Workflow YAML is valid (parses) — 9f89c5b
- [x] 1.2 `npm run test:integration` green locally (commands the job runs) — 9f89c5b
- [x] 1.3 `ci` + `deploy` jobs unchanged in the diff (only an added job + workflow_dispatch) — 9f89c5b

#### Manual

- [ ] 1.4 First PR / workflow_dispatch: the `integration` job runs supabase start + suite green; deploy unaffected

### Phase 2: Stryker scaffold + safe-next demo

#### Automated

- [x] 2.1 `npx stryker run --mutate "src/lib/safe-next.ts"` completes + emits reports/mutation/index.html — 121ae7c
- [x] 2.2 Unit run green + lint + type check pass — 121ae7c

#### Manual

- [ ] 2.3 Mutation report reviewed; survivors triaged (killed or consciously ignored); score recorded

### Phase 3: F4 backfill null-guard

#### Automated

- [x] 3.1 Backfill tests pass: `npm run test -- backfill`
- [x] 3.2 Full unit run green + lint + type check

#### Manual

- [ ] 3.3 Prove-it-fails: removing the `?? []` guard reds the new test; restoring greens

### Phase 4: Cookbook & close-out

#### Automated

- [ ] 4.1 Full unit run + lint + type check green
- [ ] 4.2 §3 Phase 4 = complete; §6 has no remaining Phase-4 TBD

#### Manual

- [ ] 4.3 §6 entry reproduces the CI job + a Stryker run from the doc alone
