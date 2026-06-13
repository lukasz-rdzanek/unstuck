<!-- PLAN-REVIEW-REPORT -->

# Plan Review: SRS card-column single source (+ shared UUID refinement)

- **Plan**: context/changes/refactor-opportunities/plan.md
- **Mode**: Deep
- **Date**: 2026-06-13
- **Verdict**: SOUND (after 2 LOW-impact fixes applied)
- **Findings**: 0 critical · 0 warnings · 2 observations

## Verdicts

| Dimension             | Verdict                     |
| --------------------- | --------------------------- |
| End-State Alignment   | PASS                        |
| Lean Execution        | PASS                        |
| Architectural Fitness | PASS                        |
| Blind Spots           | PASS (1 observation, fixed) |
| Plan Completeness     | PASS (1 observation, fixed) |

## Grounding

6/6 paths ✓ (srs.ts, srs.test.ts, grade/rate/submit/match-answer routes) ·
symbols ✓ (`CARD_COLUMNS` in exactly the 3 routes, no other importers; `UUID_RE`
×3) · `satisfies` supported (TypeScript 5.9.3) · both SRS tables exist in
migrations · no `docs/reference/contract-surfaces.md` (surface check skipped) ·
Progress↔Phase consistency ✓ (4 phases, every Success-Criteria bullet enumerated
N.M; plain bullets in phase blocks). brief↔plan ✓.

## Internal consistency

- Contradiction scan: clean — "What We're NOT Doing" (C2, C4) never reappear in phases.
- Promise gap: clean — every Desired-End-State promise (single `SRS_CARD_COLUMNS`,
  single `uuidString`, grep-clean, green tests) is backed by a phase.
- Contract breaks: n/a (no API contract changes — behavior-preserving).

## Findings

### F1 — Single source typed from `srs_review_state` but used against `srs_question_state`

- **Severity**: 🟦 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 / Phase 3
- **Detail**: `SRS_CARD_COLUMNS` is derived from `SrsCardFields` (a `Pick` over the
  generated `srs_review_state` Row), yet `grade`/`submit` use it against
  `srs_question_state`. The single source assumes both tables keep identical FSRS
  card columns. True today (the current literals prove it), but worth recording so
  a future table divergence isn't a silent surprise — it would fail loudly at
  `.select()`, which the Phase-3 smoke covers.
- **Fix**: Record the assumption in plan Key Discoveries + rely on Phase-3 smoke.
- **Decision**: FIXED (assumption note added to plan.md Key Discoveries)

### F2 — Phase 4 file location vague ("validation.ts or co-locate")

- **Severity**: 🟦 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4
- **Detail**: The shared UUID refinement's home was "`src/lib/validation.ts` (new)
  — or co-locate in an existing util". `src/lib/utils.ts` exists but is Tailwind-only
  (`cn()`); leaving the choice open invites the implementer to dump validation into it.
- **Fix**: Pin to a new `src/lib/validation.ts`, explicitly separate from `utils.ts`.
- **Decision**: FIXED (path pinned in plan.md Phase 4)

## Triage summary

- Fixed: F1, F2 (both LOW-impact, applied directly)
- ► Verdict after fixes: **SOUND** — ready for `/10x-implement refactor-opportunities phase 1`
