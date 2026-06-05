<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Site-wide Light Theme with Sun/Moon Toggle

- **Plan**: context/changes/site-wide-light-theme/plan.md
- **Scope**: All 4 phases
- **Date**: 2026-06-03
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 3 observations (+1 follow-up bug found during review)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — destructive button text-white not converted per plan contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/ui/button.tsx:14
- **Detail**: Phase 4 contract said `text-white → text-destructive-foreground`. The destructive variant still hardcodes `text-white`. Reads fine (white on dark-red in both themes; shadcn stock variant).
- **Decision**: ACCEPTED-AS-RISK — white-on-destructive-red is legible in both themes; treated as a documented white-on-colored exception alongside the avatar initial (MessageBubble.tsx:33). No code change.

### F2 — stale comment on text-cosmic-gradient (claims gray on light)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/styles/global.css:194-196
- **Detail**: Comment said the gradient resolves to gray outside `.dark`; actually `--primary`/`--accent` exist in `:root` too, so it renders violet→cobalt on light. Behavior correct; comment misleading.
- **Decision**: FIXED — comment updated to state it resolves to primary→accent in both themes.

### F3 — first-visit SSR(dark) → inline-script(light) pre-paint flip

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Reliability
- **Location**: src/middleware.ts ↔ src/layouts/Layout.astro (head script)
- **Detail**: Middleware defaults SSR theme to dark; the head script switches a light-OS first-time visitor to light before paint. No visible flash (synchronous, pre-paint) and no hydration warning. Intentional — true SSR OS-detection needs `Sec-CH-Prefers-Color-Scheme` client hints.
- **Decision**: ACCEPTED + documented — added a comment at middleware.ts explaining the intentional asymmetry so it isn't "fixed" later.

### F4 — theme cookie missing Secure attribute

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Security
- **Location**: src/components/ThemeToggle.tsx:10, src/layouts/Layout.astro (head script)
- **Detail**: Cookie was `path=/; max-age=…; SameSite=Lax` with no `Secure`. Value is non-sensitive ("light"/"dark"), never user-controlled; httpOnly correctly omitted (client reads it).
- **Decision**: FIXED — append `; Secure` when `location.protocol === "https:"` (so http localhost dev still works), in both the toggle and the inline head script.

### F5 — theme-anim removal timer not cleared on rapid re-toggle

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Reliability
- **Location**: src/components/ThemeToggle.tsx (toggle setTimeout)
- **Detail**: Each click schedules a 300ms class-removal timer without clearing a prior one; a fast re-click could end the cross-fade early. Cosmetic.
- **Decision**: SKIPPED — not worth a ref guard; further reduced by the F6 cross-fade rework.

### F6 — scrollbar flicker when toggling theme in the course/lesson view (found during review)

- **Severity**: ⚠️ WARNING (user-reported bug)
- **Impact**: 🔎 MEDIUM
- **Dimension**: Reliability
- **Location**: src/styles/global.css (`.theme-anim` cross-fade)
- **Detail**: The cross-fade transitioned `background-color` on every element (`.theme-anim *`). On backdrop-blur panels and scroll containers this forces a per-frame repaint, which made the scrollbar flicker during the toggle.
- **Decision**: FIXED — `background-color` now transitions only on the page surfaces (`html` / `body` / `.bg-cosmic`); text + borders still fade everywhere; descendants excluded from the bg transition.
