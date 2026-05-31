# Lesson Page UX Polish Bundle — Implementation Plan

## Overview

Bundle 5 parked UX polish items (UNS-15, UNS-17, UNS-18, UNS-22, UNS-23) +
one cross-cutting refactor (extract a `profiles` service helper) into a
single implementation pass. Goal: lift the lesson page + topbar polish
backlog without paying ritual overhead for each individual item.

## Current State Analysis

Five independent surfaces touched, mapped to file:line via the
pre-planning scan (Explore agent, this session):

- **Topbar** (`src/components/AppTopbar.astro:1-37`): shows raw
  `{user.email}` on line 16 between Dashboard and Sign out. Sibling
  `src/components/Topbar.astro` exists for landing/auth pages with
  hardcoded "Guest" — out of scope (per Q3 decision).
- **Lesson page grid**
  (`src/pages/courses/[slug]/lessons/[lessonSlug].astro:61`): declares
  `lg:grid-cols-[minmax(0,1fr)_360px]`. The 360px right column is
  reserved unconditionally. Collapse state lives in `LessonAside.tsx`
  (React island) — the page-level grid has no mechanism to react today.
- **Lesson topbar back-link**
  (`src/pages/courses/[slug]/lessons/[lessonSlug].astro:55-60`): only
  the `← <course>` link; no prev/next nav, no "Lesson N of M" badge.
- **cursor:pointer**: 19 `<button>` + 2 `[role="tab"]` elements across
  `src/components/` and `src/pages/`; no `@layer base` button rule in
  `src/styles/global.css`.
- **Scrollbar**: `chat-scroll` utility class defined at
  `src/styles/global.css:170-186` with Firefox `scrollbar-*` + WebKit
  `::-webkit-scrollbar-*` syntax. No global override on `html` / `body`.
- **display_name lookup**: inline in `lessonSlug.astro:32-35` (queries
  `profiles.display_name`, falls back to email-local-part). No service
  helper yet. Will be needed in AppTopbar too — natural extraction point.

## Desired End State

- **Topbar** shows `display_name` (with email-local-part fallback) as a
  username pill instead of the raw email. Privacy regression closed.
- **Lesson page grid** collapses to a single column when the aside is
  collapsed, so the video + content area takes the full freed width.
  Driven entirely by CSS `:has()` on a data attribute the React island
  emits — no state lifting, no extra island.
- **Lesson topbar** carries prev / next arrows (right-aligned in the
  back-link container) and a "Lesson N of M" badge above the H1 title.
  Both derived from the already-loaded `chapters` array (S-07's
  `Promise.all` did the work; we just flatten + index).
- **Every interactive control** (`<button>`, `[role="tab"]`, `<a href>`)
  gets `cursor: pointer` via a single `@layer base` rule.
- **Whole-document scrollbar** matches the existing `chat-scroll`
  aesthetic via an `html`-level rule in `@layer base`.
- **`display_name` resolution** lives in
  `src/lib/services/profiles.ts` and is called from both
  `lessonSlug.astro` and `AppTopbar.astro`.

### Key Discoveries

- `chapters` already arrives in `lessonSlug.astro` from
  `listChaptersWithLessonsForCourse` (loaded in the S-07 Promise.all at
  `lessonSlug.astro:40-47`). For prev/next + badge, just
  `chapters.flatMap(ch => ch.lessons)` and find the index of the
  current lesson. Zero new queries.
- `LessonAside`'s `collapsed` state already drives a conditional render
  (`src/components/lesson/LessonAside.tsx:136-155`). Adding a
  `data-aside-collapsed` attribute on the same root element is a
  one-line addition — the only mechanism the CSS `:has()` selector
  needs.
- Tailwind v4 supports the `[&:has(...)]:` arbitrary variant inline
  (e.g. `[&:has([data-aside-collapsed="true"])]:lg:grid-cols-1`).
  Browser support: Safari 15.4+, Chrome 105+, Firefox 121+ (Jan 2024) —
  acceptable per the modern-only stance of this MVP.
