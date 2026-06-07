# Contributing to Unstuck

How we ship changes: a PR-based flow with an AI review gate, on top of an automated CI/CD pipeline. This is the team-workflow half of the 10xChampion track (see `context/foundation/certification.md`).

## Workflow at a glance

```
branch  →  open PR  →  CI green (lint + test + build)  →  /code-review ultra + triage
        →  merge to master  →  CD auto-deploys to Cloudflare
```

1. **Branch** off `master` for the change (feature/fix/docs).
2. **Open a PR** to `master`. The PR template's checklist is the quality bar.
3. **CI runs on the PR** — `.github/workflows/ci.yml` runs `lint + test + build` (the `ci` job). The `deploy` job is guarded to `push` on `master`, so **PRs never deploy**.
4. **AI review gate** — run `/code-review ultra` on the branch/PR, triage the findings (fix criticals; record accepted/deferred). See "AI review gate" below.
5. **Merge** once CI is green and the AI review is triaged.
6. **CD** — merging to `master` triggers the `deploy` job: build with prod env → leak-check → `wrangler deploy`. No manual steps.

> Larger feature work is planned/implemented/reviewed with the 10x skills
> (`/10x-new → /10x-plan → /10x-implement → /10x-impl-review → /10x-archive`),
> with artifacts under `context/changes/<change-id>/`. The PR is the delivery
> wrapper around that work.

## CI/CD pipeline

- **CI** (`ci` job, every push + PR to `master`): `npm ci → astro sync → lint → test → build`. Unit tests are Vitest (`npm run test`); the build validates the Astro/Cloudflare bundle.
- **CD** (`deploy` job, push to `master` only, `needs: [ci]`): rebuilds with prod `SUPABASE_*` secrets, runs a hard **leak-check** (prod ref present, zero `127.0.0.1`), then `npx wrangler deploy`. Concurrency is cancel-in-progress (newest master wins).
- **Secrets** live in GitHub Actions (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_URL`, `SUPABASE_KEY`) — never in the repo.
- **DB migrations are NOT in CD.** If a change adds a Supabase migration, run `supabase db push` to prod **before** merging, so the deployed code meets a schema that already exists. Never `supabase db reset` (wipes local auth users).

## AI review gate

Every PR should be reviewed with **`/code-review ultra`** — the course's multi-agent cloud review of the branch (or `/code-review ultra <PR#>` for a GitHub PR). It's user-triggered and billed; run it locally, then triage:

- **Fix** criticals/warnings before merge.
- **Record** accepted-as-risk / deferred findings (in the PR, or as a `/10x-lesson` when it's a recurring rule).

This is the human-in-the-loop AI gate; it complements (doesn't replace) the automated CI checks.

## Tests

- **Unit** (Vitest, `src/**/*.test.ts`): `npm run test` / `npm run test:watch`. Pure domain logic (FSRS, parsing, guards, helpers).
- **E2E** (Playwright, `e2e/*.spec.ts`): `npm run test:e2e` — runs locally against `npm run dev` + a local Supabase stack (`npx supabase start`). Not in CI by design.

Add or update a test when behavior changes.

## Branch protection (status)

Branch protection (required status checks + required PR on `master`) is **not enforced** today — the repo is private on the free GitHub plan, which disables it. The flow above is **self-enforced**. To turn on hard enforcement, make the repo public (or upgrade to GitHub Pro) and set it via:

```bash
gh api -X PUT repos/<owner>/<repo>/branches/master/protection \
  -F required_status_checks.strict=true \
  -f 'required_status_checks.contexts[]=ci' \
  -F enforce_admins=true \
  -F required_pull_request_reviews.required_approving_review_count=0 \
  -F restrictions=
```

## Local dev quick reference

- `npm run dev` — Astro on the Cloudflare (workerd) runtime at `:4321`. Needs local Supabase (`npx supabase start`) + Cloudflare creds for the Workers AI binding.
- `npm run lint` / `npm run lint:fix` · `npm run test` · `npm run build`.
- Project conventions and tripwires: `AGENTS.md`. Recurring rules: `context/foundation/lessons.md`.
