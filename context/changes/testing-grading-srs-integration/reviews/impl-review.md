<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Grading & answer-matching integration tests

- **Plan**: context/changes/testing-grading-srs-integration/plan.md
- **Scope**: All 5 phases
- **Date**: 2026-06-07
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success criteria re-run at review time: integration 49/49 (8 files), unit 13/13, tsc clean, lint 0 errors. Drift review: full MATCH across all five files, no out-of-scope work, SRS correctly deferred, F1 write-denial correctly NOT asserted. Verified cascade: `test_attempts.user_id → auth.users ON DELETE CASCADE` + `attempt_answers.attempt_id → test_attempts ON DELETE CASCADE` (shared-seed grading attempts clean up on user-teardown).

## Findings

### F1 — "Newest attempt" read lacks a deterministic tiebreaker

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (test reliability)
- **Location**: tests/integration/grading.itest.ts:106-112
- **Detail**: The persistence test reads its attempt via `.order("created_at", desc).limit(1).maybeSingle()`. ~8 prior attempts exist for this (user, seed test); created_at is `now()` (transaction-start). Each RPC is its own tx so collisions are unlikely, but there's no tiebreaker — an equal-timestamp tie would make limit(1) pick arbitrarily and could read a non-score-1 row and flake.
- **Fix**: Add `.order("id", { ascending: false })` as a secondary sort.
- **Decision**: FIXED — added the `id` secondary sort to the newest-attempt read.

### F2 — char_length≥40 precondition is implicit

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/integration/setup/fixtures.ts (match/trap/embed message bodies)
- **Detail**: match_lesson_answers silently drops messages with body <40 chars. Fixture bodies satisfy it, but a future shortening would fail the isolation tests confusingly.
- **Fix**: Add a one-line comment noting the ≥40 requirement next to the match fixture bodies.
- **Decision**: FIXED — added a NOTE in the R5(a) fixture section about the char_length≥40 filter.

### F3 — local vec() duplicates fixtures' vec768()

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/integration/embedding-immutability.itest.ts:13-17
- **Detail**: A single-component 768-vector builder is redefined locally instead of reusing vec768() from fixtures. Not a bug; two impls could drift.
- **Fix**: Export vec768 from fixtures and reuse it.
- **Decision**: FIXED — exported vec768 from fixtures; embedding-immutability now reuses it.
