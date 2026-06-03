# Site-wide Light Theme with Sun/Moon Toggle — Implementation Plan

## Overview

Add a full-site light theme alongside the existing dark "cosmic" theme, controlled by a single root-level `.dark` class and a global sun/moon toggle. The light theme is a designed "cosmic dawn" counterpart (not dark-mode-with-the-lights-on): soft lavender surfaces, deepened violet/cobalt accents, and softened-and-recolored starfield/orbs. Theme is persisted (cookie + localStorage), applied server-side via middleware for returning visitors, and resolved from `prefers-color-scheme` on first visit via an inline head script — no flash of wrong theme (FOUC). All ~111 hardcoded, theme-locked utility usages across 23 files are converted to theme-aware tokens.

## Current State Analysis

- **Theme variant**: `src/styles/global.css:6` defines `@custom-variant dark (&:is(.dark *))` — dark mode activates for any descendant of a `.dark` element. `:root` (lines 8–46) holds a neutral-gray light palette; `.dark` (lines 48–83) holds the cosmic palette; `@theme inline` (lines 85–123) maps both to Tailwind utilities via `hsl(var(--token))`.
- **`.dark` is hardcoded on two wrapper divs**: `src/layouts/AppLayout.astro:13` and `src/components/Welcome.astro:6`. `<html>`/`<body>` carry no class (`src/layouts/Layout.astro:14,21`). There is no toggle and no persistence.
- **Two surface groups**:
  - *Landing/auth/dashboard* — `index` (Welcome), `auth/signin`, `auth/signup`, `auth/confirm-email`, `dashboard` use `Layout` directly with a per-page hardcoded `bg-cosmic` and heavy hardcoded glass/text styling (`text-white`, `text-blue-100/NN`, `bg-white/5`, `border-white/10`, `bg-gradient-to-r from-blue-200 to-purple-200`). Only Welcome renders `Topbar`; **signin/signup/confirm/dashboard have no topbar at all**.
  - *In-app* — `courses/index`, `courses/[slug]/index`, `courses/[slug]/lessons/[lessonSlug]` use `AppLayout` (`.dark` + cosmic tokens), mostly token-driven but with hardcoded `text-cosmic-gradient`, `shadow-cosmic-glow`, and cyan/green/yellow accent tints.
- **Full inventory**: ~111 theme-locked usages across 23 files (see References → inventory). React islands hydrate via `client:load`. A defensive localStorage helper already exists (`src/components/lesson/LessonAside.tsx:46–64`). Middleware (`src/middleware.ts`) reads cookies and sets `context.locals` (`user`, `displayName`); `src/env.d.ts` is where `App.Locals` is typed. Middleware **cannot set** cookies (set them client-side).
- **Cosmic utilities** (`global.css`): `bg-cosmic` (hardcoded hex gradient), `bg-cosmic-starfield` (white radial dots), `text-cosmic-gradient` (primary→accent, already token-driven), `shadow-cosmic-glow` (primary-based, already token-driven).

## Desired End State

- A global sun/moon icon button appears on every page. Clicking it flips the entire site between dark (cosmic) and light (cosmic dawn) instantly with a brief cross-fade, and the choice persists across reloads and navigation.
- First-time visitors with no saved preference get their OS `prefers-color-scheme`, applied before first paint (no flash). Returning visitors get their saved theme rendered server-side (works even with JS disabled).
- Light mode looks intentional and on-brand everywhere: landing, auth, dashboard, catalog, course, lesson, chat — surfaces, text, glass panels, status tints (success/info/warning/error), starfield/orbs, and banners all read correctly in both themes.
- No hardcoded dark-only colors remain on user-facing surfaces; everything resolves through tokens.

**Verification**: toggle on every surface in both themes; reload + cross-page persistence; throttled first load shows no FOUC; `npm run build`, `npx astro check`, `npm run lint` all pass.

### Key Discoveries

