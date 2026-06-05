# Rich Custom Video Player (Plyr) — Plan Brief

> Full plan: `context/changes/lesson-video-player/plan.md`

## What & Why

Replace the bare lesson-page `<iframe>` with a **Plyr**-based unified player over YouTube + Vimeo — a consistent, cosmic-themed control bar (play/pause, scrub, volume, speed, captions, PiP, fullscreen) plus an **Expand** button that collapses the lesson aside to maximize the stage. High-impact for the "lean back and learn" mode. (Linear UNS-19.)

## Starting Point

Today `parseVideoUrl` → a plain `<iframe>` (youtube/vimeo/unknown); unknown gets a fallback, no-video gets a "Reading" badge. The aside-collapse lives inside `LessonAside` (localStorage + `data-aside-collapsed` + a grid `:has` rule). No player dependency exists.

## Desired End State

YouTube/Vimeo lessons play through a themed Plyr with the agreed controls (no autoplay, captions off by default, volume+speed remembered). An Expand button collapses/restores the aside in sync with the aside's own control. Unknown-provider and reading-only lessons are unchanged.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Player | Plyr | Lightweight, proven unified YT/Vimeo control bar; fast to ship + theme | Plan |
| Controls | Standard set, no quality picker | YT API is auto-only; consistent across providers | Plan |
| Expand | Collapse the aside (cross-island event) | Matches "maximize the stage"; reuses existing collapse | Plan |
| Providers | YouTube + Vimeo | Parity with current support; lib handles both | Plan |
| Captions | Toggle, off by default | Accessibility aid without forcing it | Plan |
| Persistence | Volume + speed (Plyr `storage`); no resume | Free via Plyr; resume adds scope | Plan |
| Autoplay / PiP / theme | No autoplay · PiP on · cosmic-themed | Sensible defaults; PiP free; brand consistency | Plan |
| Deploy | Own change + own prod deploy | Clean, isolated release | Plan |

## Scope

**In scope:** `plyr` dep; `parseVideoUrl` returns video `id`; `LessonVideoPlayer` island (controls/PiP/captions/storage/no-autoplay); cosmic theming; lesson-page wiring; Expand↔aside cross-island sync; prod deploy.

**Out of scope:** quality picker, resume position, autoplay, custom player for unknown providers, self-hosting/HLS, any DB/API change.

## Architecture / Approach

A `client:load` `LessonVideoPlayer` island instantiates Plyr (provider + video id) with the agreed options and destroys it on unmount; Plyr's CSS vars are mapped to cosmic tokens. The Expand button and `LessonAside` communicate via a window `CustomEvent` (`unstuck:aside-collapsed`) over the shared `unstuck.lesson-aside.collapsed` localStorage key — echo-guarded — so the existing `data-aside-collapsed` grid rule widens the content.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Dep + embed id | `plyr` added; `parseVideoUrl` returns `id` | Trivial |
| 2. Player + theming + wiring | Themed Plyr on YT/Vimeo lessons | Plyr lifecycle/cleanup; theming both modes |
| 3. Expand ↔ aside sync | Cross-island collapse via window event | Echo-loop between the two islands |
| 4. Prod deploy | Live on Cloudflare | `.dev.vars` build gotcha |

**Prerequisites:** none (builds on current lesson page).
**Estimated effort:** ~2–3 sessions; Phase 2 is the bulk.

## Open Risks & Assumptions

- Plyr's React integration (instantiate-in-effect + destroy) must be clean to avoid leaked instances across island re-renders/navigation.
- Caption availability depends on the source video having tracks (YT auto-captions vary).
- Cross-island Expand needs a deliberate echo-loop guard.
- New client dependency increases the lesson-route bundle (lazy per provider; acceptable).

## Success Criteria (Summary)

- Themed Plyr with the agreed controls works on both providers (no autoplay; volume+speed persist).
- Expand collapses/restores the aside in two-way sync; grid reflows; persists across reload.
- Unknown-provider + reading-only lessons unchanged; build/check/lint green; deployed to prod.
