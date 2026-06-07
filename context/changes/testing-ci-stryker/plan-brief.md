# CI integration + Stryker mutation testing (test-plan Phase 4) — Plan Brief

> Full plan: `context/changes/testing-ci-stryker/plan.md`
> Research: `context/changes/testing-ci-stryker/research.md`

## What & Why

The final rollout phase: wire the **quality gates** over R1–R7 by extending the existing CI — run the Phase-1/2 integration suite in GitHub Actions (a real Supabase stack) on PRs, and add Stryker mutation testing as a selective local gate that proves the Phase 1–3 tests would actually fail if the code broke. Plus the carry-in F4 backfill null-guard. After this archives, the test rollout is complete.

## Starting Point

CI (`.github/workflows/ci.yml`) already runs lint + the hermetic unit suite + build, and auto-deploys on green push to master. The integration suite (49 tests across Phases 1–2) runs only locally; Stryker doesn't exist yet; and `backfill.ts` has a known unguarded list-RPC iteration (the deferred F4 follow-up). Nothing has been pushed — all rollout work is local.

## Desired End State

A PR opens → a dedicated `integration` job boots local Supabase and runs the integration suite (gating the change), while the fast `ci`→`deploy` path is untouched and never blocked by it. `npx stryker run --mutate "<file>"` works against a unit-only config with a conscious threshold, demonstrated on the open-redirect guard. `backfill.ts` no longer throws on a null list. test-plan §3 Phase 4 = complete.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Supabase in CI | `supabase/setup-cli@v2` + `supabase start` | High-fidelity match to local dev; the harness self-discovers demo keys via `supabase status` — no new secret; bare-Postgres rejected (no GoTrue → defeats R1/R2/R4) | Research |
| Integration job placement | Separate job, PR + `workflow_dispatch`, **off `deploy.needs`** | Gates PRs before merge; a Docker flake can never wedge/slow prod deploy (CLAUDE.md ad-hoc allowance) | Plan |
| CI verification | Trust proven commands + verify on first PR | A CI-config change can't run locally; the commands it runs are already green in Phases 1–2 | Plan |
| Stryker packages | core + vitest-runner `^9.6.1` | 9.6.1 is the floor for correct coverage on Vitest 4.1 | Research |
| Stryker config | Unit-only `vitest.stryker.config.ts` (no projects/globalSetup) | Stops a mutation run from booting Supabase via the integration project | Research |
| Stryker scope | Scaffold + demo on `safe-next.ts` | Proves the gate on a high-value security module without over-investing; selective per CLAUDE.md | Plan |
| F4 carry-in | Fold in (1-line guard + 1 test) | Closes the archived follow-up while in the test-quality phase | Plan |

## Scope

**In scope:** an `integration` CI job; Stryker deps + unit-only config + `stryker.conf.json` + `test:mutation` + `.gitignore`; a safe-next mutation demo; the backfill `?? []` guard + hermetic test; §6 cookbook + §4/§3 sync.

**Out of scope:** rebuilding ci.yml/deploy; gating deploy on integration; per-push integration; Stryker in CI; chasing 100% mutation score; hardening `srs.ts` from survivors (possible follow-up); new secrets; harness rewrite.

## Architecture / Approach

Additive only. A new `integration` job (`supabase start` → `test:integration`) lives beside `ci`, scoped to PRs + manual, never in `deploy.needs`. Stryker points at a dedicated unit-only vitest config so mutation runs stay hermetic; it's driven by `--mutate <file>` and stays out of CI. The F4 fix mirrors an existing guard one line away.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. CI integration job | `integration` job on PRs (supabase start + suite) | Can't run CI locally — verify on first PR; don't touch ci/deploy |
| 2. Stryker scaffold + demo | deps + unit-only config + script + safe-next score | The vitest-projects trap (must avoid integration project) |
| 3. F4 null-guard | backfill `?? []` + hermetic test | Trivial; prove-it-fails confirms it |
| 4. Cookbook & close-out | §6 recipe, §4/§3 sync, rollout complete | — |

**Prerequisites:** local Supabase up for Phases 2–3 verification; nothing for the CI YAML itself.
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- CI behavior is unverified until the first push/PR — the underlying commands are proven locally, but the wiring isn't exercised until then.
- Supabase image pull is the integration job's cost (minutes; not cached by default) — acceptable for a PR-only gate; tune with `-x` later if needed.
- Stryker config must replicate the `@`/`cloudflare:workers` aliases the moment a target's imports need them (safe-next doesn't, so the demo is clean).

## Success Criteria (Summary)

- The integration suite runs as a PR-gated CI job without touching the green `ci`→`deploy` path (confirmed on the first PR).
- A Stryker run on `safe-next.ts` produces a report and a triaged survivor set, with the selective workflow documented.
- `backfill.ts` treats a null list result as empty (not a throw), pinned by a hermetic test; test-plan §3 marks the rollout complete.
