# Lesson Page UX Polish Bundle — Plan Brief

> Full plan: `context/changes/lesson-page-polish-bundle/plan.md`

## What & Why

Bundle 5 parked UX polish items + 1 cross-cutting refactor into a
single implementation pass. The items individually are small (CSS
rules, one-line attribute, helper extraction, badge); together they
are big enough UX wins to ship as a coherent slice, while small enough
that ritual overhead per item would dominate. Targets: privacy (no
email in topbar), ergonomics (cursor + scrollbar + prev/next), and
visual coherence (fluid content when aside collapses).

## Starting Point

S-07 just shipped the lesson nav panel (Chat | Lessons tabs +
collapse). During its manual review, 11 polish items were captured to
`roadmap.md ## Parked` + Linear (UNS-13..23). This change picks 5 of
those that share the lesson-page surface and have low risk / high
impact: UNS-15 (cursor:pointer), UNS-17 (username topbar), UNS-18
(aside-collapsed → fluid), UNS-22 (prev/next + Lesson N/M), UNS-23
(global scrollbar).

## Desired End State

Topbar shows `display_name` (not email). Lesson page collapses the
aside fluidly to give content the full freed width. Lesson topbar
carries prev/next arrows + "Lesson N of M" badge. Every interactive
control has `cursor: pointer`. Document scrollbar matches the
cosmic-themed chat scrollbar. One new service helper
(`getDisplayNameOrFallback`) shared by the lesson page + topbar.

## Key Decisions Made

| Decision                        | Choice                                           | Why (1 sentence)                                                                          | Source |
| ------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------ |
| Phase strategy                  | One big phase                                    | Items are small; ritual overhead per item would dominate                                  | Plan   |
| Topbar destination              | Username pill + Sign out                         | Minimal surface; settings/theme/dropdown belong to later slices                           | Plan   |
| Topbar variants                 | AppTopbar only (signed-in)                       | `Topbar.astro` (landing) doesn't have a session; username pill doesn't apply              | Plan   |
| Aside-collapsed → fluid grid    | CSS `:has()` selector via data attribute         | Zero state lifting, zero extra island; Tailwind v4 supports `[&:has(...)]` arbitrary      | Plan   |
| display_name resolution         | Extract to `src/lib/services/profiles.ts`        | About to have 2 consumers; better to DRY now than chase drift                             | Plan   |
| `cursor: pointer` scope         | Global `@layer base` rule                        | One-shot fix for all 19+ buttons + 2 tabs + future controls; surgical opt-out via class   | Plan   |
| Custom scrollbar scope          | Global `html` rule in `@layer base`              | Whole-page coherence with chat scrollbar; mirror `chat-scroll` tokens exactly             | Plan   |

## Scope

**In scope:**
- `src/styles/global.css`: cursor base rule + global scrollbar rule
- `src/components/AppTopbar.astro`: username pill + display-name lookup
- `src/components/lesson/LessonAside.tsx`: one-line `data-aside-collapsed` attribute
- `src/pages/courses/[slug]/lessons/[lessonSlug].astro`: grid `:has()` variant + prev/next arrows + "Lesson N of M" badge + refactored display_name lookup
- `src/lib/services/profiles.ts` (new): `getDisplayNameOrFallback` helper
- Prod deploy + smoke

**Out of scope:**
- `Topbar.astro` (landing/auth variant) — Q3 declined
- Profile dropdown menu / Settings page — Q2 declined; later slice
- Tests — no test infra in repo yet (Module 3)
- Theme toggle (UNS-16), particle burst (UNS-13), tab re-order (UNS-14), video player (UNS-19), autodescription tabs (UNS-20), save-as-pdf (UNS-21) — still parked
- Schema/migration — none required

## Architecture / Approach

CSS-first: 4 of 6 sub-items are pure CSS (1.A cursor, 1.B scrollbar,
1.C aside-fluid via `:has()`). One sub-item (1.D) is a small service
extraction. Two sub-items (1.E topbar, 1.F prev/next + badge) are
Astro template edits that read pre-loaded data — no new Supabase
queries except one for the topbar (`profiles.display_name` on
in-app routes). React component change is one line in `LessonAside.tsx`
(add `data-aside-collapsed` attribute).

```
src/styles/global.css           ← 1.A (cursor) + 1.B (scrollbar)
src/lib/services/profiles.ts    ← 1.D (new helper, ~15 lines)
src/components/AppTopbar.astro  ← 1.E (username pill + helper call)
src/components/lesson/
  LessonAside.tsx               ← 1.C (one data-attribute line)
src/pages/courses/[slug]/lessons/
  [lessonSlug].astro            ← 1.C (grid :has() class) + 1.D (helper call)
                                  + 1.F (prev/next + badge derivation)
```

## Phases at a Glance

| Phase | What it delivers                                  | Key risk                                                                                |
| ----- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1     | All 6 sub-items + clean lint/build/manual gate    | Tailwind v4 `[&:has(...)]` syntax — verify it compiles to expected selector             |
| 2     | Prod deploy + post-deploy smoke                   | None — same dance proven across S-04..S-07                                              |

**Prerequisites:** S-07 archived (✓ done); `.dev.vars` recipe for prod build still applies.
**Estimated effort:** ~1 session (small total surface, no schema, no tests).

## Open Risks & Assumptions

- **`:has()` browser support**: Safari 15.4+, Chrome 105+, Firefox
  121+ (Jan 2024). Older browsers will see the reserved 360px column
  even when aside is collapsed (graceful degradation — they keep the
  current behaviour, which is what they see today).
- **Tailwind v4 arbitrary `:has()` variant**: assumed working per docs
  and the existing project's heavy reliance on v4 arbitrary variants.
  Spot-check the compiled CSS during implementation; fall back to a
  global `:has()` rule in `global.css` if Tailwind doesn't emit the
  expected selector.
- **Profiles query latency on AppTopbar**: adds ~50-150ms one
  Supabase query per in-app page render. Acceptable for an SSR Worker;
  if it becomes a concern, future option is to cache display_name in
  middleware (`Astro.locals.user.displayName`).

## Success Criteria (Summary)

- No raw emails visible in the topbar; username pill present and
  populated with `display_name` (or email-local-part fallback).
- Lesson page aside collapse + full-width content works on desktop;
  prev/next + badge work across the whole course.
- Every button + tab + link has `cursor: pointer`; document scrollbar
  matches the chat-panel cosmic style.
- Prod live with no regressions to chat, Realtime, Mark Complete, or
  the lesson aside.
