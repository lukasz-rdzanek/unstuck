<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Lesson & Chat Data Model Implementation

- **Plan**: `context/changes/lesson-chat-data-model/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-28
- **Verdict (initial)**: REVISE
- **Verdict (after triage)**: SOUND
- **Findings**: 0 critical · 2 warnings · 2 observations · all FIXED

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS (with 1 observation) |
| Blind Spots | WARNING → PASS after fixes |
| Plan Completeness | PASS (with 1 observation) |

## Grounding

5/5 existing paths verified ✓ · 4/4 plan-creates paths correctly marked ✓ · all symbols verified at the cited file:line ✓ · supabase CLI 2.98.2 supports `gen types --local` ✓ · `[db.seed]` enabled in `supabase/config.toml` ✓ · blast radius for `src/lib/supabase.ts` mapped (4 callers: middleware + 3 auth API routes — `<Database>` type param is backward-compatible).

## Findings

### F1 — No automated RLS verification (load-bearing security surface)

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 / Testing Strategy
- **Detail**: RLS is the entire privacy mechanism (PRD NFR) AND Supabase Realtime delivery to S-02 obeys the SELECT policy — a wrong policy silently leaks or hides chat. Phase 2 verified the matrix via 4 manual checks only; no SQL-based assertion file.
- **Fix**: Add `supabase/tests/rls_matrix.sql` exercising 4 role cells (anon / authenticated free / authenticated no-access / service_role) with `do $$ raise exception` assertion blocks. Runnable via `psql -f`, exits non-zero on failure. No new tooling.
  - Strength: catches policy drift mechanically; lives as executable spec.
  - Tradeoff: ~30 lines of SQL to write and maintain alongside policies.
  - Confidence: HIGH — raw SQL assertions are standard Postgres.
  - Blind spot: doesn't test Realtime delivery itself (S-02's job with a live client).
- **Decision**: FIXED — applied as Phase 2 Changes Required §2 + automated success criterion 2.4.

### F2 — Production schema deployment path not addressed

- **Severity**: WARNING
- **Impact**: HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Migration Notes / Desired End State
- **Detail**: Plan assumed `npx supabase db reset` (local only). Production Supabase project (`rhcioqeawpbuylbmkxnr.supabase.co`) is live with only `auth.users`; without explicit migration propagation, F-01 lands locally but production stays empty — S-01/S-02 won't work in the deployed app.
- **Fix A ⭐ Recommended**: Add Phase 4 "Deploy to Production Supabase" with `supabase link --project-ref rhcioqeawpbuylbmkxnr` (one-time) + `supabase db push` + smoke check that prod tables exist with RLS.
  - Strength: F-01 is production-ready when complete; S-01 deploy later is just app code; documents the link+push pattern for downstream slices to reuse.
  - Tradeoff: ~30 min implementation; links the local repo to a specific cloud project (state change).
  - Confidence: HIGH — `supabase link` + `db push` is the documented managed flow.
  - Blind spot: doesn't address WHEN to run vs app deploy; for additive migrations, "before app deploy" is safe.
- **Fix B**: Defer production deployment to S-01 (add to "What We're NOT Doing").
  - Strength: keeps F-01 lean — pure local schema.
  - Tradeoff: S-01 hits the prod-deploy step unexpectedly; mixes infra setup with feature work.
  - Confidence: MEDIUM — defensible but pushes the awkward step downstream.
  - Blind spot: implementer of S-01 may try to ship without checking prod schema state.
- **Decision**: FIXED via Fix A — Phase 4 added with Changes Required, automated 4.1–4.2, manual 4.3–4.5; Desired End State updated to mention prod schema parity.

### F3 — `src/db/` vs project's `src/lib/` convention

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 — generated types path
- **Detail**: `AGENTS.md` Key Conventions: "Services and helpers: `src/lib/`". Plan introduced a new top-level `src/db/` for generated types. Both placements defensible; project convention puts non-component code in `src/lib/`.
- **Fix**: Move to `src/lib/db/database.types.ts`. Adjust gen-types command path accordingly. Single edit, no semantic change.
- **Decision**: FIXED — 3 occurrences updated (Phase 3 file path, gen-types command, sync verification).

### F4 — Docker daemon dependency not pre-flagged

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Automated Verification
- **Detail**: `npx supabase db reset` requires Docker daemon running. Plan-brief mentions it once as a prerequisite, but Phase 1 success criteria didn't include a Docker pre-check. First-time implementer (or fresh terminal after reboot) gets a cryptic error mid-Phase 1.
- **Fix**: Add Phase 1 step 1.1 "Pre-flight: `npx supabase status` reports API + DB running" before the migration apply. Renumber Phase 1 Progress entries accordingly.
- **Decision**: FIXED — pre-flight added as new Automated step; Phase 1 Progress renumbered (1.1 pre-flight, 1.2–1.4 automated, 1.5–1.7 manual).
