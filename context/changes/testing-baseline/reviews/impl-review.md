<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Testing Baseline (testing-baseline)

- **Plan**: context/changes/testing-baseline/plan.md
- **Scope**: Phases 1–3 (all)
- **Date**: 2026-06-07
- **Verdict**: APPROVED
- **Findings**: 0 critical · 0 warnings · 4 observations

Automated re-run at review: `npm run test` → 13/13; `npm run lint` → 0 errors (33 pre-existing warnings); `npx astro check` → 0 errors / 0 warnings; e2e `npm run test:e2e` → green; CI run 27091599643 → green (lint + test + build).

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Two documented deviations, both justified: (1) plain `vitest/config` instead of astro's `getViteConfig` (the latter loads the Cloudflare vite plugin, incompatible with Vitest at startup); (2) `CLOUDFLARE_API_TOKEN`/`ACCOUNT_ID` added to CI — an in-spirit Phase 3 fix for a pre-existing CI breakage (the remote-only AI binding forced a remote proxy on `astro sync`/`build`). 🔒 Verified: `isSafeNext` extraction is byte-identical (open-redirect guard intact); CF token sourced from GitHub secrets (not hardcoded); e2e creds are local-only throwaway; the `cloudflare:workers` stub cannot ship to prod.

## Findings

### F1 — CLOUDFLARE token at job-level env (least-privilege)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality / Pattern Consistency
- **Location**: .github/workflows/ci.yml
- **Detail**: CF token/account-id were job-level env → in scope for `npm ci` (untrusted postinstall surface), asymmetric with the Supabase secrets which were already scoped to the build step.
- **Decision**: FIXED — moved the two CF vars to per-step `env:` on `astro sync` + `build`; dropped the job-level block.

### F2 — vitest.config astro:env tripwire for future authors

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: vitest.config.ts
- **Detail**: The plain config won't resolve `astro:env/*` virtual modules — fine today, but the next author testing e.g. `supabase.ts` would hit it.
- **Decision**: FIXED — added a tripwire comment pointing to add a stub or use getViteConfig for astro:env modules.

### F3 — e2e hardcoded absolute origin in waitForURL

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Reliability
- **Location**: e2e/test-taking.spec.ts
- **Detail**: `waitForURL("http://localhost:4321/")` ignored `baseURL`; brittle if the origin/port changes.
- **Decision**: FIXED — `page.waitForURL("/")` (inherits baseURL). Re-ran e2e green.

### F4 — e2e depends on shared local state

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Reliability
- **Location**: e2e/test-taking.spec.ts, playwright.config.ts
- **Detail**: Relies on local Supabase seed + the `diagtest` account + `reuseExistingServer`; drift fails as opaque timeouts.
- **Decision**: ACCEPTED — local-only, not in CI, by design; the plan-brief already notes it. Revisit with a fixture/precheck if it becomes annoying.

## Triage summary

- **Fixed**: F1 (token scoping), F2 (config comment), F3 (relative waitForURL)
- **Accepted**: F4 (local e2e shared state, by design)
