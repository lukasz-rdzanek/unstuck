<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Lesson Workspace Shell (S-01)

- **Plan**: `context/changes/lesson-workspace-shell/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-28
- **Verdict (before triage)**: REVISE
- **Verdict (after triage)**: SOUND
- **Findings**: 3 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING (1 finding folded into F2) |
| Plan Completeness | FAIL (3 critical, 2 warnings, 1 observation) → addressed via triage |

## Grounding

9/9 paths ✓, 3/3 symbols ✓, brief↔plan ✓, `context/foundation/lessons.md` absent (skip),
`docs/reference/contract-surfaces.md` absent (skip).

## Findings

### F1 — Cosmic utilities wrap OKLCH tokens in `hsl(…)` — invalid CSS

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Cosmic palette tokens + Cosmic utilities
- **Detail**: Phase 1 instructed tokens as OKLCH literals matching the starter `:root`,
  while the new utilities (`text-cosmic-gradient`, `shadow-cosmic-glow`) referenced them via
  `hsl(var(--primary))`. `hsl(oklch(...))` is invalid CSS — gradients collapse to
  transparent and shadows render `none`, breaking Phase 1's verification with no obvious
  root cause.
- **Fix A ⭐ Recommended**: Bare HSL channel triples + `hsl(var(--token))` everywhere (shadcn-2024 standard).
  - Strength: utilities work as written; one consistent pattern.
  - Tradeoff: two color-space conventions coexist in `global.css` until/unless `:root` is later converted.
  - Confidence: HIGH — canonical shadcn token shape.
  - Blind spot: None significant.
- **Fix B**: Keep OKLCH literals; rewrite utilities to use raw `var(--token)` + `color-mix()` for alpha.
  - Strength: consistent with the starter's `:root`.
  - Tradeoff: per-token alpha story is more code per utility.
  - Confidence: MEDIUM.
  - Blind spot: `color-mix(in oklch, …)` Safari ≥ 16.4 verification needed.
- **Decision**: Fixed via Fix A — token contract switched to bare HSL channel triples.

### F2 — Sign-in flow is unambiguously server-side; Phase 5 punts a decision that's already settled, and silently changes the post-signin fallback

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness + Blind Spots
- **Location**: Phase 5 — Sign-in success `?next=` honoring
- **Detail**: `src/pages/api/auth/signin.ts:19` already does `return context.redirect("/")`
  — 100% server-side, no client-side redirect anywhere in `SignInForm.tsx`. The plan's
  "the implementer reads and decides" punt is a non-decision. Adjacent: the plan switched
  the fallback from `/` (today) to `/courses` without flagging it as a behavior change.
- **Fix ⭐ Recommended**: Pre-commit the server-side contract (SignInForm takes a `next?`
  prop, signin.astro reads `next` from searchParams, hidden input forwards it to the API
  route which validates same-origin and falls back to `safeNext || "/"`); user explicitly
  chooses fallback target.
  - Strength: removes the implementation-time decision; surfaces the fallback choice.
  - Tradeoff: brief's Key Decisions table gains one row.
  - Confidence: HIGH — code paths are unambiguous.
  - Blind spot: signup route is unchanged (continues to `/auth/confirm-email`).
- **Decision**: Fixed via Fix + keep `/` fallback — plan now pre-commits the three coordinated
  edits (signin.astro, SignInForm.tsx, /api/auth/signin.ts) and keeps today's `/` as the
  no-next fallback. Brief's Key Decisions updated.

### F3 — `prose prose-invert` requires `@tailwindcss/typography`, which is not installed

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — Lesson page contract
- **Detail**: The lesson page used `<article class="prose prose-invert max-w-none">` but
  `@tailwindcss/typography` is not in `package.json` and no `prose` references exist in
  `src/`. Without the plugin those classes are no-ops; the plan's "install or write inline
  styles" punt would have spawned hours of typography work mid-Phase-4.
- **Fix A ⭐ Recommended**: Add `@tailwindcss/typography` to the Phase 4 deps step alongside
  `marked`; load via Tailwind v4 `@plugin "@tailwindcss/typography";` in `global.css`.
  - Strength: plugin's `prose-invert` integrates with cosmic dark; ~30 KB SSR'd CSS, zero JS.
  - Tradeoff: one more dep; default sizes may want customization later.
  - Confidence: HIGH.
  - Blind spot: verify Tailwind v4 `@plugin` directive is honored by `@tailwindcss/vite`.
- **Fix B**: Skip the plugin; write minimal cosmic prose styles directly in `global.css`.
  - Strength: full control, no new dep.
  - Tradeoff: 2-3 hours of hand-rolled typography.
  - Confidence: HIGH.
  - Blind spot: new markdown primitives become surprises.
- **Decision**: Fixed via Fix A — `@tailwindcss/typography` added to Phase 4 deps + `@plugin`
  directive in `global.css`; lesson-page contract documents the rationale.

### F4 — Middleware contract references `Astro.url.search` (wrong namespace)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 5 — Middleware lesson gating
- **Detail**: Astro middleware exposes `context`, not the `Astro` namespace.
  `src/middleware.ts:18` already uses `context.url.pathname`. The contract's
  `Astro.url.search` should be `context.url.search`.
- **Fix**: One-word correction in the Phase 5 contract bullet.
- **Decision**: Fixed in plan — both `pathname` and `search` references in the Phase 5
  contract now explicitly use `context.url.*`, citing the existing middleware pattern.

### F5 — `Astro.redirect("/404")` is presented as a valid option (it isn't)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Course detail page
- **Detail**: No `/404` page exists; Astro doesn't auto-generate one for SSR pages — a
  redirect to `/404` would itself 404. The plan offered the correct alternative
  (`Astro.response.status = 404` + cosmic body) but presented the broken option first.
- **Fix**: Drop the broken option; commit to status-code + cosmic-body inside AppLayout.
- **Decision**: Fixed in plan — Phase 3 course-detail contract now commits to
  `Astro.response.status = 404` + cosmic "Course not found" body, with rationale.

### F6 — `export const prerender = false;` is redundant with `output: "server"`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phases 3, 4
- **Detail**: `astro.config.mjs:11` sets `output: "server"`, making SSR the project-wide
  default. The plan added `export const prerender = false;` to every new page — harmless
  but redundant. AGENTS.md's rule about `prerender = false` applies to API routes only.
- **Fix**: Remove the redundant exports from the three page contracts.
- **Decision**: Fixed in plan — all three page contracts now read "SSR by default (no
  per-page `prerender` export needed)" with a note distinguishing the AGENTS.md rule's
  API-route scope.
