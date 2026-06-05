# Rich Custom Video Player (Plyr) Implementation Plan

## Overview

Replace the plain `<iframe>` on the lesson page with a **Plyr**-based unified player over YouTube and Vimeo, giving learners a consistent, cosmic-themed control bar — play/pause, scrubber + time, volume/mute, playback speed, captions (off by default), picture-in-picture, fullscreen — plus an **Expand** button that collapses the lesson aside to maximize the stage. Unknown providers and reading-only lessons keep today's behavior. (Linear UNS-19.)

## Current State Analysis

- `parseVideoUrl` (`src/lib/video-embed.ts`) returns `{ embedSrc, provider }` where provider is `youtube | vimeo | unknown`; the lesson page renders a bare `<iframe src={embedSrc}>` for known providers and a "Video preview unavailable" block for unknown (`src/pages/courses/[slug]/lessons/[lessonSlug].astro:132-148`). Reading-only lessons (`video_url === null`) render a "Reading" badge instead.
- The lesson **aside-collapse** lives entirely inside the `LessonAside` island: `collapsed` state persisted at localStorage key `unstuck.lesson-aside.collapsed`, surfaced as `data-aside-collapsed` on its surface; the lesson grid goes single-column via `[&:has([data-aside-collapsed='true'])]:lg:grid-cols-1` (`lessonSlug.astro:75`). `setCollapsed` is the single mutator (`LessonAside.tsx:152`).
- Islands take plain-data props and use `client:load`; theme tokens drive styling (light/dark just shipped).
- **Constraint**: the YouTube IFrame API no longer exposes manual quality selection (auto-only); a quality picker is therefore omitted. Plyr's `storage` option persists volume/speed/captions automatically (localStorage) — that satisfies our persistence need with no custom code.
- No player dependency today; only `marked` is in deps.

## Desired End State

- On a YouTube or Vimeo lesson, the video renders through Plyr with the agreed control set, themed to the cosmic palette in both light and dark, no autoplay, captions toggle off by default, volume + speed remembered across lessons.
- An **Expand** button on the player collapses the lesson aside (and toggles back), keeping player ↔ aside in sync; the content area widens via the existing grid rule. Fullscreen remains a separate control.
- Unknown-provider and reading-only lessons are unchanged.

**Verify**: `astro check`, `npm run lint`, `npm run build` pass; on both providers the controls work; Expand collapses/restores the aside and the grid reflows; theming holds in both themes; fallback + reading lessons unaffected.

### Key Discoveries

- Plyr drives YouTube/Vimeo from **provider + video id**, not an embed URL — so `parseVideoUrl` must also return the `id`.
- Plyr `storage: { enabled: true }` persists volume/speed/captions for free (no custom persistence).
- Expand must bridge two islands (player ↔ `LessonAside`); the existing localStorage key + a window `CustomEvent` is the lightest bridge that reuses the current collapse mechanism.

## What We're NOT Doing

- No manual quality picker (YT API is auto-only; not worth a Vimeo-only control).
- No resume-playback-position (only volume/speed persistence, via Plyr storage).
- No autoplay.
- No custom player for `unknown` providers — they keep the existing fallback block.
- No self-hosting / HLS / upload pipeline (PRD non-goal).
- No DB/schema/API change — purely client rendering of existing `video_url`.

## Critical Implementation Details

- **Cross-island Expand contract**: a window `CustomEvent` (e.g. `unstuck:aside-collapsed`, `detail: { collapsed: boolean }`) is the bridge. `LessonAside`'s `setCollapsed` dispatches it; both `LessonAside` and the player listen. **Guard the echo loop** — the listener must apply state without re-dispatching (set state + storage directly, or ignore events it originated). The shared localStorage key `unstuck.lesson-aside.collapsed` is the source of truth for initial state on each island's mount.
- **Plyr lifecycle**: instantiate in a mount effect against a DOM node and `destroy()` on unmount (the lesson page is an SPA-like island context; leaking Plyr instances across navigations breaks playback). Player is client-only — render via `client:load`; never touch `window`/Plyr at module scope.

## Phase 1: Dependency + embed id

### Overview
Add Plyr and teach `parseVideoUrl` to surface the provider video id.

### Changes Required

