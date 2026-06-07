<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Hermetic service/API contract tests

- **Plan**: context/changes/testing-hermetic-service-api/plan.md
- **Scope**: All 5 phases
- **Date**: 2026-06-07
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Re-run at review time: unit 77/77, lint 0 errors, tsc clean, `vitest.config.ts` unchanged (astro:env tripwire intact), `src/middleware.ts` diff = the single `export`. Full plan MATCH, zero drift. No test asserts its own mock; SRS tests run applyRating real and assert branch/binding, not FSRS numbers.

## Findings

### F1 — Fake signOut default returns the wrong shape (latent fidelity lie)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (mock fidelity)
- **Location**: src/test/harness/fake-supabase.ts (auth.signOut default)
- **Detail**: Default auth.signOut resolves to OK = {data:null,error:null}; real supabase-js signOut() returns {error} only. Not currently exercised (smoke supplies its own signOut), but a lie waiting for the first consumer.
- **Fix**: default signOut to `() => Promise.resolve({ error: null })`.
- **Decision**: FIXED — default now returns `{ error: null }`.

### F2 — complete DELETE error branch (delete_failed/500) is untested

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/pages/api/route-contracts.test.ts (complete DELETE)
- **Detail**: POST save_failed is covered; the DELETE error→500 branch (complete.ts:81-85) is not.
- **Fix**: add one DELETE-error case (lesson_completions write {error} → 500 delete_failed).
- **Decision**: FIXED — added the DELETE delete_failed case to route-contracts.test.ts.

### F3 — Harness write-mode+direct-await path is fidelity-sensitive, uncommented

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/test/harness/fake-supabase.ts (FakeQuery then()/result())
- **Detail**: The submit/grade SWALLOW tests depend on `await .upsert()` returning the write-result via the thenable; a future refactor of then()/result() could silently make them vacuous.
- **Fix**: add an inline comment flagging the write-mode + direct-await contract.
- **Decision**: FIXED — added a LOAD-BEARING comment on result()/then().

### F4 — backfill iterates list RPC data without a null guard (production note)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/embeddings/backfill.ts:63 (`for (const row of pending)`)
- **Detail**: If list_unembedded_messages returned {data:null,error:null}, the real handler throws (no `?? []`). The hermetic suite can't catch it (the fake always returns arrays). Production-code robustness question, out of this test-only change's scope.
- **Fix**: out of scope here — record as a follow-up (add `?? []` guard in a separate change), or skip.
- **Decision**: SKIPPED (out of test-only scope) — recorded in follow-ups/review-fixes.md for a future production change.
