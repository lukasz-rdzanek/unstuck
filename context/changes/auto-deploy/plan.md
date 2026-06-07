# Automated Deploy (CD) Implementation Plan

## Overview

Add a `deploy` job to `.github/workflows/ci.yml` that ships the Worker to Cloudflare automatically on every push to `master`, **gated on the existing CI job (lint + test + build) passing**. The job rebuilds with prod Supabase env, runs the leak-check guard, then `npx wrangler deploy`. Auto-deploy on green (no manual approval), cancel-in-progress on rapid merges. DB migrations stay manual. This closes 10xChampion CD gap #2 (`context/foundation/certification.md`) and folds the manual `.dev.vars`-aside ritual into the pipeline.

## Current State Analysis

- **CI** (`.github/workflows/ci.yml`): `npm ci → astro sync → lint → test → build` on push/PR to master; green. `astro sync` + `build` carry `CLOUDFLARE_API_TOKEN`/`ACCOUNT_ID` (per-step) for the AI-binding remote proxy; `build` also carries `SUPABASE_URL`/`SUPABASE_KEY`.
- **Manual deploy ritual** (`[[unstuck-production]]`): `mv .dev.vars aside → SUPABASE_URL=… SUPABASE_KEY=… npm run build → leak-check grep → npx wrangler deploy → restore .dev.vars`.
- **CI has no `.dev.vars`** (gitignored, not in repo) → the `.dev.vars`-aside step is unnecessary in CI; the build picks up `SUPABASE_URL`/`SUPABASE_KEY` env directly. This is why the existing CI build already produces a prod-pointing bundle (assuming those secrets hold prod values — the leak-check will enforce it).
- **Secrets present**: `CLOUDFLARE_API_TOKEN` (Edit Cloudflare Workers template → has deploy perms), `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_URL`, `SUPABASE_KEY`.
- **`wrangler deploy`** authenticates non-interactively from `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` env (verified locally this session). `wrangler.jsonc` defines the `unstuck` Worker + bindings.

### Key Discoveries:

- The leak-check (`grep -roE "(rhcioqeawpbuylbmkxnr|127\.0\.0\.1:54321)" dist/`) is the load-bearing guard — it's the exact failure that broke the first MVP deploy (localhost baked into the client bundle). Enforce it before `wrangler deploy`.
- CD must NOT run on pull_request (only `push` to `master`) — else PRs would deploy.
- The `astro sync`/`build` in the deploy job need the CF creds too (remote-proxy), same as the `ci` job.

## Desired End State

Pushing to `master` runs CI (lint+test+build); on success the `deploy` job rebuilds with prod env, leak-checks, and `wrangler deploy`s a new Worker version — no human steps. A failed CI (or a failed leak-check) blocks the deploy. Rapid successive merges cancel the older in-flight deploy so prod reflects the newest `master`. Verify: merge this change → Actions shows `ci` then `deploy` green → a new Worker version ID → `/` + `/courses` 200 on prod.

## What We're NOT Doing

- **No DB migrations in CD** — `supabase db push` stays a deliberate manual step (run it *before* merging a migration-bearing change). Schema changes are irreversible; this matches the cautious DB posture ([[feedback-no-db-reset]]).
- **No manual approval gate** — auto-deploy on green (solo project; CI + leak-check are the guards).
- **No deploy on PRs / branches / tags** — only `push` to `master`.
- **No preview/staging environment** — single prod target.
- **No rollback automation** — revert-commit + re-deploy is the recovery path (out of scope here).
- **No change to the manual ritual's existence** — it stays documented as a fallback/one-off.
- **No artifact passing between `ci` and `deploy`** — the deploy job rebuilds (simpler, self-contained).

## Critical Implementation Details