- Dark activates via `.dark` *ancestor* — moving the single source of truth to `<html>` (server-rendered from a cookie) flips the whole tree (`global.css:6`).
- `text-cosmic-gradient` and `shadow-cosmic-glow` already derive from `--primary`/`--accent`, so they auto-adapt once the light palette keeps cosmic accents — no per-use changes needed for those two.
- signin/signup/confirm/dashboard render **without** `.dark` today and only look dark because of hardcoded white-on-`bg-cosmic`; this is exactly why a global root-level theme is needed (`src/pages/auth/*.astro`, `src/pages/dashboard.astro`).
- Avatars use `hsl(h,60%,50%)` (`src/components/chat/avatar-color.ts`) which reads fine on both themes — intentionally left alone.
- Banner.astro uses fixed light-colored banners that look out of place on the cosmic dark bg — needs dark variants.

## What We're NOT Doing

- No light-mode variant of the alpaca artwork (the gradient mark works on both; its glow becomes token-driven but the design is unchanged).
- No redesign of layouts, components, or the topbars beyond what theming requires.
- No changes to the unused `chart-*` / `sidebar-*` tokens (left at starter values).
- No "System" entry in the toggle UI — it's a two-state sun/moon icon button (system pref is still honored on first visit). Re-selecting "follow system" later is out of scope.
- Not folding in the parked SignInForm button-shape fix (#132) — theming only touches its colors.
- No custom video player, no new icon library (reuse the inline-SVG pattern already in Welcome.astro / lucide if already present).

## Implementation Approach

Build the token system and the cosmic-dawn palette first (invisible groundwork that leaves dark unchanged), then move theme control to `<html>` with the full persistence mechanism (light becomes reachable), then sweep the two surface groups to be token-driven. Each phase is independently verifiable; light mode is only visually complete after Phases 3–4, which is called out so partial states aren't mistaken for regressions.

## Critical Implementation Details

- **No-FOUC ordering**: the inline theme script must be the first executable thing in `<head>` (synchronous, before the stylesheet link is parsed for paint) so it can set `documentElement.classList` pre-paint on first visit. Middleware-set SSR class covers returning visitors so the script is a confirming no-op for them.
- **Hydration safety**: the `ThemeToggle` island must read its current state from `document.documentElement.classList` at mount (not from a server prop), so SSR/client never disagree and React doesn't warn or flip the class on hydrate.
- **Cross-fade scoping**: the color transition must be applied only during an explicit user toggle (add a `theme-anim` class to `<html>` for ~250ms, then remove), never globally — otherwise it fires on initial load and on every hover/focus token change.
- **Cookie is client-writable**: `theme` cookie is set via `document.cookie` (in both the inline script and the toggle), `path=/`, `SameSite=Lax`, `max-age` ~1 year, **not** httpOnly. Middleware only reads it.

---

## Phase 1: Token foundation + cosmic-dawn palette

### Overview

Define the complete token system so both themes resolve correctly, and design the cosmic-dawn light palette — all in `global.css`. No markup changes; dark stays visually identical because `.dark` is still hardcoded on the wrappers.

### Changes Required

#### 1. Cosmic-dawn light palette

**File**: `src/styles/global.css` (`:root` block)

**Intent**: Replace the neutral-gray starter light palette with a designed "cosmic dawn" palette — light cool-violet surfaces, deepened violet primary / cobalt accent that pass contrast on light, matching the dark palette's token names 1:1.

**Contract**: Keep bare HSL channel triples (shadcn convention). Proposed starting values (tune during manual verify):

```css
:root {
  --radius: 0.625rem;
  --background: 240 40% 98%;        /* soft lavender-white */
  --foreground: 240 30% 12%;        /* deep violet-ink */
  --card: 240 45% 99%;
  --card-foreground: 240 30% 12%;
  --popover: 240 45% 99%;
  --popover-foreground: 240 30% 12%;
  --primary: 263 70% 52%;           /* violet, deepened vs dark's 62% */
  --primary-foreground: 0 0% 100%;
  --secondary: 240 30% 94%;
  --secondary-foreground: 240 30% 18%;
  --muted: 240 30% 94%;
  --muted-foreground: 240 12% 40%;
  --accent: 224 80% 52%;            /* cobalt, deepened */
  --accent-foreground: 0 0% 100%;
  --destructive: 0 72% 48%;
  --border: 240 24% 88%;
  --input: 240 24% 88%;
  --ring: 263 70% 58%;
  /* chart-* / sidebar-* unchanged (starter values) */
}
```

#### 2. Semantic status tokens (success / info / warning) — both palettes

**File**: `src/styles/global.css` (`:root`, `.dark`, `@theme inline`)

**Intent**: Add reusable status tokens so the scattered cyan/green/yellow tints (lesson tabs, Mark-Complete, sign-in resend) become one source of truth with correct per-theme contrast. Error already exists as `--destructive`.

**Contract**: Add `--success`, `--success-foreground`, `--info`, `--info-foreground`, `--warning`, `--warning-foreground` to both `:root` and `.dark`; expose `--color-success`/`--color-info`/`--color-warning` (+ `-foreground`) in `@theme inline` so `bg-success/10`, `text-info`, `border-warning/30` etc. work. Light values darker, dark values brighter, e.g. dark: `--info: 190 80% 62%`, light: `--info: 190 70% 38%`; dark: `--success: 145 60% 55%`, light: `--success: 145 55% 36%`; dark: `--warning: 45 90% 60%`, light: `--warning: 38 92% 44%`.

#### 3. Glass-surface tokens — both palettes

**File**: `src/styles/global.css` (`:root`, `.dark`, `@theme inline`)

**Intent**: Replace the hardcoded frosted-glass look (`bg-white/5` + `border-white/10`) with theme-aware tokens so panels/cards/topbars frost correctly on light too.

**Contract**: Add `--glass-bg` and `--glass-border` (full color values incl. alpha, not bare triples — they encode translucency). Dark: `--glass-bg: 0 0% 100% / 0.05`, `--glass-border: 0 0% 100% / 0.10`. Light: `--glass-bg: 240 40% 100% / 0.55`, `--glass-border: 240 20% 40% / 0.12`. Expose as `--color-glass` / `--color-glass-border` in `@theme inline` so `bg-glass` / `border-glass` utilities resolve. (If alpha-in-token interplay with Tailwind opacity modifiers is awkward, define them as ready-to-use `background`/`border-color` values consumed via a small `@utility glass-panel {…}` instead — implementer picks the cleaner of the two during Phase 1.)

#### 4. Make cosmic motifs theme-aware (bg-cosmic, starfield, orbs)

**File**: `src/styles/global.css` (cosmic `@utility` blocks + new motif vars in `:root`/`.dark`)

**Intent**: Drive the cosmic background gradient, starfield dot color/opacity, and the glow-orb colors from CSS vars so they recolor between themes from one definition — "soften & recolor" in light rather than hide.

**Contract**: Introduce `--cosmic-bg` (gradient), `--star-color`, `--star-opacity`, and orb color vars in both palettes. Rewrite `@utility bg-cosmic` to `background-image: var(--cosmic-bg);` and `@utility bg-cosmic-starfield` to consume `var(--star-color)`/`var(--star-opacity)`. Dark: current dark gradient + white stars. Light: `--cosmic-bg: linear-gradient(to bottom,#f6f5ff,#eef1fb,#f6f5ff)`, stars as low-alpha violet-ink dots (e.g. `--star-color: 240 30% 30%`, `--star-opacity: 0.06`). `text-cosmic-gradient` and `shadow-cosmic-glow` need no change (already `--primary`/`--accent`-based). Provide light orb color vars (muted violet/blue blooms) for Phase 3 to consume.

### Success Criteria

#### Automated Verification

- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Dark theme is visually unchanged from before (app still hardcodes `.dark`).
- Temporarily removing `.dark` from one wrapper renders the cosmic-dawn light palette with legible text (spot check before reverting).

**Implementation Note**: After automated verification passes, pause for human confirmation before Phase 2.

---

## Phase 2: Root-level theme control + persistence (mechanism)

### Overview

Move the single source of truth to `<html>`, wire cookie + middleware + inline script for no-FOUC, remove the two hardcoded `dark` wrappers, and add the global sun/moon toggle with a brief cross-fade. After this phase the whole site flips and persists; not-yet-converted surfaces will still look dark-styled in light mode (expected, fixed in Phases 3–4).

### Changes Required

#### 1. Type the theme local

**File**: `src/env.d.ts`

**Intent**: Add a typed `theme` field to `App.Locals` for middleware to populate.

**Contract**: `theme: "light" | "dark"` on `App.Locals`.

#### 2. Read theme cookie in middleware

**File**: `src/middleware.ts`

**Intent**: Resolve the active theme from the `theme` cookie and expose it on `context.locals` so the layout can render the correct class server-side.

**Contract**: Read `context.cookies.get("theme")`; set `context.locals.theme = value === "light" ? "light" : "dark"` (default `dark` when absent/invalid). No cookie writing here.

#### 3. Apply theme at the root + inline no-FOUC script

**File**: `src/layouts/Layout.astro`

**Intent**: Render the theme class on `<html>` from `Astro.locals.theme`, and add a synchronous inline head script that, on first visit (no cookie), resolves `prefers-color-scheme`, applies the class pre-paint, and writes the cookie so subsequent SSR matches.

**Contract**: `<html class={Astro.locals.theme === "dark" ? "dark" : undefined}>`. First child of `<head>`: an inline `<script is:inline>` that reads `document.cookie` for `theme`; if absent, computes `window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"`, sets `document.documentElement.classList.toggle("dark", …)`, and sets the `theme` cookie (`path=/; SameSite=Lax; max-age=31536000`). Must run before the stylesheet affects paint.

#### 4. Remove hardcoded `dark` from the two wrappers

**Files**: `src/layouts/AppLayout.astro:13`, `src/components/Welcome.astro:6`

**Intent**: Theme now comes from `<html>`; the wrappers keep `bg-cosmic` (now var-driven) but drop the literal `dark` class.

**Contract**: Delete `dark` from both `class` strings; leave `bg-cosmic relative …` intact.

#### 5. ThemeToggle island

**File**: `src/components/ThemeToggle.tsx` (new)

**Intent**: A sun/moon icon button that flips the theme, persists it (cookie + localStorage mirror), and triggers the cross-fade. Accessible and hydration-safe. Designed to drop into a topbar's account cluster *or* stand alone in a corner.

**Contract**: On mount, read current theme from `document.documentElement.classList.contains("dark")` (not a prop). On click: add `theme-anim` to `<html>`, toggle `dark`, write `theme` cookie + `localStorage` (via the existing try/catch helper pattern from `LessonAside.tsx`), remove `theme-anim` after ~250ms. Render a sun icon when dark (action = go light) and a moon when light, with `aria-label`/`aria-pressed`. Reuse the inline-SVG icon style already in the codebase. Accept an optional `className`/`variant` prop so the same component serves the inline topbar slot and the standalone corner placement.

#### 6. Place the toggle near account controls on every view + cross-fade styles

**Files**: `src/components/Topbar.astro`, `src/components/AppTopbar.astro`, `src/pages/dashboard.astro`, `src/pages/auth/{signin,signup,confirm-email}.astro`, `src/styles/global.css`

**Intent**: Put the toggle next to the account/nav cluster wherever a topbar exists, give the bare pages a home for it, and add the scoped cross-fade. (Revised from the original single-global-fixed-control decision per user direction: the control belongs beside the account data.)

**Contract**: Render `<ThemeToggle client:load />` inside `Topbar.astro` (landing — left of / beside Sign in·Sign up or the account links) and inside `AppTopbar.astro` (in-app — beside displayName·Dashboard·Sign out). Add `AppTopbar` to `dashboard.astro` so it gains the same account cluster + toggle (consistent in-app chrome). Add a small standalone `ThemeToggle` (corner, glass token bg, `backdrop-blur`) to `signin.astro`, `signup.astro`, `confirm-email.astro`, which have no topbar. Cross-fade: a `.theme-anim` scope on `<html>` applying `transition: background-color/color/border-color ~250ms ease` to the relevant elements; honor `prefers-reduced-motion: reduce` (no transition).

### Success Criteria

#### Automated Verification

- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Toggle appears beside the account/nav controls on every view (landing topbar, in-app AppTopbar, dashboard now with AppTopbar) and as a standalone corner control on signin/signup/confirm-email.
- Toggle flips the entire site dark↔light; choice persists across reload and across page navigations (landing → courses → lesson).
- Returning visitor: theme renders correct with JS disabled (cookie/SSR path).
- First visit (clear cookie + set OS to light) shows light immediately with no flash; throttle network/CPU to confirm no FOUC.
- No React hydration warning in console; the toggle never flips the class on hydrate.
- Cross-fade plays on toggle only — not on initial load, hover, or focus.

**Implementation Note**: Pause for human confirmation before Phase 3. Light mode is expected to look incomplete on un-converted surfaces here.

---

## Phase 3: Convert landing / auth / dashboard surfaces

### Overview

Convert the hardcoded-heavy group (Welcome, Topbar, signin, signup, confirm-email, dashboard, LibBadge) to token-driven styling so each reads correctly in both themes. This is the largest sweep (~70 usages).

### Changes Required

#### 1. Welcome.astro

**File**: `src/components/Welcome.astro`

**Intent**: Convert hero, feature cards, orbs, and starfield to tokens; recolor orbs via the motif vars from Phase 1.

**Contract**: `text-white` → `text-foreground`; `text-blue-100/NN` → `text-muted-foreground`; feature-card `bg-white/5` + `border-white/10` → glass tokens; `text-purple-300` icon color → `text-primary`/`text-accent`; outline button `border-white/20 text-white` → `border-border text-foreground`. Orb divs: swap hardcoded `bg-purple-500/20` etc. for the light/dark orb vars. `shadow-cosmic-glow` and the primary CTA stay (token-based). Ensure the `AlpacaHero` glow reads acceptably in light (token-ize its radial color; design unchanged).

#### 2. Topbar.astro

**File**: `src/components/Topbar.astro`

**Intent**: Convert the landing/auth bar to tokens to match `AppTopbar`'s token-driven style.

**Contract**: `border-white/10 bg-white/5 text-white/80` → `border-glass bg-glass text-muted-foreground` (or card tokens); link colors `text-purple-300` → `text-primary`; `text-blue-100/70` → `text-muted-foreground`. Add the right-padding for the global toggle (from Phase 2).

#### 3. Auth + dashboard pages

**Files**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`, `src/pages/dashboard.astro`

**Intent**: Convert their hardcoded cards, text, inputs, and the `from-blue-200 to-purple-200` text gradients to tokens; keep `bg-cosmic` (now var-driven).

**Contract**: `border-white/10 bg-white/10 text-white` card chrome → glass + `text-foreground`; `bg-gradient-to-r from-blue-200 to-purple-200` headline → `text-cosmic-gradient`; `text-blue-100/NN` → `text-muted-foreground`; `text-purple-300` links → `text-primary`; confirm-email's inline inputs (`bg-white/5 placeholder:text-blue-100/40 focus:border-purple-400`) → glass bg + `placeholder:text-muted-foreground focus:border-ring`; its error block (`border-red-400/30 bg-red-400/10 text-red-100`) → destructive tokens.

#### 4. LibBadge.astro

**File**: `src/components/ui/LibBadge.astro`

**Intent**: Convert the badge color variants to tokens.

**Contract**: `bg-blue-900/50 text-blue-200` / `bg-purple-500/30 text-purple-200` → info/primary token tints with `-foreground`.

### Success Criteria

#### Automated Verification

- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`
- No remaining hardcoded dark-only classes in this group: `! grep -rnE "text-white|text-blue-100|bg-white/|border-white/|from-blue-200" src/components/Welcome.astro src/components/Topbar.astro src/pages/auth src/pages/dashboard.astro src/components/ui/LibBadge.astro`

#### Manual Verification

- Landing, signin, signup, confirm-email, dashboard each look correct and legible in BOTH themes (text contrast, glass cards, orbs/starfield visible-but-subtle on light).
- The alpaca hero + wordmark read well on the light cosmic-dawn background.

**Implementation Note**: Pause for human confirmation before Phase 4.

---

## Phase 4: Convert in-app surfaces + status tokens + banners

### Overview

Convert the in-app group and replace the scattered cyan/green/yellow tints with the Phase 1 status tokens; give Banner dark-mode variants.

### Changes Required

#### 1. Lesson page + course pages

**Files**: `src/pages/courses/[slug]/lessons/[lessonSlug].astro`, `src/pages/courses/[slug]/index.astro`, `src/pages/courses/index.astro`

**Intent**: Convert cyan/purple badges and remaining hardcoded chrome to tokens; `text-cosmic-gradient` already adapts.

**Contract**: cyan badge tints (`border-cyan-400/30 bg-cyan-400/10 text-cyan-200`) → `info` tokens; purple badge (`border-purple-400/30 bg-purple-400/10 text-purple-200`) → `primary` tokens; `text-green-400` completion → `text-success`; `border-white/10` dividers → `border-border`. `shadow-cosmic-glow` stays.

#### 2. LessonAside, LessonsNav, MarkCompleteButton

**Files**: `src/components/lesson/LessonAside.tsx`, `src/components/lesson/LessonsNav.tsx`, `src/components/lesson/MarkCompleteButton.tsx`

**Intent**: Convert tab/pulse/complete accents to status tokens.

**Contract**: LessonAside cyan tab tints + `bg-cyan-400` pulse dot → `info` tokens; `text-green-400`/`bg-green-400/10`/`text-green-200` completed states → `success` tokens; `MarkCompleteButton` completed classes → success tokens, incomplete stays primary; `bg-card/40` + `shadow-cosmic-glow` stay.

#### 3. Auth form components + chat bubble + button

**Files**: `src/components/auth/{FormField,SubmitButton,ServerError,PasswordToggle,SignInForm,SignUpForm}.tsx`, `src/components/chat/MessageBubble.tsx`, `src/components/ui/button.tsx`

**Intent**: Convert hardcoded white/blue/red/yellow to tokens; SignInForm's yellow resend box → warning tokens.

**Contract**: FormField (`bg-white/10 text-white placeholder-white/40 border-white/20 focus:ring-purple-400`, error `border-red-400/60 focus:ring-red-400 text-red-300`) → glass/foreground/ring + destructive tokens; SubmitButton (`bg-purple-600 text-white hover:bg-purple-500`, spinner `border-white/30 border-t-white`) → primary tokens; ServerError red → destructive tokens; PasswordToggle `text-white/40` → `text-muted-foreground`; SignInForm yellow box (`border-yellow-400/30 bg-yellow-400/10 text-yellow-100`, buttons `bg-yellow-400/20 text-yellow-50`) → warning tokens; SignUpForm `text-blue-100/50` → `text-muted-foreground`; MessageBubble `text-white` → `text-foreground`/`text-primary-foreground` as appropriate; button.tsx destructive `text-white` → `text-destructive-foreground` (keep `dark:` variant behavior).

#### 4. Banner dark variants

**File**: `src/components/Banner.astro`

**Intent**: The fixed light-colored banners look out of place on the cosmic dark bg — add dark-mode variants.

**Contract**: Under the `.dark` scope, give `.banner--info/--warning/--error` darker translucent backgrounds with light text (keep light-mode values as-is). Scoped `<style>` with `:global(.dark) .banner--…` or token-based colors.

### Success Criteria

#### Automated Verification

- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`
- No remaining hardcoded dark-only classes site-wide: `! grep -rnE "text-white\b|text-blue-100|bg-white/|border-white/|text-cyan-|bg-cyan-|text-green-4|bg-green-4|bg-yellow-4|text-yellow-" src/` (allowing documented exceptions: avatar-color.ts).

#### Manual Verification

- Catalog, course detail, lesson page, chat panel, lesson aside, Mark-Complete all look correct in BOTH themes.
- Status colors (success/info/warning/error) are legible and on-brand in both themes.
- Banners read correctly in both themes.
- Full regression pass: sign in, post a chat message, mark a lesson complete, navigate between lessons — in both themes.

**Implementation Note**: Final phase — after confirmation, ready to commit/deploy.

---

## Testing Strategy

### Manual Testing Steps

1. Fresh browser (cleared cookies), OS set to light → load site: renders light immediately, no flash.
2. Toggle to dark → reload → still dark; navigate landing → courses → lesson → still dark.
3. Disable JS, set cookie to light → reload: SSR renders light.
4. Throttle CPU/network → reload repeatedly: no FOUC either theme.
5. Walk every surface in both themes (landing, signin, signup, confirm-email, dashboard, catalog, course, lesson, chat, mark-complete) checking contrast and the cosmic motifs.
6. `prefers-reduced-motion: reduce` → toggle does not animate.

## Performance Considerations

Inline head script is a few lines, synchronous, runs once — negligible. Cookie is sent per request (tiny). Cross-fade is a short scoped transition. No new dependencies.

## Migration Notes

No data migration. Existing users without a `theme` cookie get system preference on next visit (one-time resolution), then their explicit choice. Default when nothing is known is dark (brand), so the current experience is preserved for JS-disabled/no-cookie cases.

## References

- Change identity: `context/changes/site-wide-light-theme/change.md`
- Plan brief: `context/changes/site-wide-light-theme/plan-brief.md`
- Theme variant + tokens: `src/styles/global.css:6,8,48,85`
- Hardcoded `.dark` wrappers: `src/layouts/AppLayout.astro:13`, `src/components/Welcome.astro:6`
- Middleware + locals: `src/middleware.ts`, `src/env.d.ts`
- localStorage helper pattern: `src/components/lesson/LessonAside.tsx:46-64`
- Parked roadmap item: `context/foundation/roadmap.md` (#137)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Token foundation + cosmic-dawn palette

#### Automated

- [x] 1.1 Type check passes: `npx astro check` — 386011c
- [x] 1.2 Lint passes: `npm run lint` — 386011c
- [x] 1.3 Build succeeds: `npm run build` — 386011c

#### Manual

- [x] 1.4 Dark theme visually unchanged
- [x] 1.5 Removing `.dark` from a wrapper shows legible cosmic-dawn light (spot check)

### Phase 2: Root-level theme control + persistence

#### Automated

- [x] 2.1 Type check passes: `npx astro check` — 9802d5e
- [x] 2.2 Lint passes: `npm run lint` — 9802d5e
- [x] 2.3 Build succeeds: `npm run build` — 9802d5e

#### Manual

- [x] 2.4 Toggle appears beside account controls on every view (+ standalone on auth pages)
- [x] 2.5 Toggle flips whole site; persists across reload + navigation
- [x] 2.6 Returning visitor themed correctly with JS disabled
- [x] 2.7 First visit honors system preference with no flash (throttled)
- [x] 2.8 No hydration warning; class not flipped on hydrate
- [x] 2.9 Cross-fade plays on toggle only

### Phase 3: Convert landing / auth / dashboard surfaces

#### Automated

- [x] 3.1 Type check passes: `npx astro check` — ca412f4
- [x] 3.2 Lint passes: `npm run lint` — ca412f4
- [x] 3.3 Build succeeds: `npm run build` — ca412f4
- [x] 3.4 No hardcoded dark-only classes remain in this group (grep guard) — ca412f4

#### Manual

- [x] 3.5 Landing/signin/signup/confirm/dashboard correct in both themes
- [x] 3.6 Alpaca hero + wordmark read well on light cosmic-dawn

### Phase 4: Convert in-app surfaces + status tokens + banners

#### Automated

- [x] 4.1 Type check passes: `npx astro check` — 92e59da
- [x] 4.2 Lint passes: `npm run lint` — 92e59da
- [x] 4.3 Build succeeds: `npm run build` — 92e59da
- [x] 4.4 No hardcoded dark-only classes remain site-wide (grep guard, documented exceptions) — 92e59da

#### Manual

- [x] 4.5 Catalog/course/lesson/chat/aside/mark-complete correct in both themes
- [x] 4.6 Status colors legible + on-brand in both themes
- [x] 4.7 Banners correct in both themes
- [x] 4.8 Full regression (sign in, post chat, mark complete, navigate) in both themes
