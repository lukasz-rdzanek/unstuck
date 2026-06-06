<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Course Learning Loop (learning-loop)

- **Plan**: context/changes/learning-loop/plan.md
- **Scope**: Phases 1–4 (all)
- **Date**: 2026-06-07
- **Verdict**: APPROVED
- **Findings**: 0 critical · 0 warnings · 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated re-run at review: `npx astro check` → 0 errors; `npm run lint` → 0 errors (30 pre-existing warnings); `npm run build` → Complete.

🔒 **Answer-key verdict: PROTECTED** — verified across 5 vectors: no `authenticated` SELECT on `question_options`; no embed/join leak; definer fns omit `is_correct`; `correctOptionIds` only returned post-submit; client bundle clean. Grading sound (all-or-nothing, sorted-set match, zero-correct & cross-question ids handled); no injection; auto-schedule best-effort/non-fatal; `applyRating` cross-table reuse structurally sound.

## Findings

### F1 — Answer-key protection rests on a non-obvious, load-bearing invariant

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — worth a deliberate record
- **Dimension**: Architecture / Safety
- **Location**: supabase/migrations/20260606170000_tests_schema.sql:9-15, 90-93
- **Detail**: The feature's security depends on `question_options` being RLS-ENABLED-but-not-FORCED + the definer fns being owned by the table owner (postgres). A future migration adding an authenticated SELECT policy, recreating the fns under a non-owner role, or adding FORCE would silently leak the key or break grading.
- **Fix**: Record as a /10x-lesson so future migrations preserve the invariant.
- **Decision**: ACCEPTED-AS-RULE — recorded in `context/foundation/lessons.md` ("Quiz answer-key protection — enable-not-force RLS + definer-owned functions"). No code change (the invariant is correctly implemented today).

### F2 — No-access indistinguishable from an empty test

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260606170000_tests_schema.sql:117-118 (get_test_questions)
- **Detail**: Both no-access and a genuinely empty test return `[]`; the page renders a zero-question quiz rather than a "no access" state. No leak — cosmetic.
- **Fix**: Optional — treat empty-questions-on-existing-test as a soft gate.
- **Decision**: DEFERRED (acceptable for MVP).

### F3 — Attempt row persisted for a zero-question / empty submission

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality (data quality)
- **Location**: supabase/migrations/20260606170000_tests_schema.sql:165-187 (submit_test_attempt)
- **Detail**: An empty test inserts a 0%/failed attempt row. Minor data-quality nit; not a correctness/security issue.
- **Fix**: Optional — guard `if v_total = 0 then` to skip persistence.
- **Decision**: DEFERRED.

### F4 — Service helper names differ from the plan

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/tests.ts
- **Detail**: `getTakingQuestions`/`listTestsForCourse`/`getTestBySlug` vs the plan's `getTestForTaking`/`listTestsForScope`; `get_test` split into a questions RPC + an RLS-gated meta SELECT (arguably cleaner). Behavior-equivalent, same security posture.
- **Fix**: None — cosmetic.
- **Decision**: ACCEPTED (as-is).

## Triage summary

- **Accepted-as-rule**: F1 (lesson recorded)
- **Accepted**: F4
- **Deferred**: F2, F3

Pre-cleared deviations (confirmed in code): uuid validation relaxed `z.uuid()` → syntax regex (Postgres-lenient for non-v4 ids); roadmap not updated (post-MVP tracked in Linear UNS-24).
