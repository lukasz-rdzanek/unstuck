---
change_id: testing-ci-stryker
title: CI integration + Stryker mutation testing (test-plan Phase 4)
status: implemented
created: 2026-06-07
updated: 2026-06-07
archived_at: null
---

## Notes

Rollout **Phase 4 (final)** of `context/foundation/test-plan.md`: "CI integration + Stryker mutation testing" — the **quality gate over R1–R7**. This phase WIRES GATES, it does not author risk tests (a different shape from Phases 1–3).

Two deliverables:
- **CI integration** — get the **integration suite** (`npm run test:integration`, Phases 1–2: RLS/answer-key/grading/match against a real Supabase) running in CI. The hermetic unit run (`npm run test`) + build already run in CI (`.github/workflows/ci.yml`). The hard part is standing up a Supabase **test DB / local stack in CI** (the local stack uses Docker + seed). Per CLAUDE.md, the integration gate **may stay ad-hoc** (not per-commit) if running infra in CI is expensive — that's a cost×signal decision for the plan, and §4 should be marked accordingly.
- **Stryker mutation testing** — add as a **selective** gate (narrow `--mutate` to a changed module after a risk phase), **NOT** a per-commit CI gate, with a **conscious threshold** (don't chase 100%; ignore equivalent/cosmetic mutants). Per CLAUDE.md mutation-testing guidance: coverage says "line executed", mutation score says "would a test fail if I broke this line?".

Risk response intent:
- The new tests actually RUN in CI (or are documented as an ad-hoc gate with the exact command + when to run it), so a regression in R1–R7 is caught before merge — without breaking the existing green CI or the auto-deploy job.
- Stryker is runnable (`npx stryker run --mutate "<path>"`) against a narrowed scope, produces an HTML report, and has a documented selective-use workflow + threshold — proving the Phase 1–3 tests catch real regressions, not just raise coverage.

Must challenge: "running integration in CI is free" (Docker + Supabase in CI is the cost); "more CI gates = better" (cost×signal — ad-hoc may be right); "100% mutation score is the goal" (equivalent mutants exist; pinning cosmetic mutants is itself a vibe test). Avoid: breaking the existing CI/auto-deploy; a Stryker config that mutates the whole repo (slow, noisy); turning the integration gate into a flaky per-commit blocker.

Carry-in: the **F4 follow-up** from the Phase 3 archive (`context/archive/2026-06-07-testing-hermetic-service-api/follow-ups/review-fixes.md`) — the `backfill.ts` list-RPC null-guard — is a natural pickup here (it's a small production hardening + a hermetic test). Decide in planning whether to fold it in or leave it.

Boundaries (per CLAUDE.md): authoring CI/CD from scratch is Module-1/2-Lesson-5 territory — this extends the EXISTING ci.yml, it doesn't rebuild it. CI changes are outward-facing (gate merges + auto-deploy) — don't break the green pipeline.

Stack grounding to (re)check in research: Context7 / Exa for current Stryker-for-Vitest config + Supabase-in-GitHub-Actions (service container vs `supabase start` in CI); GitHub Actions (existing ci.yml + deploy job + secrets). After this phase archives, the rollout is COMPLETE.

Next: research → plan → implement → impl-review → archive.