- `chat-scroll` CSS (`global.css:170-186`) is the template for the
  global rule — reuse the exact tokens (`hsl(var(--border))` thumb,
  `transparent` track, 6px width, hover swap to `--muted-foreground`).

## What We're NOT Doing

- Not updating `Topbar.astro` (landing/auth variant) — kept out per Q3;
  the privacy regression is signed-in-only.
- Not building a profile dropdown menu (Q2: chose minimal username pill;
  Profile/Settings/Theme-toggle slots come later under UNS-16 or a
  future "settings page" slice).
- Not migrating the `display_name` resolution into middleware (Q5:
  service-level extraction is enough — middleware change would add a
  per-request Supabase query that most pages don't need).
- Not creating a Tailwind plugin for `cursor:pointer` (Q6: chose `@layer
  base` rule; plugin overhead not justified for one declaration).
- Not extracting `chat-scroll` into a `cosmic-scroll` utility class
  (Q7: chose global `html` rule; `chat-scroll` stays as-is for now,
  effectively redundant but historically named).
- Not adding tests — repo carries no test suite yet (Module 3 of
  10xDevs introduces testing; consistent with S-04..S-07).

## Implementation Approach

One implementation phase covering all 6 sub-items, ordered from
cheapest CSS (1.A–1.C) to service refactor (1.D) to React/Astro
(1.E–1.F). This minimises commit / deploy ritual overhead (Q1: One big
phase) while keeping the sub-item ordering intuitive — a reviewer
walking the diff sees CSS → service → component changes in
narrative order.

Phase 2 ships the bundle to prod via the same dance documented in
`[[unstuck-production]]`.

## Phase 1: Bundle implementation

### Overview

Apply all 6 sub-items in `src/styles/global.css`, `src/lib/services/`,
`src/components/AppTopbar.astro`, and
`src/pages/courses/[slug]/lessons/[lessonSlug].astro` (+ a one-line
addition to `src/components/lesson/LessonAside.tsx`). Each sub-item is
independent — no internal phase ordering risk.

### Changes Required

#### 1.A `cursor: pointer` base-layer rule (UNS-15)

**File**: `src/styles/global.css`

**Intent**: Eliminate the surprise default-cursor on every interactive
control once and for all. Removes the per-component cursor-pointer
churn that future buttons would otherwise inherit.

**Contract**: Inside the existing `@layer base { ... }` block, add a
rule that targets `<button>` of any type, anything with `role="tab"`,
and anchor tags carrying `href`. Excludes `:disabled` so disabled
buttons keep the not-allowed cursor.

#### 1.B Global custom scrollbar matching `chat-scroll` (UNS-23)

**File**: `src/styles/global.css`

**Intent**: Replace the OS-default page scrollbar with the cosmic
thin-thumb style already used by `ChatPanel`, so the document chrome
matches the panel aesthetic.

**Contract**: Inside `@layer base`, add an `html` rule applying the
same Firefox `scrollbar-width: thin` + `scrollbar-color: hsl(var(--border)) transparent`
and the same WebKit `::-webkit-scrollbar*` cascade currently defined for
`.chat-scroll` (`global.css:170-186`). Inherit-by-default for `body` and
inner scroll containers (no per-element opt-out needed). The
`.chat-scroll` class remains in the file untouched — it's now
effectively redundant but no removal in scope.

#### 1.C Lesson page grid collapses with aside (UNS-18)

**File(s)**:
- `src/components/lesson/LessonAside.tsx` (one-line edit to surface state via DOM)
- `src/pages/courses/[slug]/lessons/[lessonSlug].astro` (grid wrapper class change)

**Intent**: When `LessonAside` is in the desktop-collapsed state, the
lesson page's CSS grid drops the reserved 360px right column so the
video + content take the full freed width. Pure CSS via `:has()` — no
state lifting, no extra island, no events.

**Contract**:
- On `LessonAside.tsx`'s root rendered element (both the collapsed pill
  button branch at `LessonAside.tsx:136-155` AND the expanded surface
  branch at `LessonAside.tsx:158-296`), add `data-aside-collapsed={collapsed
  ? "true" : "false"}`. Same attribute on both branches so the selector
  always finds it regardless of which branch is mounted.
