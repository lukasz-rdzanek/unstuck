# Lesson Particles Full-Viewport (UNS-13) Implementation Plan

## Overview

Recompose the S-06 completion celebration so the particle burst visibly
fills the viewport instead of clumping near the Mark Complete button.
Reframed during planning: the canvas-confetti library already renders a
fullscreen overlay canvas — the perception of "bounded to the button"
came from narrow spread + low velocity + short lifetime, not from a
scoped canvas. The fix is a multi-shot side-cannons + button-origin
composition with cosmic colors, not a portal/architecture refactor.

## Current State Analysis

- `src/components/lesson/MarkCompleteButton.tsx:37-51` defines
  `fireConfetti()` — a single `confetti({...})` call with `spread: 70`,
  `particleCount: 150`, origin computed from the button's
  `getBoundingClientRect()` normalized to 0–1 viewport coords.
- Library: `canvas-confetti` (v1.9.4 per package.json). The global
  `confetti(...)` call auto-creates a `position: fixed` fullscreen
  canvas appended to `document.body` (z-index ~999999, managed by the
  library). No portal/architecture work is needed to "lift" the
  particles — they already live there.
- `disableForReducedMotion: true` is already set; reduced-motion users
  get no burst.
- Trigger is in `handleClick()` lines 53-64: only on the unmark→mark
  transition (`if (!wasCompleted) fireConfetti()`), never on
  mark→unmark. Correct by design.
- No `confetti.reset()` call anywhere — rapid mark/unmark/mark cycles
  stack live particle systems on top of each other.

## Desired End State

Clicking "Mark as complete" fires a composed burst that visibly fills
the viewport: two side cannons from the left and right edges of the
viewport plus a center shot from the button's rect, staggered ~150ms
apart over ~500ms total. Particles use the cosmic palette
(`--primary`, `--accent`, `--ring` HSL tokens). Rapid-fire mark/unmark
cancels any active burst before firing a new one (`confetti.reset()`),
so the canvas never accumulates noise.

### Key Discoveries

- canvas-confetti's `origin: { x, y }` accepts viewport-normalized
  coords (0–1). Side cannons sit at `x: 0` (left edge) and `x: 1`
  (right edge); their `angle` controls the launch direction in degrees
  (0 = right, 90 = up, 180 = left).
- The "realistic" recipe pattern in the canvas-confetti docs uses
  multiple `confetti(...)` calls with shared base params (`startVelocity`,
  `ticks`, `gravity`, `decay`) and per-shot overrides for `origin`,
  `angle`, `spread`, `particleCount`.
- CSS HSL tokens look like `--primary: 261 73% 58%;` in `global.css`.
  Read via `getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()`
  → wrap as `hsl(<value>)` for the colors array.

## What We're NOT Doing

- NOT moving particles to a React portal — the library's auto-canvas
  is already a document-root fullscreen overlay.
- NOT swapping libraries (e.g., to react-confetti, tsparticles).
- NOT extracting a separate hook — the burst is a 30-line helper
  inside the same component (single consumer, feature-scoped per
  AGENTS.md hooks rule).
- NOT tuning the trigger condition (still mark→complete only) — that's
  S-06 behavior and works correctly.
- NOT adding tests — repo has no test suite (Module 3).
- NOT changing the button UI itself — only the celebratory effect.

## Implementation Approach

A single edit inside `MarkCompleteButton.tsx`: replace the single-shot
`fireConfetti()` body with a `fireConfetti()` that (a) calls
`confetti.reset()` first to cancel any in-flight burst, (b) resolves
cosmic colors from CSS tokens once, (c) fires three staggered shots
(left cannon, button-origin center, right cannon) using a shared base
config + per-shot overrides, all wrapped in
`disableForReducedMotion: true` for accessibility.

Phase 2 ships to prod via the same `.dev.vars`-aside dance.

## Phase 1: Multi-shot side-cannons composition

### Overview

Replace the single-shot fireConfetti() with a 3-shot staggered
composition + cosmic colors + reset-before-fire. Single-file edit.

