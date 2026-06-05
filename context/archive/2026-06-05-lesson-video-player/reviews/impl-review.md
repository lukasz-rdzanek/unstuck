<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Rich Custom Video Player (Plyr)

- **Plan**: context/changes/lesson-video-player/plan.md
- **Scope**: Phases 1–4 (all)
- **Date**: 2026-06-05
- **Verdict**: APPROVED (2 minor warnings)
- **Findings**: 0 critical · 2 warnings · 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated success criteria re-run at review: `npx astro check` → 0 errors; `npm run lint` → 0 errors (17 pre-existing warnings); `npm run build` → Complete. All manual rows verified by the user across phases + prod smoke (`/` + `/courses` → 200).

Reviewers confirmed correct: SSR safety (Plyr dynamically imported, never at module scope), no XSS via the injected button's `innerHTML` (only static constants interpolated; no props reach it), echo-loop guard sound (single dispatcher `setCollapsedAndBroadcast`, listeners never re-broadcast), Plyr `destroy()` on unmount, dynamic-import race guarded (`cancelled` + `host.isConnected`), bundle isolation (Plyr off shared chunks), localStorage try/catch parity with `LessonAside`.

## Findings

### F1 — Injected cinema button not explicitly removed on teardown

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/components/lesson/LessonVideoPlayer.tsx:129-131
- **Detail**: Effect cleanup nulled `cinemaBtnRef.current` and called `player.destroy()` but never `btn.remove()`. Worked in practice (Plyr 3.8.4 `destroy()` GCs the orphan) but relied on Plyr internals; a future config preserving the host element would leak the click listener. The button mounts/unmounts every lesson navigation.
- **Fix**: Call `cinemaBtnRef.current?.remove()` before nulling the ref in cleanup.
- **Decision**: FIXED

### F2 — Plyr control-surface tokens not overridden (partial vs Phase 2 contract)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/styles/global.css:297-306
- **Detail**: The `.plyr` block maps color-main/focus/badge/menu/tooltip to cosmic tokens but not `--plyr-video-control-color` / `--plyr-video-control-background-hover`. Plyr's defaults (white-on-translucent) are legible over the dark video stage in both themes, so the omission is cosmetic.
- **Fix**: Either add the two `--plyr-video-control-*` overrides, or accept Plyr's defaults as intentional.
- **Decision**: ACCEPTED — Plyr's white-on-translucent controls read fine over the video surface in both light and dark; defaults kept intentionally over the video stage. No code change.

### F3 — writeCollapsed exported but has no external caller

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/lesson/aside-collapse.ts:33
- **Detail**: Only `setCollapsedAndBroadcast` used `writeCollapsed` internally; nothing imported it. Exporting widened the contract's public surface for no consumer.
- **Fix**: Drop the `export` on `writeCollapsed` (module-private).
- **Decision**: FIXED

### F4 — YouTube id not shape-validated (asymmetric with Vimeo's /^\d+$/)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/lib/video-embed.ts:38,45
- **Detail**: Not a vuln — `video_url` is operator-authored (service_role-only INSERT/UPDATE per F-01 RLS) and the id only reaches `data-plyr-embed-id` (React-escaped) + Plyr's API. Just an asymmetry: Vimeo validated numeric, YouTube didn't.
- **Fix**: Validate the YouTube id against `^[A-Za-z0-9_-]{11}$` so malformed URLs fall through to UNKNOWN.
- **Decision**: FIXED

## Triage summary

- **Fixed**: F1, F3, F4 (3)
- **Accepted**: F2 (1)
- **Skipped**: none