- On `lessonSlug.astro:61`, change the grid wrapper class to add the
  `:has()` variant: when a descendant matches
  `[data-aside-collapsed="true"]`, switch the desktop grid template to
  `lg:grid-cols-1`. Use Tailwind v4's arbitrary variant syntax:
  `[&:has([data-aside-collapsed='true'])]:lg:grid-cols-1`. The
  existing `lg:grid-cols-[minmax(0,1fr)_360px]` becomes the default.

#### 1.D Extract `getDisplayNameOrFallback` to profiles service

**File**: `src/lib/services/profiles.ts` (new)

**Intent**: One source of truth for the display-name resolution + fallback
chain. Needed by both `lessonSlug.astro` (current inline consumer) and
`AppTopbar.astro` (new consumer per 1.E). Removes duplicated inline
logic before two-copy drift can start.

**Contract**: Export
`async function getDisplayNameOrFallback(supabase: SupabaseClient, userId: string, emailFallback: string | null): Promise<string | null>`.
Internals: query `profiles.display_name` for `id = userId`; on hit
return `display_name`; on miss return `emailFallback?.split("@")[0] ?? null`.
On Supabase error: `console.error` and return the email-local-part
fallback (matches the `console.error` + safe-fallback convention in
`courses.ts` and `completions.ts`).

Then refactor `lessonSlug.astro:32-35` inline block to call this
helper (3 lines → 1 line). Verify type alignment — return type is
`string | null`, which is what the page already passes to
`<LessonAside userDisplayName=...>`.

#### 1.E AppTopbar username pill (UNS-17)

**File**: `src/components/AppTopbar.astro`

**Intent**: Stop leaking the user's raw email in the topbar; show the
display_name (with email-local-part fallback) as a styled pill. Closes
the privacy regression noted in the parked item.

**Contract**:
- Top of frontmatter: import `getDisplayNameOrFallback` from
  `@/lib/services/profiles` and create the Supabase client (same SSR
  pattern as `lessonSlug.astro:11-12`).
- Resolve `displayName` server-side from `Astro.locals.user?.id` +
  `Astro.locals.user?.email`. Skip the query if no user (signed-out
  branch of the existing conditional already renders Sign in / Sign up).
- Replace `<span class="text-muted-foreground">{user.email}</span>`
  (line 16) with a username pill: a `<span>` styled as a cosmic-themed
  pill (rounded-full, `bg-primary/10 text-primary` or similar; pick
  styling that visually distinguishes it from the Dashboard / Sign-out
  links). Show `displayName ?? "Learner"`.

#### 1.F Lesson prev/next arrows + "Lesson N of M" badge (UNS-22)

**File**: `src/pages/courses/[slug]/lessons/[lessonSlug].astro`

**Intent**: (a) Add right-aligned Back / Next arrows in the back-link
container so users can walk the course linearly without returning to
the catalog. (b) Surface the current lesson's position via a cosmic
"Lesson N of M" badge above the H1.

**Contract**:
- After the existing `chapters` is loaded (lines 40-47), derive a
  flattened lesson array: `const allLessons = chapters.flatMap(ch => ch.lessons)`.
  Compute `currentIndex = allLessons.findIndex(l => l.id === lesson.id)`,
  `prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null`,
  `nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null`,
  `totalLessons = allLessons.length`.
- Refactor the back-link container (lines 55-60) into a 3-column flex/grid:
  back-link on the left, prev/next arrows on the right. Inline SVG
  arrows (consistent with the existing Reading badge SVG at lines 84-96
  — no lucide-react in `.astro` files). Hide the prev arrow when
  `prevLesson == null`; hide the next arrow when `nextLesson == null`.
  Each arrow is an `<a href={"/courses/" + course.slug + "/lessons/" + sibling.slug}>`
  with an accessible label.
- Above the H1 (`lessonSlug.astro:101`), add a cosmic-styled badge:
  `Lesson {currentIndex + 1} of {totalLessons}`. Match the styling
  pattern of the existing "Reading" badge (rounded-full, border + bg,
  small uppercase tracked text) but with a different accent so it
  reads as informational, not categorical.
