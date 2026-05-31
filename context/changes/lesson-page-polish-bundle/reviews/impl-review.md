<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Lesson Page UX Polish Bundle

- **Plan**: `context/changes/lesson-page-polish-bundle/plan.md`
- **Scope**: Full plan (2 of 2 phases)
- **Date**: 2026-05-31
- **Verdict**: APPROVED (post-triage — 3 warnings fixed, 1 observation skipped)
- **Findings**: 0 critical · 3 warnings · 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS (all 6 sub-items MATCH, 3 documented mid-flight adaptations) |
| Scope Discipline | PASS (no EXTRA, no surprises) |
| Safety & Quality | WARNING → PASS post-fix |
| Architecture | PASS |
| Pattern Consistency | WARNING → PASS post-fix |
| Success Criteria | PASS (lint + astro check + build re-run green) |

## Findings

### F1 — profiles.ts swallows all Supabase errors as "zero rows"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/lib/services/profiles.ts:31-36`
- **Detail**: `if (error)` branch returned email-fallback regardless of error type. Real failures (network, RLS, schema drift) were silently swallowed, indistinguishable from PGRST116 zero-rows. Sibling `courses.ts:36-39` distinguishes via `error.code !== NOT_FOUND_CODE` check + `console.error`.
- **Fix**: Added `NOT_FOUND_CODE = "PGRST116"` constant + `error.code !== NOT_FOUND_CODE` branch with `console.error("[profiles] getDisplayNameOrFallback failed:", error.message)`. Email-fallback path unchanged for the expected zero-rows case. Matches courses.ts convention exactly.
- **Decision**: FIXED.

### F2 — AppTopbar adds duplicate Supabase query per in-app page render

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (performance)
- **Location**: `src/components/AppTopbar.astro:14-15`
- **Detail**: AppTopbar created a Supabase SSR client + 1-row `profiles` query per in-app render. lessonSlug.astro:30-31 already did the same query separately — duplicate round-trip on the lesson page (~50-150ms wasted). Plan acknowledged the cost but assumed it was unavoidable.
- **Fix**: Hoisted display_name resolution into `src/middleware.ts` as `Astro.locals.displayName`. Extended `src/env.d.ts` Locals interface. Stripped the duplicate query + import from AppTopbar.astro and lessonSlug.astro; both now read from locals. Single query per signed-in request, regardless of how many components need display_name.
- **Decision**: FIXED via Fix A.

### F3 — Universal `*::-webkit-scrollbar` over-styles every scroll container

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (quality)
- **Location**: `src/styles/global.css:186-202`
- **Detail**: Universal `*::-webkit-scrollbar` cascade restyled EVERY scroll container in the app — shadcn popovers, `<select>` dropdowns, future inner-scroll surfaces. Was a deliberate choice ("apply globally so the whole page matches") but broader than needed.
- **Fix**: Scoped the cascade to `html, body, .chat-scroll, [data-cosmic-scroll]` instead of `*`. Document scroller still cosmic-styled; `.chat-scroll` opt-in preserved; new `[data-cosmic-scroll]` attribute available for opt-in on future scroll containers. Third-party widgets / dropdowns fall back to native.
- **Decision**: FIXED.

### F4 — `prose-invert` hardcoded on lesson article (light-mode regression risk)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Quality (adjacent, pre-existing)
- **Location**: `src/pages/courses/[slug]/lessons/[lessonSlug].astro:169`
- **Detail**: `prose-invert` is unconditional — when the light theme lands (UNS-16, parked), article body will be unreadable on a light background. Pre-existing pattern, NOT introduced by this slice.
- **Fix**: Skip — will naturally bundle into UNS-16 (Light theme + toggle) when un-parked.
- **Decision**: SKIPPED.

## Triage summary

- Fixed: F1, F2, F3 (3)
- Skipped: F4 (1, pre-existing + future-slice scope)
