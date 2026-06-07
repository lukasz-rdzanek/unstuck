# Testing Baseline — Plan Brief

> Full plan: `context/changes/testing-baseline/plan.md`
> Context: `context/foundation/certification.md` (Champion path, step 1)

## What & Why

Stand up the project's first automated tests — the single gap blocking the 10xDevs **Builder** badge ("≥1 test from the user's perspective") and the foundation of the **Champion** CI/CD story. Vitest covers domain logic (runs in CI); Playwright covers one true end-to-end user flow (local).

## Starting Point

Zero test infrastructure (no runner/config/script/deps). CI runs only lint + build. Pure domain logic exists and is testable (`srs.ts` FSRS, `video-embed.ts`, `embeddings.ts` helpers, the `isSafeNext` open-redirect guard); quiz grading lives in SQL so it's only reachable end-to-end.

## Desired End State

`npm run test` runs a green Vitest suite; `npm run test:e2e` runs a green Playwright take-a-test flow locally; CI runs lint + **test** + build automatically on push/PR. Builder's mandatory test requirement is met; CI's quality gate now includes tests.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Runner | Vitest + Playwright | Fast units in CI + one real user-perspective e2e — strongest cert signal | Plan |
| E2E flow | Take a test → see score | Exercises real SQL grading end-to-end; deterministic (no Workers AI/Realtime) | Plan |
| CI scope now | Vitest in CI; Playwright local | Keeps CI fast/green/no Docker; e2e still exists for the cert | Plan |
| Unit scope | Core domain set | srs + parseVideoUrl + toVectorLiteral + isSafeNext (extracted) — meaningful, not trivial | Plan |
| E2E data/auth | Reuse existing seed | diagtest user + seeded streaming-basics-test; zero new fixtures | Plan |
| Coverage gate | None for now | Gate on pass/fail (the cert ask); avoid brittle % on a young suite | Plan |

## Scope

**In scope:** Vitest config (Astro `getViteConfig` + `cloudflare:workers` stub alias) + scripts; extract `isSafeNext` to a util; unit tests (srs, video-embed, safe-next, embeddings); Playwright config + one e2e (take-a-test); `npm run test` step in `ci.yml`.

**Out of scope:** Playwright-in-CI; automated deploy (CD); AI-assisted PR pipeline; coverage threshold; DB/integration harness for SQL; broad trivial-util tests; any app feature.

## Architecture / Approach

Vitest (node env) over pure modules — one config gotcha: `embeddings.ts` imports `cloudflare:workers`, so the config stub-aliases that module. Playwright drives the real local stack (`npm run dev` on :4321 + local Supabase) through the UI, signing in via the form so CSRF passes. CI gains a `npm run test` step (Vitest only — no secrets/Docker needed).

## Phases at a Glance

| Phase | Delivers | Key risk |
| --- | --- | --- |
| 1. Vitest + unit tests | Runner, config+stub, scripts, isSafeNext extraction, 4 unit suites | `cloudflare:workers` import under node (mitigated by alias) |
| 2. Playwright e2e (local) | Config + take-a-test spec (the user-perspective test) | Local stack must be up; UI-form auth/CSRF |
| 3. CI test stage | `npm run test` in `ci.yml` | None significant (Vitest needs no external deps) |

**Prerequisites:** local Supabase running for the e2e (`npx supabase start`).
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- The e2e depends on `seed.sql` + the local `diagtest` account staying in sync.
- Playwright not in CI yet — the user-perspective test runs locally (reviewer sees it there); CI-ifying it is the follow-on CD change.

## Success Criteria (Summary)

- `npm run test` green (units) and `npm run test:e2e` green locally (take-a-test → score).
- CI runs lint + test + build automatically and passes on push.
- Builder's mandatory "≥1 user-perspective test" requirement satisfied.
