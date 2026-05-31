# Lesson Particles Full-Viewport (UNS-13) — Plan Brief

> Full plan: `context/changes/lesson-particles-full-viewport/plan.md`

## What & Why

Recompose the S-06 mark-complete celebration so the particle burst
visibly fills the viewport instead of clumping near the button. The
parked-item description framed this as a "portal architecture refactor"
but grounding revealed canvas-confetti already auto-renders a fullscreen
overlay canvas — the "bounded to button" perception was caused by
narrow spread + low velocity + short particle lifetime, not by a
scoped container. Fix is parameter tuning + multi-shot composition,
not a refactor.

## Starting Point

`MarkCompleteButton.tsx:37-51` calls `confetti({...})` once per
celebration with `spread: 70`, `particleCount: 150`, origin computed
from the button's `getBoundingClientRect()`. The library already
renders particles on a `position: fixed` fullscreen canvas appended to
`document.body` (z-index ~999999). Particles burst in a narrow upward
cone, decelerate under default gravity, fall back near the button —
they never reach the viewport edges.

## Desired End State

A 3-shot staggered burst (left cannon at viewport-left edge → center
burst at button position → right cannon at viewport-right edge) fires
on the mark-complete transition, using the cosmic palette (`--primary`,
`--accent`, `--ring` HSL tokens). The whole celebration runs in
~500ms. Rapid mark/unmark/mark cycles cancel any in-flight burst
before firing a new one — no canvas accumulation. Reduced-motion users
still get no burst (existing honor preserved).

## Key Decisions Made

| Decision                          | Choice                                    | Why (1 sentence)                                                                          |
| --------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Architecture                      | NO portal/refactor                        | canvas-confetti already provides a document-root fullscreen canvas — parked item misread the cause |
| Pattern                           | Side cannons (left + button + right)      | Canonical canvas-confetti "realistic" recipe; works regardless of button position         |
| Colors                            | Cosmic palette via CSS HSL tokens         | Brand-aligned; auto-flips when UNS-16 light theme lands; future-proof                     |
| Rapid-fire handling               | `confetti.reset()` before each fire       | Cleanest UX — newest burst always starts fresh; no canvas chaos                           |
| Trigger condition                 | Unchanged (mark→complete only)            | S-06 behavior is correct                                                                  |
| Particle budget                   | 240 total across 3 shots                  | Well within library's ~500-particle smooth-render budget on modern devices                |
| Stagger timing                    | 0ms / 150ms / 300ms                       | Total burst duration ~500ms — feels celebratory, not overwhelming                         |

## Scope

**In scope:**
- `src/components/lesson/MarkCompleteButton.tsx` — replace `fireConfetti()` body with multi-shot composition + cosmic colors + reset-before-fire
- Prod deploy + smoke

**Out of scope:**
- Portal refactor / library swap / new hook extraction
- Changes to trigger condition (mark→complete only)
- Tests (no test infra)
- Light-theme palette adjustment (deferred to UNS-16)
- Schema / data layer

## Architecture / Approach

Single-file edit. The new `fireConfetti()` body is ~30 lines:

```
fireConfetti():
  1. early-return guards (unchanged)
  2. confetti.reset()                                    ← cancel in-flight
  3. read --primary, --accent, --ring → cosmic colors array
  4. compute button rect → buttonX/Y (normalized)
  5. base config (startVelocity, ticks, gravity, decay, disableForReducedMotion, colors)
  6. shot 1: left cannon  (origin x=0, angle=60)         ← delay 0ms
  7. shot 2: button       (origin x=buttonX, angle=90)   ← delay 150ms via setTimeout
  8. shot 3: right cannon (origin x=1, angle=120)        ← delay 300ms via setTimeout
```

No new files, no new dependencies, no schema changes.

## Phases at a Glance

| Phase | What it delivers                                  | Key risk                                                                                 |
| ----- | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1     | New `fireConfetti()` body + lint/build/manual gate | CSS HSL token format — `getPropertyValue('--primary')` returns `'261 73% 58%'` which needs `hsl(...)` wrap |
| 2     | Prod deploy + smoke                               | None — same dance proven across previous slices                                          |

**Prerequisites:** lesson-page-polish-bundle archived (✓ done); `.dev.vars` recipe for prod build still applies.
**Estimated effort:** ~30 minutes implementation + manual verification.

## Open Risks & Assumptions

- **HSL token wrapping**: `--primary: 261 73% 58%;` is a raw HSL value
  (no `hsl(...)` wrapper) per the shadcn-tokens convention. If
  `getPropertyValue` returns empty string (token not loaded yet), the
  cosmic colors array becomes empty and canvas-confetti falls back to
  its rainbow default — graceful degradation.
- **Stagger setTimeout cleanup on unmount**: not added. The burst
  finishes in ~500ms; user navigating away mid-celebration is an edge
  case. canvas-confetti tolerates orphaned timers without leaking.
  If real reports surface, add a ref-tracked timer cleanup.
- **Mobile viewport**: side cannons at `y: 0.7` (lower-third). On
  very tall mobile viewports the cannons may sit too low. If feedback
  surfaces, switch to `y: 0.6` or compute relative to viewport
  aspect ratio.

## Success Criteria (Summary)

- Mark-complete fires a visibly viewport-wide burst (left edge +
  center + right edge), not a tight upward cone near the button.
- Particles use the cosmic palette, not the rainbow default.
- Rapid-fire mark/unmark cycles never stack — newest burst replaces
  any in-flight one.
- Reduce Motion still honored — no burst.
