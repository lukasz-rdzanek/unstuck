<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Lesson nav panel with chat/progress tabs and collapse toggle

- **Plan**: `context/changes/lesson-nav-panel-and-chat-collapse/plan.md`
- **Scope**: Full plan (3 of 3 phases)
- **Date**: 2026-05-31
- **Verdict**: APPROVED (ship-over-polish aligned)
- **Findings**: 0 critical · 2 warnings · 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING (1 observation rolled up) |
| Scope Discipline | PASS |
| Safety & Quality | WARNING (2 findings) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated re-runs at review time: `npm run lint` exits 0, `npx astro check` exits 0 (53 files, 0 errors after orphaned-file deletion), `npm run build` exits 0.

## Findings

### F1 — ChatPanelChrome.tsx orphaned after Phase 2 mount swap

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Quality
- **Location**: `src/components/chat/ChatPanelChrome.tsx` (whole file, 111 lines)
- **Detail**: Plan explicitly acknowledged orphaning would happen after Phase 2 swapped the lesson page mount to `LessonAside`. `grep -r ChatPanelChrome src/` confirmed zero importers (only doc-comment historical refs remained in `ChatPanel.tsx` and `LessonAside.tsx`).
- **Fix**: Delete `src/components/chat/ChatPanelChrome.tsx`. Historical context preserved in `ChatPanel.tsx:30-48` doc comment.
- **Decision**: FIXED — file deleted; doc-comment refs intentionally preserved.

### F2 — handleChatMessageCount callback identity churn → re-fires ChatPanel useEffect

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Reliability
- **Location**: `src/components/lesson/LessonAside.tsx:110-130`
- **Detail**: `useCallback` for `handleChatMessageCount` included `[activeTab, isExpanded]` in its dep array because the body read both. Each tab switch / drawer toggle created a new callback identity, making `ChatPanel.tsx:94-96` `useEffect` (depends on `onMessageCountChange`) re-fire `onMessageCountChange?.(messages.length)`. The `count <= prev` guard made behavior correct, but it was wasted work and a footgun if the contract ever tightened.
- **Fix**: Read `activeTab`/`isExpanded` from refs inside `handleChatMessageCount`; switch dep array to `[]`. Refs update via dedicated useEffects on state change.
- **Decision**: FIXED — added `activeTabRef` + `isExpandedRef` with mirror-effects; callback now stable across renders.

### F3 — Visual plan drifts: cosmic-gradient → solid primary; font-bold → semibold; mobile bar label hardcoded

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `LessonsNav.tsx:62,77` + `LessonAside.tsx:213,236,182`
- **Detail**: Three minor visual deviations from plan: (a) current-lesson highlight uses `border-l-primary bg-primary/10` instead of cosmic-gradient border-image; (b) active tab uses `bg-primary/15 text-primary` pill instead of cosmic-gradient underline; (c) mobile collapsed bar hardcodes "Lesson panel" instead of mirroring the active tab name. None break behavior.
- **Fix**: Skip — visual polish belongs in S-08 brand pass or parked items ([UNS-13](https://linear.app/unstack-ai/issue/UNS-13), [UNS-16](https://linear.app/unstack-ai/issue/UNS-16)).
- **Decision**: SKIPPED — ship-over-polish aligned.

### F4 — `aria-expanded={false}` hardcoded on mobile collapsed bar

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Quality
- **Location**: `src/components/lesson/LessonAside.tsx:179`
- **Detail**: Button only renders when `!isExpanded`, so literal `false` is technically correct. But `aria-expanded={isExpanded}` is more semantically robust and future-proof if conditional render is ever refactored to display-toggle.
- **Fix**: Change `aria-expanded={false}` → `aria-expanded={isExpanded}` (one-line fix).
- **Decision**: FIXED.

### F5 — Promise.all fallback shape is brittle (Set<string> in both branches)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern
- **Location**: `src/pages/courses/[slug]/lessons/[lessonSlug].astro:40-47, 124`
- **Detail**: Initial concern was that mixing Set semantics across the Astro → React-island boundary is brittle. **Discovered during triage**: the Set is intentional. `getCompletedLessonIdsForCourse` returns `Set<string>` because the course detail page (`[slug]/index.astro:64`) needs O(1) `.has(lesson.id)` lookups inside the chapters loop. The `Array.from(...)` at the LessonAside mount call is doing the correct JSON-serialization for the cross-island boundary; `LessonsNav.tsx:29` reconstructs the Set client-side via `useMemo` for the same O(1) lookups. The current pattern (Set on server → array on the wire → Set on client) is idiomatic, not redundant.
- **Fix**: Skip + add a 4-line boundary comment at the LessonAside mount explaining the Set→array→Set pattern is intentional.
- **Decision**: SKIPPED — reframed during triage; added explanatory comment instead.

## Triage summary

- Fixed: F1, F2, F4 (3)
- Skipped: F3 (polish → S-08), F5 (reframed; added boundary comment) (2)