### Changes Required

#### 1. `fireConfetti()` rewrite

**File**: `src/components/lesson/MarkCompleteButton.tsx`

**Intent**: Compose three sequential `confetti(...)` calls so the
celebration visibly uses the full viewport: a left-edge cannon, a
button-origin center burst, and a right-edge cannon. Cancel any
in-flight burst before firing (so rapid mark/unmark doesn't stack).
Pull particle colors from the cosmic palette CSS tokens so the burst
matches the brand.

**Contract**:
- Function stays sync (`void` return), still called from `handleClick`
  on the unmark→mark transition only.
- Bail-out guards unchanged (`if (!node || typeof window === "undefined") return;`).
- Before firing: `confetti.reset()` to cancel any active particles
  (handles rapid-fire cancellation per Q3 decision).
- Resolve cosmic colors once: read `--primary`, `--accent`, `--ring`
  values from `getComputedStyle(document.documentElement)`, build an
  `hsl(<value>)` string for each. Skip silently if any token is empty
  (graceful fallback to canvas-confetti defaults).
- Compute button rect → normalized origin (existing logic, unchanged).
- Shared base config: `startVelocity: 55`, `ticks: 250`, `gravity: 0.9`,
  `decay: 0.92`, `disableForReducedMotion: true`, `colors: <cosmic array>`.
- Three shots, fired sequentially via `setTimeout(..., delay)`:
  1. **Left cannon** — `origin: { x: 0, y: 0.7 }`, `angle: 60`,
     `spread: 55`, `particleCount: 70`. Delay: 0ms.
  2. **Center burst (button)** — `origin: { x: buttonX, y: buttonY }`,
     `angle: 90`, `spread: 100`, `particleCount: 100`. Delay: 150ms.
  3. **Right cannon** — `origin: { x: 1, y: 0.7 }`, `angle: 120`,
     `spread: 55`, `particleCount: 70`. Delay: 300ms.
- Total particle budget: 240 across 3 shots (vs 150 single shot today).
  Sequential timing keeps perceived density manageable.
- Timer cleanup: NOT required for in-flight setTimeouts — the burst
  finishes within ~500ms + ticks; component unmount during burst is
  rare (it would mean the user navigated away mid-celebration) and
  canvas-confetti tolerates orphaned timers without leaking
  (setTimeout fires `confetti(...)` which appends to body — harmless
  if the React tree is gone). No useEffect cleanup needed.

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0
- `npx astro check` exits 0
- `npm run build` exits 0

#### Manual Verification

- Click "Mark as complete" on a lesson where you haven't completed it
  yet → particles visibly burst from BOTH side edges of the viewport
  + from the button position, filling the screen (not just the area
  around the button).
- Click "Mark as complete" → wait for burst → click "Completed (click
  to unmark)" → particles do NOT fire on unmark (correct existing
  behavior).
- Rapid-fire: mark → unmark → mark → unmark → mark within 1s. Each
  new burst replaces (not stacks on) the previous; canvas doesn't
  accumulate noise.
- Particle colors visibly match the cosmic palette (primary purple +
  accent + ring tones), not the canvas-confetti rainbow default.
- macOS Reduce Motion (System Settings → Accessibility → Display →
  Reduce motion ON) → no burst fires (existing
  `disableForReducedMotion: true` honored).

**Implementation Note**: After all automated checks pass, pause for
manual confirmation before Phase 2.

---

## Phase 2: Prod deploy + smoke

### Overview

Ship the new burst to the live Worker.

### Changes Required

#### 1. Deploy app code to prod Cloudflare Worker

**File**: External (build + wrangler deploy)

**Intent**: Push the new fireConfetti to the live Worker.

**Contract**: Same recipe as `[[unstuck-production]]`:
- `mv .dev.vars .dev.vars.local.bak`
- `SUPABASE_URL=https://rhcioqeawpbuylbmkxnr.supabase.co SUPABASE_KEY=<anon-jwt> npm run build`
- Verify bundle: `grep -roE "(rhcioqeawpbuylbmkxnr|127\.0\.0\.1:54321)" dist/client/_astro/` shows only prod ref.
- `npx wrangler deploy`
- `mv .dev.vars.local.bak .dev.vars`

