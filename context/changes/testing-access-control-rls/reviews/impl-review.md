<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Access-control & answer-key integration tests

- **Plan**: context/changes/testing-access-control-rls/plan.md
- **Scope**: All 5 phases
- **Date**: 2026-06-07
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success criteria re-run at review time: integration 32/32, unit 13/13, tsc clean, lint 0 errors, `supabase/tests/rls_matrix.sql` removed.

## Findings

### F1 — Seed-lesson message orphaned on a failed assertion (cleanup gap)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (test reliability)
- **Location**: tests/integration/role-matrix.itest.ts:61-79; tests/integration/setup/fixtures.ts:12-15
- **Detail**: role-matrix Cell 2 posts a message on the shared SEED lesson and deletes it on the test's last line. `messages.author_id → profiles` is `ON DELETE SET NULL` (not cascade), so deleting the fixture user does not remove it — only the explicit in-test delete does. If the assertion above the delete fails, the delete never runs and a NULL-author message leaks onto the seed lesson, accumulating across failed runs. The fixtures.ts header comment ("deleting a user cascades … own-only rows on ANY course") also overstates the cascade — messages are neither own-only nor cascaded.
- **Fix**: Move the Cell 2 message deletion into a try/finally (or an afterAll that tracks the id) so a failed assertion still cleans it, and correct the fixtures.ts comment to exclude messages from the user-cascade claim.
- **Decision**: FIXED — wrapped Cell 2 in try/finally; corrected the fixtures.ts cascade caveat.

### F2 — `.single()` on test_attempts filtered by test_id only (latent fragility)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (test reliability)
- **Location**: tests/integration/idor.itest.ts:53
- **Detail**: beforeAll reads A's attempt with `.eq("test_id", SEED_TEST_ID).single()`. Safe today (A is unique per run; RLS scopes to A's rows; one submit). But test_attempts has no unique (user_id,test_id) constraint, so if the hook retries or a second submit is added, A has 2 rows and `.single()` throws PGRST116.
- **Fix**: Use `.order(...).limit(1).maybeSingle()`, or capture the attempt id from the submit_test_attempt return value.
- **Decision**: FIXED — switched to `.order("created_at", desc).limit(1).maybeSingle()`.

### F3 — Positive controls don't assert the write landed

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/integration/course-access.itest.ts:77-100
- **Detail**: submit_test_attempt / grade_question enrolled controls only check `error === null`; a silent no-op would pass. Low risk (idor exercises them for real).
- **Fix**: Assert `inn.data` is non-null on the enrolled controls.
- **Decision**: FIXED — added `expect(inn.data).not.toBeNull()` to both enrolled controls.

### F4 — Own-path controls omit an explicit error null-check

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/integration/idor.itest.ts:84,143 (and similar)
- **Detail**: `asA` controls assert `data?.length` without first asserting no error; on error the message is misleading (undefined vs the PostgREST error) but not vacuous.
- **Fix**: Add `expect(...error).toBeNull()` to the own-path controls for clearer diagnostics.
- **Decision**: FIXED — added error null-checks to all six idor own-path (asA) controls.