#### 1. Add Plyr dependency
**File**: `package.json`
**Intent**: Add the `plyr` package (and `@types/plyr` if types aren't bundled) for the player.
**Contract**: `plyr` in `dependencies`; lockfile updated via `npm install`. No other dep changes.

#### 2. Surface the provider video id
**File**: `src/lib/video-embed.ts`
**Intent**: Plyr needs `{ provider, id }`. Extend the parser to return the extracted id alongside the existing fields.
**Contract**: `VideoEmbed` gains `id: string | null`. `parseVideoUrl` populates `id` for youtube (`v`/`youtu.be`/`/embed/ID`) and vimeo (numeric id); `null` for unknown. Keep `embedSrc` + `provider` unchanged (back-compat / fallback).

### Success Criteria
#### Automated Verification
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`
- `plyr` present: `grep -q '"plyr"' package.json`
#### Manual Verification
- `parseVideoUrl` returns the correct `id` for representative YouTube (`watch?v=`, `youtu.be`, `/embed/`) and Vimeo URLs (spot check).

**Implementation Note**: pause for confirmation before Phase 2.

## Phase 2: Player island + theming + wiring

### Overview
Build the Plyr player island, theme it, and render it on the lesson page for known providers.

### Changes Required

#### 1. LessonVideoPlayer island
**File**: `src/components/lesson/LessonVideoPlayer.tsx` (new)
**Intent**: A client island that mounts Plyr over the YouTube/Vimeo embed with the agreed controls and cleans up on unmount.
**Contract**: Props `{ provider: "youtube" | "vimeo"; videoId: string; title: string }`. Mount Plyr against an embed node (`data-plyr-provider` / `data-plyr-embed-id`, or a `source` object). Controls: play, progress, current-time, mute, volume, settings (speed only — no quality), captions, pip, fullscreen. Options: `autoplay: false`, `captions: { active: false, update: true }`, `storage: { enabled: true }` (persists volume/speed). Import Plyr's CSS. `destroy()` in the effect cleanup. The Expand button is added in Phase 3.

#### 2. Cosmic theming
**File**: `src/styles/global.css` (Plyr CSS-var overrides)
**Intent**: Map Plyr's CSS variables to the cosmic tokens so the control bar matches the brand in both themes.
**Contract**: Override `--plyr-color-main` (→ primary), control background/hover, and the focus ring using theme tokens; ensure it reads correctly under both `:root` and `.dark`. Keep the player's video area background neutral.

#### 3. Lesson-page wiring
**File**: `src/pages/courses/[slug]/lessons/[lessonSlug].astro`
**Intent**: Render the player for known providers; keep the fallback for unknown and the reading badge for no-video.
**Contract**: In the `lesson.video_url !== null` branch: when `video.provider !== "unknown" && video.id` → `<LessonVideoPlayer client:load provider={video.provider} videoId={video.id} title={lesson.title} />` (inside the existing aspect-ratio wrapper); else the current "Video preview unavailable" block. Import the component.

### Success Criteria
#### Automated Verification
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`
#### Manual Verification
- YouTube lesson: Plyr renders; play/pause, scrub, volume, speed, captions toggle, PiP, fullscreen all work; no autoplay.
- Vimeo lesson: same control set works.
- Volume + speed persist across navigating to another lesson.
- Control bar matches the cosmic theme in light and dark.
- Unknown-provider lesson still shows the fallback; reading-only lesson unchanged.

**Implementation Note**: pause for confirmation before Phase 3.

## Phase 3: Expand ↔ aside cross-island sync

### Overview
Add the Expand button and wire it to the existing aside-collapse via a window event.

### Changes Required

#### 1. Expand button on the player
**File**: `src/components/lesson/LessonVideoPlayer.tsx`
**Intent**: An overlay Expand/Restore button (top-right of the player) that toggles the aside-collapsed state and reflects it.
**Contract**: Reads initial collapsed state from `localStorage["unstuck.lesson-aside.collapsed"]`; listens for `unstuck:aside-collapsed` to update its icon (Maximize2/Minimize2). On click: compute next, write the storage key, dispatch `new CustomEvent("unstuck:aside-collapsed", { detail: { collapsed: next } })`. Positioned absolutely over the player, theme-token styled, doesn't overlap Plyr's bar.

#### 2. LessonAside listens + emits
**File**: `src/components/lesson/LessonAside.tsx`
**Intent**: Keep the aside in sync with the player's Expand and vice-versa, without an echo loop.
**Contract**: Add a window listener for `unstuck:aside-collapsed` that applies `detail.collapsed` via the state setter + storage **without re-dispatching**; have the existing `setCollapsed` dispatch the event so the player reflects aside-initiated toggles. Reuse the `unstuck.lesson-aside.collapsed` key (extract a shared constant if convenient).

### Success Criteria
#### Automated Verification
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`
#### Manual Verification
- Clicking Expand collapses the aside; the grid widens to single column; the icon flips to Restore; clicking again restores the aside.
- Collapsing/expanding via the aside's own control updates the player's Expand icon (two-way sync, no flicker/loop).
- Collapsed state persists across reload (both islands read the shared key).

**Implementation Note**: pause for confirmation before Phase 4.

## Phase 4: Prod deploy

### Overview
Ship to Cloudflare with the prod build gotcha.

### Changes Required

#### 1. Build + deploy
**File**: (no code) — runbook
**Intent**: Deploy the new lesson-page bundle (now includes Plyr) to prod.
**Contract**: `mv .dev.vars` aside → `SUPABASE_URL/KEY=<prod> npm run build` → verify `grep -roE "(rhcioqeawpbuylbmkxnr|127\.0\.0\.1:54321)" dist/` shows prod ref only → `npx wrangler deploy` → restore `.dev.vars` → smoke `/courses` + a lesson page.

### Success Criteria
#### Automated Verification
- Build leak-check: zero `127.0.0.1` in `dist/`
- `wrangler deploy` succeeds
#### Manual Verification
- Prod lesson page loads the Plyr player; controls + Expand work; `/` + `/courses` → 200.

**Implementation Note**: final phase — gated prod action; confirm before `wrangler deploy`.

## Testing Strategy

### Manual Testing Steps
1. YouTube lesson (local): exercise every control; confirm no autoplay; change volume/speed, navigate to another lesson, confirm persistence.
2. Vimeo lesson: same.
3. Expand: collapse/restore from the player and from the aside; confirm two-way sync + grid reflow + reload persistence.
4. Theme toggle: control bar correct in light + dark.
5. Unknown `video_url` + reading-only lesson: unchanged.

## Performance Considerations
Plyr + the provider APIs load only on the lesson page (island, `client:load`). Plyr lazy-loads the YT/Vimeo SDK per provider. Keep the player code out of shared bundles. Bundle grows on the lesson route only.

## Migration Notes
No data/schema changes. New client dependency (`plyr`); visible in prod after the Phase 4 deploy. Rollback = revert the lesson-page wiring to the `<iframe>`.

## References
- Change identity: `context/changes/lesson-video-player/change.md`
- Plan brief: `context/changes/lesson-video-player/plan-brief.md`
- Linear: UNS-19
- Embed util: `src/lib/video-embed.ts`
- Lesson video block: `src/pages/courses/[slug]/lessons/[lessonSlug].astro:132-148`
- Aside-collapse mechanism: `src/components/lesson/LessonAside.tsx:37,152` + grid rule `lessonSlug.astro:75`
- Deploy runbook + `.dev.vars` gotcha: production memory `unstuck-production`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Dependency + embed id

#### Automated
- [x] 1.1 Type check passes: `npx astro check` — 2c1a7c5
- [x] 1.2 Lint passes: `npm run lint` — 2c1a7c5
- [x] 1.3 Build succeeds: `npm run build` — 2c1a7c5
- [x] 1.4 `plyr` present in package.json (grep) — 2c1a7c5
#### Manual
- [x] 1.5 `parseVideoUrl` returns correct id for YouTube + Vimeo URL variants — 2c1a7c5

### Phase 2: Player island + theming + wiring

#### Automated
- [x] 2.1 Type check passes: `npx astro check` — c3fa062
- [x] 2.2 Lint passes: `npm run lint` — c3fa062
- [x] 2.3 Build succeeds: `npm run build` — c3fa062
#### Manual
- [x] 2.4 YouTube: all controls work, no autoplay — c3fa062
- [x] 2.5 Vimeo: all controls work — c3fa062
- [x] 2.6 Volume + speed persist across lessons — c3fa062
- [x] 2.7 Control bar matches cosmic theme in light + dark — c3fa062
- [x] 2.8 Unknown-provider fallback + reading-only lesson unchanged — c3fa062

### Phase 3: Expand ↔ aside cross-island sync

#### Automated
- [x] 3.1 Type check passes: `npx astro check` — d7cd45c
- [x] 3.2 Lint passes: `npm run lint` — d7cd45c
- [x] 3.3 Build succeeds: `npm run build` — d7cd45c
#### Manual
- [x] 3.4 Expand collapses the aside + grid widens; Restore reverts — d7cd45c
- [x] 3.5 Aside's own collapse toggle updates the player icon (two-way, no loop) — d7cd45c
- [x] 3.6 Collapsed state persists across reload — d7cd45c

### Phase 4: Prod deploy

#### Automated
- [x] 4.1 Build leak-check: zero 127.0.0.1 in dist/
- [x] 4.2 `wrangler deploy` succeeds
#### Manual
- [x] 4.3 Prod lesson page: Plyr player + controls + Expand work; `/` + `/courses` → 200
