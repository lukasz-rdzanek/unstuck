<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Lesson Completion Tracking

- **Plan**: `context/changes/lesson-completion-tracking/plan.md`
- **Scope**: Full plan (3 phases + epilogue), 4 commits efd7a43..c090c78
- **Date**: 2026-05-31
- **Verdict (pre-triage)**: APPROVED (≤2 minor warnings; both LOW-impact)
- **Verdict (post-triage)**: APPROVED — all 3 findings fixed
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

- Drift sub-agent: 11 planned file-level changes audited, **11 MATCH / 0 DRIFT / 0 MISSING / 0 EXTRA**. The documented 3.4 adaptation (401 → 403 due to Astro CSRF firing before auth) is purely a success-criterion adjustment, no code drift.
- Automated checks: `npm run lint` exit 0, `npx astro check` 0 errors / 51 files, `npm run build` exit 0 — green before and after triage edits.
- Safety/quality agent: lots of positive observations on the RLS posture (correct USING/WITH CHECK predicate positions, server-side user_id derivation, Cell 6 mechanically asserts own-only enforcement). 2 LOW-impact warnings + 1 observation worth triaging.

## Findings

### F1 — errorTimerRef leaks setTimeout on unmount within 3s window

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: `src/components/lesson/MarkCompleteButton.tsx:21, 67-72`
- **Detail**: `errorTimerRef` was set in `finally` (line 67-71) but never cleared on component unmount. If the user navigates away within the 3-second auto-clear window after a failed save, the setTimeout fires `setError(null)` on an unmounted component. React 18+ silently ignores state-after-unmount so no visible breakage, but the closure holds for up to 3s post-unmount (memory + callback ref). Real leak even if invisible.
- **Fix**: Add a mount-only `useEffect` cleanup that clears the timer ref on unmount.
- **Decision**: FIXED — added `useEffect(() => () => { if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); errorTimerRef.current = null; } }, [])` at the top of the component with an explanatory comment.

### F2 — Course detail page issues two awaits sequentially where Promise.all would parallelise

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (performance)
- **Location**: `src/pages/courses/[slug]/index.astro:15-21`
- **Detail**: `listChaptersWithLessonsForCourse` and `getCompletedLessonIdsForCourse` ran sequentially via two separate `await`s. No data dependency between them — both depend only on `course.id` and `userId`. On the Cloudflare Workers → Supabase pop path each round-trip is ~50-150ms; running them in parallel saves the slower of the two. Low-impact today (one course, one lesson) but baked into the render path of every course visit.
- **Fix**: Wrap in `Promise.all` and destructure both results.
- **Decision**: FIXED — replaced the two sequential awaits with `const [chapters, completedLessonIds] = await Promise.all([...])` and an explanatory comment noting the rationale (independent queries, saves one Worker→Supabase round-trip).

### F3 — Bare `catch {}` in MarkCompleteButton assumes network-only failure

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: `src/components/lesson/MarkCompleteButton.tsx:62`
- **Detail**: The `catch {}` block caught anything `fetch` and its consumers threw — network errors, AbortError, malformed URL RangeErrors. The user-facing message "Network error — try again in a moment." was wrong for non-network throws. In practice, `fetch` to a same-origin static URL only throws on network failure or abort, so this was more theoretical than a real bug.
- **Fix**: Discriminate on `err instanceof TypeError` (real network failure) vs other throws (generic "Couldn't save — try again.").
- **Decision**: FIXED — `catch (err)` with TypeError discrimination + explanatory comment noting which class of error each branch covers.

## Triage summary

| Status        | Findings                | Count |
|---------------|-------------------------|-------|
| Fixed (now)   | F1, F2, F3              | 3     |
| Skipped       | —                       | 0     |
| Accepted      | —                       | 0     |
| Dismissed     | —                       | 0     |

**Verdict after fixes**: APPROVED. All findings landed as code edits. Three automated checks (lint / astro check / build) remain green.
