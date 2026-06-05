<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Save Lesson as Markdown

- **Plan**: context/changes/lesson-save-as-markdown/plan.md
- **Scope**: Phase 1 of 1
- **Date**: 2026-06-05
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Both review agents reported a full MATCH on all three planned files; "What We're NOT Doing" honored (no PDF/LLM/bulk/new deps/DB change). Download flow is correct/leak-free and SSR-safe; raw-text export of operator-authored content has no XSS surface; the separate MarkCompleteButton `min-w-[12rem]` tweak correctly equalizes both states with `aria-pressed` preserving toggle a11y. Automated re-verified: `astro check` 0 errors, `npm run lint` 0 errors, no new deps.

## Findings

### F1 — window.location.href interpolated raw into the footer

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/lib/lesson-export.ts:31
- **Detail**: The attribution footer embedded the live page URL as raw text. Inert in the downloaded `.md` (no HTML render → no XSS), but a crafted URL could distort the footer if the file is later opened in a markdown viewer.
- **Fix**: Wrap as an angle-bracket autolink `<${lessonUrl}>` so markdown treats it literally.
- **Decision**: FIXED.

### F2 — MarkCompleteButton concatenates conditional classes (not cn())

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/components/lesson/MarkCompleteButton.tsx:160
- **Detail**: Used a template literal for conditional classes where AGENTS.md prefers `cn()`. Pre-existing; surfaced because the file was in the diff window via the sizing tweak.
- **Fix**: Switch to `cn(baseClasses, completed ? completedClasses : incompleteClasses)` (+ import `cn`).
- **Decision**: FIXED.
