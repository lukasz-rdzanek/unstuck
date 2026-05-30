<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Lesson Chapters & Types

- **Plan**: `context/changes/lesson-chapters-and-types/plan.md`
- **Scope**: Full plan (3 phases + epilogue), 4 commits b724b36..9f1ccbf
- **Date**: 2026-05-30
- **Verdict (pre-triage)**: NEEDS ATTENTION
- **Verdict (post-triage)**: APPROVED — all 3 findings handled
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts (pre-triage)

| Dimension            | Verdict |
|----------------------|---------|
| Plan Adherence       | PASS    |
| Scope Discipline     | PASS    |
| Safety & Quality     | WARNING |
| Architecture         | PASS    |
| Pattern Consistency  | PASS    |
| Success Criteria     | PASS    |

## Grounding

- Drift sub-agent: 9 planned file-level changes audited, **9 MATCH / 0 DRIFT / 0 MISSING / 0 EXTRA**. One documented Phase 1 adaptation (1-line lesson page video guard for nullable `video_url`) confirmed.
- Automated checks: `npm run lint` exit 0, `npx astro check` 0 errors / 48 files, `npm run build` exit 0 — all green at HEAD before and after triage edits.

## Findings

### F1 — RLS-gated lessons indistinguishable from genuinely-empty chapter in course detail UI

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (UX)
- **Location**: `src/pages/courses/[slug]/index.astro:46-49` + `src/lib/services/courses.ts:68-83`
- **Detail**: The PostgREST embed `chapters?select=*,lessons(*)` applies lessons RLS row-by-row. When a signed-in user lacks `has_course_access(course_id)` (paid course, no enrollment), the embed returns chapter rows with `lessons: []` per chapter. The page then renders "No lessons in this chapter yet." for every chapter, misleading the user into thinking the course is empty rather than that they need access. Unreachable today (only course is free), real the moment paid courses arrive.
- **Fix A ⭐ Recommended**: Defer + record as parked follow-up gated on paid-course slice.
  - Strength: Ship-over-polish; failure mode unreachable today; explicit parking prevents the bug from being forgotten.
  - Tradeoff: Bug stays in codebase until the paid-course slice picks it up.
  - Confidence: HIGH — current scope makes the failure mode unreachable.
  - Blind spot: Operator-authored empty chapters for the free course would still show the misleading copy — edge case, low likelihood.
- **Fix B**: Fix now via a page-level `has_course_access` probe (RPC wrapper) to switch the placeholder copy.
  - Strength: Closes the bug end-to-end.
  - Tradeoff: Scope creep into S-05 — adds an RPC + service helper not in the plan.
  - Confidence: MED — RPC wrap of the existing SECURITY DEFINER function is straightforward.
- **Decision**: FIXED via Fix A — added a parked entry to `context/foundation/roadmap.md` documenting the bug + the fix scope + the gating on paid-course slice.

### F2 — Emergency revert recipe omits per-course position-collision caveat

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (operator-facing recipe)
- **Location**: `docs/operator/chapters.md:185-218`
- **Detail**: Revert recipe drops `lessons_chapter_id_position_key` and adds `lessons_course_id_position_key UNIQUE (course_id, position)`. Once a course has lessons across multiple chapters with overlapping positions (e.g., chapter A position 1 + chapter B position 1), the ADD CONSTRAINT fails because two rows now share `(course_id, position)`. The BEGIN/COMMIT wrap catches the failure so no data corruption, but an operator in a stressful situation should see the warning before hitting the error.
- **Fix**: Add a pre-flight warning block before the SQL with a collision-detection SELECT and remediation guidance.
- **Decision**: FIXED — added a `⚠️ Pre-flight check` callout above the SQL block with a `SELECT … GROUP BY HAVING COUNT(*) > 1` collision finder and remediation note.

### F3 — `listLessonsForCourse` orphaned after Phase 2

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture (dead code)
- **Location**: `src/lib/services/courses.ts:45-56`
- **Detail**: `listLessonsForCourse` was kept during Phase 1 by design (plan said "keep both during Phase 1; Phase 2 swaps the call site"). Phase 2 swapped to `listChaptersWithLessonsForCourse` but didn't delete the orphaned helper. No production caller; lint doesn't flag it because it's exported.
- **Fix**: Delete the function; re-add when a future slice (e.g., S-07 nav panel) actually needs it.
- **Decision**: FIXED — deleted `listLessonsForCourse` from `src/lib/services/courses.ts`. The `Lesson` type import stays (still used by `getLessonBySlugs` return type).

## Triage summary

| Status        | Findings                | Count |
|---------------|-------------------------|-------|
| Fixed (now)   | F2, F3                  | 2     |
| Fixed (parked follow-up) | F1            | 1     |
| Skipped       | —                       | 0     |
| Accepted      | —                       | 0     |
| Dismissed     | —                       | 0     |

**Verdict after fixes**: APPROVED. All findings handled. F1 is in roadmap parked as a paid-course-gated follow-up; F2 and F3 landed as code/doc edits. All three automated checks (lint / astro check / build) remain green.