- Guard the whole block on `currentIndex !== -1` (lesson found in
  course chapters) — fallback to current back-only behaviour if not
  found (defensive; shouldn't happen given the RLS-gated lookups).

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0
- `npx astro check` exits 0
- `npm run build` exits 0

#### Manual Verification

- **1.A cursor**: hover any `<button>` (Mark Complete, Sign out,
  composer Send, LessonAside tabs, collapse button, etc.) and any
  `<a href>` (Dashboard, lesson links) — cursor is pointer. Disabled
  buttons still show not-allowed.
- **1.B scrollbar**: open a long page (a lesson with lots of content
  or the courses index); document scrollbar matches the chat-panel
  thin cosmic styling, both Chrome/Firefox.
- **1.C aside-fluid**: open a lesson, collapse the aside via the
  desktop button → main content area expands to fill the width
  (no reserved 360px). Re-open via pill handle → grid restores the
  360px column.
- **1.D + 1.E topbar**: sign in, open any in-app page (dashboard,
  catalog, course, lesson). Topbar shows username pill with
  `display_name` (or email-local-part for legacy accounts without
  one) — never the raw email. Refactored
  `lessonSlug.astro` server query path still works (chat header,
  composer auto-attribute don't regress).
- **1.F prev/next + badge**: open the first lesson of any course →
  Back arrow hidden, Next arrow visible, badge shows "Lesson 1 of
  N". Walk via Next → URL changes, badge increments, Back appears.
  On the last lesson → Next hidden. "Lesson N of N" badge visible.
- **No regression**: chat works (post a message, Realtime delivers),
  Mark Complete works, LessonAside Lessons tab still highlights
  current lesson.

**Implementation Note**: pause for manual confirmation after
automated checks pass; proceed to Phase 2 only after the human
walks the checklist.

---

## Phase 2: Prod deploy + smoke

### Overview

Ship the bundle to the live Cloudflare Worker using the same dance as
S-04..S-07.

### Changes Required

#### 1. Deploy app code to prod Cloudflare Worker

**File**: External (build + wrangler deploy)

**Intent**: Push the polished components to the live Worker so prod
visually matches the just-reviewed code.

**Contract**: Same recipe as `[[unstuck-production]]`:
- `mv .dev.vars .dev.vars.local.bak`
- `SUPABASE_URL=https://rhcioqeawpbuylbmkxnr.supabase.co SUPABASE_KEY=<anon-jwt> npm run build`
- Verify bundle has prod ref + zero `127.0.0.1` references:
  `grep -roE "(rhcioqeawpbuylbmkxnr|127\.0\.0\.1:54321)" dist/client/_astro/`
- `npx wrangler deploy`
- `mv .dev.vars.local.bak .dev.vars`

### Success Criteria

#### Automated Verification

- Pre-deploy `npm run lint` exits 0
- Pre-deploy `npm run build` exits 0
- Post-deploy curl `https://unstuck.lukasz-rdzanek.workers.dev/courses/generative-ai-leader/lessons/introduction`
  returns HTTP 302 to signin (protected route unchanged)

#### Manual Verification

- Prod topbar shows username pill (not email).
- Prod lesson page: collapse aside → content takes full width.
- Prod lesson page: prev/next arrows work; badge correct.
- Prod cursor + scrollbar visible globally.
- Realtime chat + Mark Complete still work end-to-end on prod.

**Implementation Note**: pause for manual confirmation before
closing.

---

## Testing Strategy

### Unit Tests

None — repo has no test suite (Module 3 of 10xDevs introduces testing).
Verification is automated-check + manual walk.

### Integration Tests

The RLS regression probe (`supabase/tests/rls_matrix.sql`) is unaffected
by this slice — no schema changes. Re-runs cleanly as a sanity check at
any point.

### Manual Testing Steps

End-to-end on prod after Phase 2 ships:

1. Sign in as operator.
2. Topbar: username pill visible (not email); Sign out works.
3. Open a course → click any lesson → topbar shows back-link + prev/
   next + Lesson N of M badge.
4. Walk via Next arrow through 2-3 lessons; badge increments; Back
   arrow appears after lesson 1.
5. Collapse aside via desktop button → main content expands to full
   width; re-open via pill handle restores layout.
6. Cursor: hover any button — pointer; hover any link — pointer.
7. Scrollbar: scroll a long page — cosmic thin style.

## Performance Considerations

- 1.A + 1.B: pure CSS additions, zero runtime cost.
- 1.C: `:has()` is browser-native; no JS overhead. Tailwind v4's
  `[&:has(...)]` compiles to a static selector.
- 1.D: extracting the helper does NOT add a query — same single
  `select display_name` as today. AppTopbar adds ONE extra query per
  in-app page render (currently it doesn't query Supabase at all). On
  Cloudflare Workers → Supabase, this is ~50-150ms added to the first
  byte of in-app pages. Acceptable given the page is otherwise
  uncached SSR; no extra round-trip vs. the lesson page (which already
  queries profiles).
- 1.E: no client-side bundle change (pure SSR Astro component).
- 1.F: zero new queries (data already in `chapters`); ~10 lines of
  derivation + 2 inline SVG components.

## Migration Notes

No schema migration. No localStorage keys. No data migration.

Rollback: revert the Phase 1 commit. Phase 2 is mechanical re-deploy
of an earlier version.

## References

- Change: `context/changes/lesson-page-polish-bundle/change.md`
- Related parked items (now bundled):
  [UNS-15](https://linear.app/unstack-ai/issue/UNS-15),
  [UNS-17](https://linear.app/unstack-ai/issue/UNS-17),
  [UNS-18](https://linear.app/unstack-ai/issue/UNS-18),
  [UNS-22](https://linear.app/unstack-ai/issue/UNS-22),
  [UNS-23](https://linear.app/unstack-ai/issue/UNS-23)
- Existing scrollbar styling: `src/styles/global.css:170-186`
- S-07 lesson page (the page we're polishing): `src/pages/courses/[slug]/lessons/[lessonSlug].astro`
- S-07 LessonAside (the island carrying collapsed state): `src/components/lesson/LessonAside.tsx`
- AppTopbar: `src/components/AppTopbar.astro`
- Memory pointer: `[[unstuck-production]]` (applies in Phase 2)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bundle implementation

#### Automated

- [x] 1.1 `npm run lint` exits 0 — 77d5916
- [x] 1.2 `npx astro check` exits 0 — 77d5916
- [x] 1.3 `npm run build` exits 0 — 77d5916

#### Manual

- [x] 1.4 cursor: hover buttons + tabs + links → pointer; disabled buttons still not-allowed — 77d5916
- [x] 1.5 scrollbar: long page scrollbar matches chat-panel thin cosmic style (Chrome + Firefox) — 77d5916
- [x] 1.6 aside-fluid: collapse aside → content takes full width; re-open restores 360px column — 77d5916
- [x] 1.7 topbar: username pill shows display_name (not email); refactored profiles service in use — 77d5916
- [x] 1.8 prev/next + badge: first lesson hides Back; last hides Next; walk increments badge correctly — 77d5916
- [x] 1.9 no regression: chat post + Realtime, Mark Complete toggle, LessonAside Lessons highlight still work — 77d5916

### Phase 2: Prod deploy + smoke

#### Automated

- [x] 2.1 Pre-deploy `npm run lint` exits 0 — 8ec2967
- [x] 2.2 Pre-deploy `npm run build` exits 0 — 8ec2967
- [x] 2.3 Post-deploy curl `/courses/generative-ai-leader/lessons/introduction` returns HTTP 302 — 8ec2967

#### Manual

- [x] 2.4 Prod topbar shows username pill (not email) — 8ec2967
- [x] 2.5 Prod lesson page: collapse aside → content takes full width — 8ec2967
- [x] 2.6 Prod lesson page: prev/next arrows + Lesson N of M badge work — 8ec2967
- [x] 2.7 Prod cursor + scrollbar visible globally — 8ec2967
- [x] 2.8 Prod no-regression: Realtime chat + Mark Complete still work end-to-end — 8ec2967