### Success Criteria

#### Automated Verification

- Pre-deploy `npm run lint` exits 0
- Pre-deploy `npm run build` exits 0
- Post-deploy curl
  `https://unstuck.lukasz-rdzanek.workers.dev/courses/generative-ai-leader/lessons/introduction`
  returns HTTP 302 (protected route unchanged)

#### Manual Verification

- Sign in on prod, mark a lesson complete → viewport-wide burst with
  cosmic colors fires.
- No regression: chat works, Mark Complete toggles, LessonAside Lessons
  highlight still works.

**Implementation Note**: Pause for manual confirmation before closing.

---

## Testing Strategy

### Unit Tests

None — repo has no test suite (Module 3 of 10xDevs introduces testing).

### Manual Testing Steps

After Phase 2 ships, on prod:

1. Sign in as operator.
2. Open a lesson where Mark Complete is in "Mark as complete" state.
3. Click → observe 3-shot burst (left cannon + center + right cannon)
   with cosmic colors filling the viewport.
4. Click again ("Completed (click to unmark)") → no burst.
5. Rapid mark/unmark/mark → bursts replace cleanly, no canvas chaos.
6. With Reduce Motion on → no burst.

## Performance Considerations

- 240 particles total (vs 150 today). canvas-confetti renders particles
  on a single canvas via requestAnimationFrame — 240 is well within
  the library's documented ~500-particle smooth-render budget for
  modern devices.
- Sequential shots via 2 `setTimeout` calls (150ms + 300ms delays).
  Trivial overhead.
- `getComputedStyle` per fire: 1 microtask per HSL token (3 reads per
  fire). Sub-millisecond cost.

## Migration Notes

No schema, no localStorage, no data migration. Rollback = revert the
Phase 1 commit.

## References

- Change: `context/changes/lesson-particles-full-viewport/change.md`
- S-06 origin: `src/components/lesson/MarkCompleteButton.tsx:37-51`
- canvas-confetti docs reference: <https://github.com/catdad/canvas-confetti#readme>
  ("realistic" recipe is the canonical multi-shot composition pattern)
- Memory pointer: `[[unstuck-production]]` (Phase 2 deploy recipe)
- Linear: [UNS-13](https://linear.app/unstack-ai/issue/UNS-13)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Multi-shot side-cannons composition

#### Automated

- [x] 1.1 `npm run lint` exits 0 — 81a81fb
- [x] 1.2 `npx astro check` exits 0 — 81a81fb
- [x] 1.3 `npm run build` exits 0 — 81a81fb

#### Manual

- [x] 1.4 Mark complete fires 3-shot burst (left cannon + button + right cannon) visibly filling the viewport — 81a81fb
- [x] 1.5 Unmark does NOT fire a burst (existing behavior preserved) — 81a81fb
- [x] 1.6 Rapid-fire mark/unmark cancels prior burst before firing new (no canvas accumulation) — 81a81fb
- [x] 1.7 Particle colors are the canvas-confetti default rainbow — visibly contrast against cosmic dark background (cosmic-palette colors were tried + reverted: they blended into the background) — 81a81fb
- [x] 1.8 With macOS Reduce Motion ON → no burst fires (disableForReducedMotion honored) — 81a81fb

### Phase 2: Prod deploy + smoke

#### Automated

- [x] 2.1 Pre-deploy `npm run lint` exits 0 — 551422e
- [x] 2.2 Pre-deploy `npm run build` exits 0 — 551422e
- [x] 2.3 Post-deploy curl `/courses/generative-ai-leader/lessons/introduction` returns HTTP 302 — 551422e

#### Manual

- [x] 2.4 Prod mark-complete fires viewport-wide cosmic burst — 551422e
- [x] 2.5 Prod no-regression: chat + Mark Complete toggle + LessonAside Lessons highlight still work — 551422e
