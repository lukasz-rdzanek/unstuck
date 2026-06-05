# Site-wide Light Theme with Sun/Moon Toggle — Plan Brief

> Full plan: `context/changes/site-wide-light-theme/plan.md`

## What & Why

Add a full-site light theme alongside the existing dark "cosmic" theme, with a global sun/moon toggle. Today the app is dark-only and the theme is hardcoded; this gives users a choice (and honors their OS preference) while keeping the brand identity in a designed "cosmic dawn" light counterpart — not a generic light mode.

## Starting Point

Dark is hardcoded via a `.dark` class on two wrapper divs (`AppLayout.astro`, `Welcome.astro`); `<html>` has no class and there's no toggle or persistence. Tokens exist (`:root` light / `.dark` cosmic) but `:root` is a bland neutral-gray starter palette, and ~111 usages across 23 files hardcode dark-only colors (`text-white`, `bg-white/5`, cyan/green/yellow tints) that won't flip on their own.

## Desired End State

A sun/moon button on every page flips the whole site instantly (brief cross-fade) and remembers the choice across reloads and navigation. First-time visitors get their OS preference with no flash; returning visitors are themed server-side (works with JS off). Landing, auth, dashboard, catalog, course, lesson, and chat all look intentional and legible in both themes.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Light aesthetic | Cosmic dawn | Keep brand continuity in light, not a generic admin look | Plan |
| Starfield/orbs in light | Soften & recolor (var-driven) | Preserve depth in both themes from one token system | Plan |
| First-visit default | Follow OS `prefers-color-scheme` | Meets expectations; user-stated fallback | Plan |
| Accents in light | Keep violet/cobalt, deepen for contrast | Brand-consistent + accessible on light surfaces | Plan |
| Persistence/FOUC | Hybrid: cookie + SSR middleware + inline head script | No flash in any case; SSR-authoritative; works JS-off for returning users | Plan |
| Toggle placement | In the topbars beside the account controls; dashboard gains the in-app topbar; bare auth pages get a standalone corner toggle | Conventional spot next to account data, present on every view | Plan (revised) |
| Switch animation | Brief ~250ms cross-fade, scoped to toggle | Polished without firing on load/hover | Plan |
| Control form | Sun/moon icon button | Compact, conventional, two-state | Plan |
| Status tints | Semantic `--success/--info/--warning` tokens | One source of truth, correct contrast per theme | Plan |
| Glass surfaces | `--glass-bg` / `--glass-border` tokens | One knob for the frosted look in both themes | Plan |
| Banner / avatars | Theme the Banner; leave avatars | Fix the real mismatch, avoid low-value churn | Plan |
| Scope | Theme only, no redesign | Bounded, shippable, low regression risk | Plan |

## Scope

**In scope:** root-level theme control + persistence; cosmic-dawn light palette; status + glass + cosmic-motif tokens; sun/moon toggle + cross-fade; converting all ~111 hardcoded usages across landing/auth/dashboard + in-app surfaces; Banner dark variants.

**Out of scope:** light-mode alpaca artwork variant; layout/component redesign; `chart-*`/`sidebar-*` tokens; a "System" entry in the toggle UI; the parked SignInForm button-shape fix (#132); custom video player.

## Architecture / Approach

One source of truth: a `.dark` class on `<html>`. Middleware reads a `theme` cookie → `locals.theme` → Layout renders the class server-side; an inline head script resolves system preference on first visit pre-paint. A `ThemeToggle` island (mounted globally by Layout) flips the class, writes the cookie + localStorage mirror, and triggers a scoped cross-fade. Everything visual resolves through tokens in `global.css`, so flipping the root class re-themes the entire tree.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Token foundation + cosmic-dawn palette | CSS tokens for both themes; motifs var-driven; dark unchanged | Palette contrast tuning |
| 2. Root theme control + persistence | `<html>`-level theme, cookie/SSR/inline-script, toggle + cross-fade | FOUC + React hydration mismatch |
| 3. Convert landing/auth/dashboard | ~70 hardcoded usages → tokens; correct in both themes | Largest sweep; glass/orb tuning on light |
| 4. Convert in-app + status tokens + banners | cyan/green/yellow → semantic tokens; banners themed | Missed spots; status contrast |

**Prerequisites:** none (builds on current code).
**Estimated effort:** ~3–4 sessions across 4 phases; Phases 3–4 are the bulk (mechanical sweeps + visual tuning).

## Open Risks & Assumptions

- FOUC/hydration is the main technical risk — mitigated by the inline-script-first ordering and reading toggle state from the DOM at mount.
- Cosmic-dawn palette values in the plan are a starting point; expect contrast tuning during manual verify.
- Light mode looks incomplete after Phase 2 until the Phase 3–4 sweeps land — by design, not a regression.
- The single fixed toggle needs a position that clears both topbars and the lesson mobile chat drawer (top-right with topbar right-padding).

## Success Criteria (Summary)

- Sun/moon toggle flips and persists the theme on every surface, in both themes.
- No flash of wrong theme on first or repeat visits; returning visitors themed with JS disabled.
- Every user-facing surface is legible and on-brand in both light and dark; no hardcoded dark-only colors remain.
