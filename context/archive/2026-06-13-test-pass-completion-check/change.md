---
change_id: test-pass-completion-check
title: Show a green completion check on passed tests in course nav (like completed lessons)
status: archived
created: 2026-06-13
updated: 2026-06-13
archived_at: 2026-06-13T21:38:09Z
---

## Notes

Gap found in manual QA: lessons that are completed ("Mark as complete") show a green check in the course nav, but a **test passed at ≥ its pass_threshold (default 0.80)** keeps the plain Target icon — no completion indicator. Fix: mark passed tests with the same green `CheckCircle2` in every place tests are listed.

**Required places (tests rendered):**

- `src/components/lesson/LessonsNav.tsx` — chapter "boss" test rows + course final-test row (lesson-page aside).
- `src/pages/courses/[slug]/index.astro` — same two test surfaces on the course overview.

**Data source:** `test_attempts.passed` (own-only RLS). New read helper `getPassedTestIdsForCourse` in `src/lib/services/tests.ts`, mirroring `getCompletedLessonIdsForCourse`. Thread `passed` into `NavTest` for the island; pass a `Set` into the Astro overview.

Behavior-preserving otherwise; no DB/RLS change (data already exists). Test the new service helper.
