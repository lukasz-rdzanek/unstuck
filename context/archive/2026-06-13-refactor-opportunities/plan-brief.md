# SRS card-column single source (+ shared UUID refinement) — Plan Brief

> Full plan: `context/changes/refactor-opportunities/plan.md`
> Research: `context/changes/refactor-opportunities/research.md`

## What & Why

Consolidate the SRS card-column `.select()` string — duplicated across three API
routes (`grade`, `rate`, `submit`) — into one type-derived source of truth in
`src/lib/srs.ts`, so a DB column rename/add can no longer silently drift the
routes (today a typo is a runtime `.select()` error, not a build break). Fold in
one shared lenient-UUID zod refinement (C3) as a clustered quick win.

## Starting Point

`CARD_COLUMNS` exists three times (`grade.ts:8`, `rate.ts:24`, `submit.ts:6` —
the last with a load-bearing extra `question_id` column). `SrsCardFields`
(`srs.ts:22-25`) names the same columns but is not linked to the strings. `UUID_RE`
is triplicated (`grade`/`submit`/`match-answer`). Strong route-test net exists in
CI, but nothing asserts the column list.

## Desired End State

One `SRS_CARD_COLUMNS` export, compiler-bound to `keyof SrsCardFields`; the three
routes import it (`submit` composes the `question_id, …` variant). One `uuidString`
refinement imported by the three UUID-validating routes. Zero behavior change;
all tests green; no local `CARD_COLUMNS`/`UUID_RE` left.

## Key Decisions Made

All decided this planning session (autonomous, per session directive) — open for review.

| Decision                       | Choice                                                  | Why                                                                            | Source          |
| ------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------- |
| Which candidate(s)             | C1 (CARD_COLUMNS) + C3 (UUID)                           | Cheapest genuine structural win + clustered quick win; guard-first, reversible | Plan            |
| Defer C2 (RPC return typing)   | Out of scope                                            | Higher value but repo-wide forced convention; needs per-RPC SQL archaeology    | Plan / Research |
| Defer C4 (jsonResponse helper) | Out of scope                                            | Pure ergonomics, no failure mode                                               | Plan / Research |
| Enforce string↔type sync       | `satisfies (keyof SrsCardFields)[]` + completeness test | Compile-time validity + test-time completeness removes the silent-drift class  | Plan            |
| submit.ts asymmetry            | Compose `question_id, ${…}`                             | The 10th column is load-bearing (keyed reads)                                  | Research        |
| Order                          | Guard-first: test → source → swap → C3                  | Characterize before touch; each phase a separate revert                        | Plan            |

## Scope

**In scope:** consolidate `CARD_COLUMNS` (3 routes) to a type-derived export; a
characterization test; shared `uuidString` refinement (3 routes).
**Out of scope:** C2 (RPC return validation), C4 (jsonResponse), any `.select()`
strategy change, FSRS/DB/RLS/RPC changes, new CI infra.

## Architecture / Approach

Additive + guard-first. `src/lib/srs.ts` (already the SRS hub owning
`SrsCardFields`) gains the single column source; consumers flip one at a time;
the compiler guards validity, a unit test guards completeness. No runtime path
changes — the existing route/contract tests are the behavior-preservation net.

## Phases at a Glance

| Phase             | Delivers                                                   | Key risk                                                               |
| ----------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1. Characterize   | Test pinning the 9-column contract ↔ `SrsCardFields`       | Test that passes vacuously — mitigated by completeness assertion       |
| 2. Single source  | `SRS_CARD_COLUMNS` in `srs.ts`, compiler-bound, unconsumed | `satisfies` allows missing keys — covered by Phase-1 completeness test |
| 3. Swap consumers | 3 routes import the source (submit composes variant)       | Dropping `question_id` from submit — explicitly preserved              |
| 4. Shared UUID    | One `uuidString` refinement, 3 routes adopt                | Behavior drift — same 400; asserted                                    |

**Prerequisites:** none beyond the existing test suite.
**Estimated effort:** ~1 session, 4 small reversible commits.

## Open Risks & Assumptions

- The SRS routes have no DB-level test of the actual `.select()`; behavior
  preservation rests on unit tests with a faked Supabase. Smoke-test the 3 routes
  in the running app after Phase 3 (manual criterion).
- `satisfies` guarantees column _validity_, not _completeness_ — the Phase-1/2
  test is what guarantees no column is silently dropped. Both must stay.

## Success Criteria (Summary)

- One `SRS_CARD_COLUMNS` + one `uuidString`; no local duplicates remain (grep-clean).
- All existing tests + the new contract test green; build/lint/typecheck pass.
- Practice grade, lesson review, and test submit behave identically (manual smoke).
