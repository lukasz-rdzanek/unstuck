<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Lesson Workspace Shell (S-01)

- **Plan**: `context/changes/lesson-workspace-shell/plan.md`
- **Scope**: Phases 1–5 (all code phases complete; 18 manual rows pending user batch verification)
- **Date**: 2026-05-28
- **Verdict (initial)**: REJECTED (1 critical FAIL on Safety & Quality)
- **Verdict (after triage)**: APPROVED (F1 fixed, F2–F5 fixed, F6 skipped as accepted UX adaptation)
- **Findings**: 1 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict (initial) | After Triage |
|-----------|-------------------|--------------|
| Plan Adherence | PASS | PASS |
| Scope Discipline | PASS | PASS |
| Safety & Quality | FAIL | PASS (F1 + F3 fixed) |
| Architecture | PASS | PASS |
| Pattern Consistency | WARNING | PASS (F2 + F5 fixed) |
| Success Criteria | PASS | PASS (lint exit 0; astro check 0 errors; build complete) |

## Grounding

- All 16 planned files verified in working tree against plan contracts.
- Three known plan adaptations (Phase 1 :root → HSL channels + @theme inline wrapped in hsl(); Phase 1 bg-cosmic uses hex literals; Phase 4 set:html eslint-disable with documented trust-boundary cross-ref) confirmed present, internally consistent, and self-documenting.
- All five phase commits land cleanly: 442a6cf → c287271 → 141ea38 → ad4b29f → 4228222.
- Two sub-agents (drift detection + safety/pattern) executed in parallel; 16 files independently inspected.

## Findings

### F1 — Open-redirect bypass via `/\evil.com` in isSafeNext

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/signin.ts:9-11 (pre-fix)
- **Detail**: Guard accepted `/\evil.com` because `startsWith("/")` is true and `startsWith("//")` is false. Browsers normalize backslash → forward-slash in Location, so `/\evil.com` resolves to `https://evil.com/`. Sub-agent verified locally: `new URL('/\\evil.com', 'https://app.test').href === 'https://evil.com/'`. Manual row 5.6 passes with `//evil...` test but not the backslash variant — verification corpus was incomplete.
- **Fix**: Replace `startsWith("//")` reject with regex `/^\/(?![/\\])/.test(next)` — starts with `/`, next char is not `/` or `\`.
- **Decision**: FIXED via single-option fix. JSDoc updated to document the rationale.

### F2 — Auth API routes violate AGENTS.md (prerender + zod)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/{signin,signup,signout}.ts
- **Detail**: AGENTS.md mandates `export const prerender = false;` + zod input validation on API routes. None of the three files satisfied either. Worked only because `output: "server"` is project default. signup.ts + signout.ts were pre-existing violations; signin.ts was modified by Phase 5 and preserved the violation.
- **Fix A ⭐ Recommended (chosen)**: Batched all three to compliance — added `export const prerender = false;` to each + zod schemas with `safeParse` for signin (email/password) and signup (email/password min 6). signout has no input, so prerender-only.
- **Fix B**: Strict scope — only signin.ts. Rejected: leaves two stragglers.
- **Decision**: FIXED via Fix A. Also bumped zod (v4) `email` API: `z.email("…")` instead of deprecated `z.string().email("…")`.

### F3 — Lesson video iframe missing `sandbox` and `allow` policy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/courses/[slug]/lessons/[lessonSlug].astro:41-44
- **Detail**: Iframe set `allowfullscreen` + `referrerpolicy="strict-origin"` + `loading="lazy"` but omitted `sandbox` and `allow`. YouTube/Vimeo embeds can request camera/microphone/payment by default. Origin abuse is bounded by `parseVideoUrl` host-allowlist — defense-in-depth, not a known exploit.
- **Fix**: Added `sandbox="allow-scripts allow-same-origin allow-presentation"` + `allow="autoplay; fullscreen; picture-in-picture"`.
- **Decision**: FIXED via single-option fix.

### F4 — Markdown trust boundary is doc-only, not code-checked

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/markdown.ts ↔ supabase/migrations/20260528140054_lesson_chat_rls.sql
- **Detail**: `renderMarkdown` JSDoc correctly cites F-01 RLS as the trust anchor for `set:html`. Consumer at `[lessonSlug].astro:55-58` has matching rationale. But the F-01 RLS migration file did not point back to `src/lib/markdown.ts`. If a future migration relaxes `lessons.INSERT`/`UPDATE` from service_role-only, the markdown path silently becomes XSS-exposed.
- **Fix**: Added a comment block in the F-01 RLS migration on the `lessons` policy section, annotating the bidirectional trust boundary. No SQL semantic change — comment-only.
- **Decision**: FIXED via single-option fix. The migration edit is a no-op on production (Supabase tracks applied migrations by hash of statements only).

### F5 — Two topbars coexist (Topbar.astro + AppTopbar.astro)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/{Topbar,AppTopbar}.astro
- **Detail**: Landing/auth use `Topbar` (hardcoded purple/white); app routes use `AppTopbar` (token-driven). Intentional per Q4 ("tokenize new surfaces only"). Future maintainer touching one likely misses the other.
- **Fix**: Added header comments in both files cross-linking to the sibling and stating the convention boundary.
- **Decision**: FIXED via single-option fix.

### F6 — Catalog card CTA is link, not button (minor plan deviation)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/courses/index.astro:35-37
- **Detail**: Plan contract said cards have "an outline button styled with `bg-primary text-primary-foreground`". Implementation uses a text link "Open course →" with `text-primary`; the entire card is the clickable anchor.
- **Fix**: None required — UX adaptation. Stripping the button avoids nested-interactive-elements anti-pattern (whole card is `<a>`).
- **Decision**: SKIPPED as accepted UX adaptation. Intent (clicking goes to course page) is preserved.