- **Trigger guard**: the `deploy` job must be conditioned `if: github.event_name == 'push' && github.ref == 'refs/heads/master'` AND `needs: [ci]`. `needs` makes it wait for + require the `ci` job; the `if` stops it on PRs. (On PRs the `ci` job still runs; `deploy` is skipped.)
- **Concurrency**: a top-level `concurrency: { group: deploy-${{ github.ref }}, cancel-in-progress: true }` — newest push wins. Scope the group so it doesn't cancel unrelated PR CI runs (keying on ref is enough since only master-push reaches deploy).
- **Secrets the deploy job needs**: `SUPABASE_URL` + `SUPABASE_KEY` (build → client bundle), `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (astro sync/build remote proxy + wrangler deploy). Scope per-step (not job-level) to match the CI least-privilege pattern (impl-review F1 from testing-baseline).
- **Leak-check is a hard gate**: fail the job if `dist/` contains `127.0.0.1:54321` or lacks the prod Supabase ref — never deploy a localhost-pointing bundle.

## Phase 1: CD deploy job (ci.yml)

### Overview

Add the `deploy` job + concurrency to the workflow.

### Changes Required:

#### 1. Concurrency + deploy job

**File**: `.github/workflows/ci.yml`

**Intent**: After CI passes on a master push, rebuild with prod env, guard with the leak-check, and deploy the Worker — automatically, newest-wins.

**Contract**: add a top-level `concurrency` block (group keyed on ref, `cancel-in-progress: true`). Add a second job `deploy` with `needs: [ci]` and `if: github.event_name == 'push' && github.ref == 'refs/heads/master'`. Steps: `actions/checkout@v4`; `actions/setup-node@v4` (node 22, npm cache); `npm ci`; `npx astro sync` (env: CF token+account); `npm run build` (env: SUPABASE_URL/KEY + CF token+account); a leak-check run step (`grep -roE "(rhcioqeawpbuylbmkxnr|127\.0\.0\.1:54321)" dist/`-based: assert prod ref present AND zero localhost, else `exit 1`); `npx wrangler deploy` (env: CF token+account). Keep the existing `ci` job unchanged.

### Success Criteria:

#### Automated Verification:

- Workflow YAML is valid and contains a `deploy` job with `needs: [ci]` + the master-push `if` guard + a leak-check step + `wrangler deploy`.
- `npm run build` still succeeds locally (no workflow-induced regression).

#### Manual Verification:

- On merge to `master`: Actions runs `ci` → then `deploy`; both green.
- The leak-check step passes (prod ref present, zero localhost) — and would fail the job on a localhost bundle.
- A new Cloudflare Worker version is published; prod `/` + `/courses` return 200.
- Opening a PR runs `ci` only — `deploy` is skipped (no PR deploy).

---

## Phase 2: Docs + closeout

### Overview

Record that CD is automated and update the certification standing.

### Changes Required:

#### 1. Certification status

**File**: `context/foundation/certification.md`

**Intent**: Mark Champion gap #2 (automated deploy) done; the remaining Champion item is the AI-assisted PR pipeline.

**Contract**: update the Champion gap list (CD → done), the CI/CD line, and the "Path to Champion" step 3 → done; bottom line reflects CD shipped.

#### 2. Production deploy-process note

**File**: memory `unstuck-production.md`

**Intent**: Note CD is now the primary deploy path (auto on merge to master); the manual `.dev.vars`-aside ritual is retained as a fallback/one-off; migrations remain a manual pre-merge step.

**Contract**: add a "Deploy process" note; keep the manual ritual block for reference.

### Success Criteria:

#### Automated Verification:

- None (docs only).

#### Manual Verification:

- certification.md + memory reflect CD shipped; manual-ritual + manual-migration caveats recorded.

---

## Testing Strategy

### Manual Testing Steps:
1. Merge this change to master → watch Actions: `ci` green → `deploy` green → new Worker version.
2. Prod smoke: `/` + `/courses` → 200.
3. Open a throwaway PR → confirm only `ci` runs, `deploy` is skipped.
4. (Spot-check) the leak-check step output shows the prod ref + zero localhost.

## Migration Notes

DB migrations are NOT part of CD. For a change that adds a migration: run `supabase db push` manually (and verify) *before* merging, so the deployed code meets a schema that already exists.

## References

- Certification / Champion path: `context/foundation/certification.md`
- Manual deploy ritual + prod coordinates: memory `unstuck-production.md`
- Current workflow: `.github/workflows/ci.yml`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: CD deploy job (ci.yml)

#### Automated

- [x] 1.1 Workflow has a `deploy` job: `needs: [ci]` + master-push `if` guard + leak-check + `wrangler deploy` — 4f38a3c
- [x] 1.2 `npm run build` still succeeds locally — 4f38a3c

#### Manual

- [x] 1.3 On merge to master: `ci` → `deploy` both green; new Worker version published — 4f38a3c
- [x] 1.4 Leak-check passes (prod ref present, zero localhost); prod `/` + `/courses` → 200 — 4f38a3c
- [x] 1.5 PRs run `ci` only — `deploy` skipped (no PR deploy) — 4f38a3c

### Phase 2: Docs + closeout

#### Manual

- [x] 2.1 certification.md updated (CD gap → done; remaining = AI-PR-pipeline)
- [x] 2.2 memory unstuck-production updated (CD primary; manual ritual fallback; manual migrations)
