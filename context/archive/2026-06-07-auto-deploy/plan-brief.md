# Automated Deploy (CD) — Plan Brief

> Full plan: `context/changes/auto-deploy/plan.md`
> Context: `context/foundation/certification.md` (Champion gap #2)

## What & Why

Add a `deploy` job to `.github/workflows/ci.yml` so the Worker ships to Cloudflare automatically on every push to `master`, gated on CI (lint+test+build) passing. Closes the 10xChampion CD gap and folds the manual `.dev.vars`-aside deploy ritual into the pipeline.

## Starting Point

CI runs lint+test+build (green) but **deploys are manual** (`npm run build` with prod env + leak-check + `npx wrangler deploy`). All needed secrets already exist (`CLOUDFLARE_API_TOKEN`/`ACCOUNT_ID`, `SUPABASE_URL`/`KEY`). CI has no `.dev.vars`, so the build picks up prod env directly.

## Desired End State

Push to `master` → CI green → `deploy` job rebuilds with prod env, leak-checks, `wrangler deploy`s a new Worker version — zero human steps. Failed CI or leak-check blocks the deploy. Rapid merges cancel the older in-flight deploy.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Trigger + structure | `deploy` job in ci.yml, `needs: [ci]`, on push to master | Single workflow, deploy gated on green, simplest real CD | Plan |
| Approval | Auto-deploy on green (no manual gate) | True CD, strongest Champion signal; CI + leak-check are the guards | Plan |
| DB migrations | Stay manual (not in CD) | Schema changes irreversible; matches no-db-reset posture | Plan |
| Leak-check | Enforce before deploy | Hard guard vs shipping a localhost bundle (broke the first MVP deploy) | Plan |
| Concurrency | Cancel-in-progress (newest wins) | Prod reflects newest master; no overtaking deploys | Plan |
| Build strategy | Deploy job rebuilds (no artifact passing) | Self-contained, simpler | Plan |

## Scope

**In scope:** a `deploy` job (needs ci, master-push only) with prod-env build + leak-check + `wrangler deploy`; top-level concurrency cancel-in-progress; per-step secret scoping; docs (certification.md + memory).

**Out of scope:** DB migrations in CD; manual approval gate; PR/branch/tag deploys; preview/staging env; rollback automation; AI-assisted PR pipeline (separate change).

## Architecture / Approach

One new GitHub Actions job. `ci` (existing) stays the quality gate; `deploy` (`needs: [ci]`, `if: push && ref==master`) reruns `npm ci → astro sync → build` with prod `SUPABASE_*` + `CLOUDFLARE_*` env, asserts the leak-check (prod ref present, zero `127.0.0.1`), then `npx wrangler deploy`. Top-level `concurrency` makes the newest master push win.

## Phases at a Glance

| Phase | Delivers | Key risk |
| --- | --- | --- |
| 1. CD deploy job | ci.yml `deploy` job + concurrency + leak-check + wrangler deploy | First run deploys to prod — verify the gate/leak-check; confirm token has deploy perms |
| 2. Docs + closeout | certification.md (CD done) + memory deploy-process note | None |

**Prerequisites:** secrets already set (CF token w/ deploy perms, account id, Supabase prod URL+key).
**Estimated effort:** ~1 short session, 2 phases.

## Open Risks & Assumptions

- Assumes `SUPABASE_URL`/`KEY` secrets hold **prod** values — the leak-check enforces it (fails the deploy otherwise).
- Assumes the `CLOUDFLARE_API_TOKEN` (Edit Workers template) carries deploy permission — verified on the first run.
- Merging this change is itself the first live CD test → it will deploy to prod.

## Success Criteria (Summary)

- Merge to master auto-deploys a new Worker version with no manual steps; prod `/` + `/courses` → 200.
- A localhost-bundle (or failing CI) blocks the deploy.
- PRs run CI only — no deploy.
