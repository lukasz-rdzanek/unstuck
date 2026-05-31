# Lesson Nav Panel + Chat Collapse Implementation Plan

## Overview

Turn the lesson page's right-side aside (currently chat-only) into a
tab-switching panel with two tabs: Chat (S-02 NORTH STAR) and Lessons
(chapter hierarchy + completion check + current-lesson highlight +
click-to-nav). A thin pill handle on the right edge collapses the
whole aside so the lesson body takes the full content column for
distraction-free reading. Tab choice and collapsed state persist in
localStorage. ChatPanel stays mounted and uses a CSS display toggle
when the Lessons tab is active so its Realtime subscription never
reconnects. On mobile the existing bottom drawer wraps both tabs.

## Current State Analysis

The aside region on the lesson page was scoped to chat-only in S-02 and
hasn't been touched since:

- `src/pages/courses/[slug]/lessons/[lessonSlug].astro:47, 96-98` — grid
  `lg:grid-cols-[minmax(0,1fr)_360px]` with `<aside class="lg:sticky
  lg:top-8 lg:self-start"><ChatPanel client:load … /></aside>`. The
  aside slot is the integration point for the new wrapper.
- `src/components/chat/ChatPanel.tsx` — owns ALL of: (a) container
  surface styling (rounded-2xl, border, backdrop-blur, cosmic glow),
  (b) mobile drawer logic (collapsed bar → expanded overlay with
  body scroll-lock + new-message pulse + Open/Close controls),
  (c) the actual chat content (header with title + count, scroll
  region with reconnect toast + load-older button + message bubbles +
  new-message pill, Composer). All three concerns currently live in
  one file.
- `src/lib/services/courses.ts:listChaptersWithLessonsForCourse` and
  `src/lib/services/completions.ts:getCompletedLessonIdsForCourse` —
  both already used by `/courses/[slug]/index.astro` (course detail)
  to render the same chapter/lesson hierarchy the new nav panel needs.
  No new service work required.
- `src/pages/courses/[slug]/lessons/[lessonSlug].astro:36, 40` — already
  resolves `userId` and `isCompleted` server-side for the
  MarkCompleteButton seed (S-06). We extend this to also fetch
  `chapters` + `completedLessonIds` + `currentLessonId` for the new
  LessonAside.
- React-island convention: `src/components/auth/SignInForm.tsx` (S-04)
  and `src/components/lesson/MarkCompleteButton.tsx` (S-06) establish
  the patterns — `client:load`, default export, props interface above
  the component, `useRef` for synchronous-state needs that
  `useState` can't satisfy, `useEffect` cleanup for any timers/
  listeners that survive across re-renders.
- `cn()` from `@/lib/utils` is the Tailwind class-merging helper —
  used heavily inside `ChatPanel.tsx` and elsewhere; the new wrapper
  will follow the same pattern for conditional classes.
- `lucide-react` icons inside React islands (`X` in ChatPanel,
  `CheckCircle2` + `Send` + `ArrowRight` across the auth + lesson
  components); inline SVG inside Astro pages (S-05 P4 convention).
- Roadmap parked items currently include "RLS-gated lessons vs empty
  chapter disambiguation" (S-05 F1) — out of scope for this slice;
  the LessonsNav panel will only render for signed-in users (same
  context as MarkCompleteButton) so the gated-vs-empty case doesn't
  apply here.

## Desired End State

A signed-in user opens any lesson. The right-side aside shows a tab
strip at the top — "Chat" and "Lessons" — with Chat selected by default
on first contact. Switching to Lessons reveals the chapter hierarchy of
the course: each chapter title + its lessons listed below with green
checks on completed lessons (S-06), faded title on completed lessons,
and a cosmic-gradient left-border highlight on the current lesson. Click
on any lesson navigates to that lesson page (full SSR load). Switching
back to Chat shows the chat instantly — no reconnect, no flash. A thin
pill handle on the right edge of the screen lets the user collapse the
whole aside; clicking the handle again re-opens. Both the tab choice
and the collapsed state persist in localStorage so the user's
preference carries across lessons. On mobile (< 1024px) the same tab
strip lives inside the existing bottom drawer (S-02 pattern), and the
collapse control is the drawer's close button.

### Key Discoveries:

- Container chrome (surface styling + mobile drawer + body
  scroll-lock + collapse/expand controls) is a wrapper concern, not a
  chat concern. Extracting it from ChatPanel makes the wrapper
  responsibility composable — LessonAside owns chrome, ChatPanel
  becomes pure content.
- ChatPanel's scrollRef + wasAtBottomRef + showNewPill logic is
  scroll-position-aware. When the Chat tab is hidden via CSS
  display, the scroll container has zero rendered height; on tab
  switch back, the existing layoutEffect runs and re-applies
  `el.scrollTop = el.scrollHeight` if `wasAtBottomRef.current` is
  true — so scroll-to-bottom on return is automatic and free.
- The "new since collapse" pulse signal (`hasNewSinceCollapse` in
  ChatPanel) generalises to "new since tab switched away from Chat".
  The LessonAside wrapper subscribes to a callback from ChatPanel
  (`onMessageReceived`) and renders a pulse dot on the Chat tab
  when active tab is Lessons.
- Mobile drawer behaviour (collapsed bar → expanded near-full-screen
  with body scroll-lock) lives in the wrapper now, not ChatPanel. The
  bar shows the active tab name + pulse indicator; the expanded
  overlay shows the tab strip + active content.
- `currentLessonId` is the lesson the user is currently viewing.
  LessonsNav highlights it with `border-l-4` + cosmic-gradient
  border-image + `bg-primary/10`. The link is still rendered so the
  user can click it (refresh-style) — no special "you are here, can't
  click" state.

## What We're NOT Doing

- **Keyboard shortcuts** (j/k or arrow keys for prev/next) — power-user
  nice-to-have, parked for a later slice if users actually ask.
- **Chapter-level X/Y completion ratio** ("3/5 lessons done in this
  chapter") — already parked from S-05 F1; aggregate compute is a
  separate concern.
- **Resume-where-you-left-off banner on course detail** — requires a
  "last visited lesson" tracking field; future slice.
- **Cross-course navigation from the panel** — MVP scope is one course;
  out per ship-over-polish.
- **Prev/next as separate buttons** — Lessons tab click on the next
  lesson IS the prev/next affordance; no second mechanism.
- **Auto-scroll the Lessons list to the current lesson on tab open** —
  course is short enough that the list is visible in one viewport.
  Will revisit when a course exceeds ~15 lessons.
- **Tab keyboard navigation (Tab key cycles through tab strip)** —
  the strip is two buttons; default browser focus handling is enough.
- **Realtime "tab switched away" toast / notification when chat
  receives a message** — the existing pulse dot on the Chat tab covers
  this with zero noise.
- **Persisting collapse state per-course or per-lesson** — global
  collapse-or-open preference is enough; granular per-page state
  adds complexity without obvious user benefit.

## Implementation Approach

Three phases. Phase 1 is a pure refactor — extract the container chrome
(surface + mobile drawer + scroll-lock) out of ChatPanel into a new
wrapper, leaving ChatPanel as pure chat content. We verify the refactor
against the existing S-02 manual checks (chat works desktop + mobile,
Realtime delivery, optimistic post, etc.) before touching any new
behaviour. Phase 2 builds the LessonAside wrapper with tab switcher +
collapse + Lessons content; mounts it on the lesson page in place of
the bare ChatPanel reference. Phase 3 ships to prod and smoke-tests.

The refactor-first sequencing matters: the new LessonAside is a
composition of the extracted chrome + a tab switcher + ChatPanel and
LessonsNav as children. If we tried to do both in one phase, a single
broken commit could break the S-02 NORTH STAR (chat) AND ship the
new feature half-baked. Phase 1 gives a clean checkpoint where chat
behaviour is identical and the chrome is decoupled, ready to host the
new wrapper.

## Critical Implementation Details

- **CSS display toggle, not conditional render, for Chat when tab=Lessons.**
  `<div className={cn("flex flex-col", activeTab !== "chat" && "hidden")}>` keeps
  ChatPanel in the DOM with its Realtime subscription, scroll position,
  and message state intact. Conditional render (e.g.
  `{activeTab === "chat" && <ChatPanel … />}`) would unmount and
  re-mount on each switch, triggering a Realtime reconnect (~200-500ms)
  and losing scroll position. The user would see "Loading…" on every
  return to Chat — a regression from S-02.
- **localStorage write must be guarded for SSR.** The React island
  mounts with `client:load`, so `typeof window === "undefined"` is
  false at runtime — but reading/writing localStorage during the
  initial render hydration window can throw on locked-down browsers
  (Safari private mode). Wrap reads in a try/catch with a sensible
  default; wrap writes in a try/catch that silently swallows quota
  errors. Same idiom as the S-02 chat scroll guard.
- **"New chat messages while on Lessons tab" pulse signal.** Wrap
  `useChatMessages.messages.length` in a `useRef` that LessonAside
  tracks via a callback — the parent compares the previous length to
  the new and, if tab is currently Lessons, flips
  `hasNewChatMessages` to true. Clearing happens on tab switch back
  to Chat (or on drawer reopen on mobile). This mirrors S-02
  Phase 4's `hasNewSinceCollapse` signal — same shape, different
  trigger.
- **The collapsed-aside thin pill handle is `fixed` to the viewport,
  not part of the grid layout.** Otherwise it would disappear when
  the aside is collapsed (grid column drops out). Position:
  `fixed right-0 top-1/2 -translate-y-1/2 z-40`; the lesson grid
  becomes `lg:grid-cols-1` when collapsed so the content column
  takes the full width. On mobile the collapsed state means the
  bottom drawer is closed (existing pattern) — the pill handle is
  desktop-only (`hidden lg:flex`).

## Phase 1: Refactor ChatPanel — extract chrome into composable wrapper

### Overview

Pure refactor. Move the container surface styling, mobile drawer
state/lock/controls, and the collapse-bar-to-expanded-overlay logic
out of ChatPanel into a new component `ChatPanelChrome.tsx`. After
this phase, ChatPanel.tsx renders only the chat content (header with
title + count, scroll region with reconnect toast + load-older +
messages + new-pill, Composer). The lesson page mounts
`<ChatPanelChrome><ChatPanel … /></ChatPanelChrome>` and behaves
identically to today.

### Changes Required:

#### 1. New `src/components/chat/ChatPanelChrome.tsx`

**File**: `src/components/chat/ChatPanelChrome.tsx` (new)

**Intent**: Container component that owns the surface styling, the
mobile drawer state (collapsed bar ↔ expanded overlay), the body
scroll-lock on mobile expansion, and the open/close controls. Renders
children inside the styled container.

**Contract**: Props: `children: React.ReactNode`. State:
`isExpanded` (mobile drawer), `hasNewSinceCollapse` (mobile pulse
signal — populated externally via callback in Phase 2; in Phase 1 it
stays internal). Layout mirrors today's `ChatPanel.tsx:142-286` outer
`<div>`:
- Common surface classes (`bg-card/95 border-border backdrop-blur-xl`).
- Mobile collapsed bar: `fixed inset-x-0 bottom-0 z-40 rounded-t-2xl
  border-t` with a tap button that opens the drawer.
- Mobile expanded: `top-16 z-50 flex flex-col`.
- Desktop revert: `lg:shadow-cosmic-glow lg:bg-card/40 lg:relative
  lg:inset-auto lg:top-auto lg:z-auto lg:flex lg:flex-col
  lg:rounded-2xl lg:border`.
- Close button (mobile expanded only): `<X />` icon, calls
  `setIsExpanded(false)`.
- Body scroll-lock effect: when `isExpanded && mobile`, set
  `document.body.style.overflow = "hidden"`; cleanup restores.
- Tap target on collapsed bar: shows "Live peer chat" as default
  label (placeholder text; replaced in Phase 2 by tab strip).

#### 2. Refactor `src/components/chat/ChatPanel.tsx`

**File**: `src/components/chat/ChatPanel.tsx`

**Intent**: Strip the container chrome and drawer logic out. The
component becomes pure chat content — header, scroll area, message
list, new-message pill, Composer. Props unchanged.

**Contract**: Remove the outer wrapper `<div className={cn(...)}>`
(lines 142-153). Remove the mobile collapsed bar (lines 156-173).
Remove the close button (lines 192-201). Remove the body scroll-lock
effect (lines 96-106). Remove `isExpanded`, `openDrawer`, `closeDrawer`,
`MOBILE_MEDIA`, `hasNewSinceCollapse` (these move to the chrome).
Keep `useChatMessages` hook + all message rendering + scroll-position
tracking + new-message pill + Composer mount. The component returns
the existing inner `<div className="flex flex-col p-4 lg:p-6 …">` (line
176) as its root. Update success-criteria classes so the chat content
fills the chrome regardless of mobile collapsed/expanded — the
chrome already gates visibility via the wrapper structure.

#### 3. Update lesson page to mount chrome around ChatPanel

**File**: `src/pages/courses/[slug]/lessons/[lessonSlug].astro`

**Intent**: Wrap the existing `<ChatPanel client:load … />` mount
in the new `<ChatPanelChrome client:load>` so behaviour is identical
post-refactor.

**Contract**: Replace lines 96-98 `<aside …><ChatPanel client:load
… /></aside>` with `<aside …><ChatPanelChrome client:load>
<ChatPanel client:load … /></ChatPanelChrome></aside>`. Note:
Astro's `client:load` directive applies per island; mounting two
client:load islands nested is fine because the outer one owns the
hydration boundary and the inner is just JSX inside it. Verify by
checking the browser bundle includes both.

### Success Criteria:

#### Automated Verification:

- `npm run lint` exits 0.
- `npx astro check` exits 0.
- `npm run build` exits 0.

#### Manual Verification:

- Desktop (lg+): lesson page renders with the chat panel on the right
  exactly as before — same border, same glow, same scroll, same
  Composer, same Realtime delivery, same new-message pill.
- Mobile (<lg): collapsed bar at bottom shows "Live peer chat" +
  message count. Tap → expands to near-full-screen overlay with
  body scroll-lock. Close button works. Re-open works.
- Optimistic post + retry/discard flow from S-02 still works in both
  viewports.
- Realtime delivery from another tab still appears in real-time.

---

## Phase 2: Build LessonAside (tabs + collapse + LessonsNav)

### Overview

Build the new `LessonAside.tsx` wrapper that composes
ChatPanelChrome's chrome behaviour with a tab switcher + collapse +
LessonsNav content + persistence. Wire it into the lesson page in
place of the bare chrome-wrapped ChatPanel. After this phase, the
feature is fully working on local — both tabs work, collapse +
re-open via the pill handle works, mobile drawer holds the tab
switcher, completion state + current-lesson highlight render
correctly, click-to-nav works.

### Changes Required:

#### 1. New `src/components/lesson/LessonsNav.tsx`

**File**: `src/components/lesson/LessonsNav.tsx` (new)

**Intent**: Pure-presentational component (not a React island — runs
inside LessonAside which is the island) that renders the chapter
hierarchy with completion state + current-lesson highlight. Click on
any lesson is a standard `<a>` navigation (full page load).

**Contract**: Props:
- `courseSlug: string`
- `chapters: ChapterWithLessons[]` (from S-05)
- `completedLessonIds: Set<string>` (from S-06; serialised to string[] for
  prop passing, deserialised to Set inside the component)
- `currentLessonId: string`

Renders:
- For each chapter, a section with `<h3>` heading (smaller scale than
  course detail because the panel is narrower) prefixed by position
  number.
- For each lesson under that chapter, an `<a href="/courses/<slug>/lessons/<lesson.slug>">`
  with:
  - Green check icon (lucide-react `CheckCircle2`) if completed,
    otherwise position number.
  - Title text — `text-foreground/60` if completed; `text-foreground`
    otherwise; `font-bold` if `lesson.id === currentLessonId`.
  - "Reading" badge if `lesson.video_url === null`.
  - Container: rounded card; if current: `border-l-4` with
    cosmic-gradient + `bg-primary/10`; otherwise normal `border` like
    the course-detail lesson cards.
- Empty chapter: muted "No lessons in this chapter yet." (same as
  course-detail).

Set conversion: the prop comes in as `string[]` (because Sets aren't
serializable across the SSR → React island boundary cleanly); convert
to `Set<string>` once at the top of the component via
`useMemo(() => new Set(completedLessonIds), [completedLessonIds])`.

#### 2. New `src/components/lesson/LessonAside.tsx`

**File**: `src/components/lesson/LessonAside.tsx` (new)

**Intent**: The new React island that owns the lesson page's right
aside. Composes ChatPanelChrome (container chrome) with a tab
switcher (Chat / Lessons), a collapse button, a fixed-position thin
pill handle to re-open when collapsed, and CSS-toggled ChatPanel +
LessonsNav as the two tab contents. Persists `activeTab` and
`collapsed` in localStorage.

**Contract**: Props mirror the union of ChatPanel's + LessonsNav's
needs:
- `lessonId: string`
- `userId: string | null`
- `userDisplayName: string | null`
- `courseSlug: string`
- `chapters: ChapterWithLessons[]`
- `completedLessonIds: string[]` (serialised Set)
- `currentLessonId: string`

State (all client-side):
- `activeTab: 'chat' | 'lessons'` — init from localStorage key
  `unstuck.lesson-aside.tab`, default `'chat'`. Wrap reads in
  try/catch (Safari private mode).
- `collapsed: boolean` — init from localStorage key
  `unstuck.lesson-aside.collapsed`, default `false`.
- `hasNewChatMessages: boolean` — pulse signal on the Chat tab when
  active tab is Lessons and a new message arrives. Reset on tab
  switch back to Chat.

Writes to localStorage on each change (also try/catch wrapped).

Renders (desktop, not collapsed):
- `<ChatPanelChrome>` wrapper.
- Inside chrome: tab strip header (two buttons "Chat" / "Lessons"
  with `aria-pressed`, cosmic-gradient underline on active);
  rendered above the content.
- Content area:
  - `<div className={cn("flex flex-col", activeTab !== 'chat' && 'hidden')}>` — ChatPanel mounted here, CSS-toggled to preserve state.
  - `{activeTab === 'lessons' && <LessonsNav … />}` — LessonsNav conditionally rendered (no Realtime concerns, OK to remount).
- Collapse button at the bottom-right of the chrome header (or top
  of the tab strip), uses `PanelRightClose` icon.

Renders (desktop, collapsed):
- ChatPanelChrome NOT mounted.
- Fixed-position pill handle: `fixed right-0 top-1/2 -translate-y-1/2
  z-40 rounded-l-2xl bg-card/40 border-l border-y backdrop-blur-xl
  px-2 py-4 hidden lg:flex flex-col items-center gap-2`. Contains
  `PanelLeftOpen` icon + vertically-stacked "Panel" label or
  rotated text. Click → `setCollapsed(false)`.

Renders (mobile):
- ChatPanelChrome mounted always (the bottom-bar/drawer pattern
  doesn't have a "collapsed" state — the drawer is the collapse
  affordance).
- Inside chrome's expanded view: same tab strip header.
- Collapsed bar label shows active tab name + the
  `hasNewChatMessages` pulse dot if Chat tab has new messages.

Pulse wiring: ChatPanel exposes a `messages.length` ref via a forwarded
callback `onMessageCountChange?: (count: number) => void`. LessonAside
tracks the previous count via `useRef`; when count grows AND active
tab is Lessons, sets `hasNewChatMessages = true`. Tab switch to Chat
sets it back to false.

#### 3. Lesson page server-side queries + LessonAside mount

**File**: `src/pages/courses/[slug]/lessons/[lessonSlug].astro`

**Intent**: Fetch chapters + completedLessonIds on the server (same
helpers used by course detail), pass them as serialisable props to
LessonAside, mount LessonAside in the aside slot instead of
ChatPanelChrome-wrapped ChatPanel.

**Contract**:
- Add imports for `listChaptersWithLessonsForCourse` (already
  imported elsewhere — courses service) and
  `getCompletedLessonIdsForCourse` (completions service).
- Wrap the existing `isCompleted` query + the new chapters and
  completedLessonIds queries in a single `Promise.all([...])` so all
  three Supabase round-trips run in parallel.
- The `course.id` is needed for both new queries; `result.course`
  has it (already destructured).
- Replace the Phase 1 `<ChatPanelChrome client:load><ChatPanel
  client:load … /></ChatPanelChrome>` mount with
  `<LessonAside client:load lessonId={lesson.id} userId={userId}
   userDisplayName={userDisplayName} courseSlug={course.slug}
   chapters={chapters} completedLessonIds={Array.from(completedLessonIds)}
   currentLessonId={lesson.id} />`. The aside container element + grid
  position are unchanged.
- Convert `completedLessonIds` Set to Array via `Array.from(...)` for
  prop serialisation; LessonAside reconverts inside.

### Success Criteria:

#### Automated Verification:

- `npm run lint` exits 0.
- `npx astro check` exits 0.
- `npm run build` exits 0.

#### Manual Verification:

- Desktop, first visit to a lesson page: aside shows tab strip with
  Chat active by default; Chat content fills the aside; LessonsNav
  is not visible.
- Switch to Lessons tab: chapter hierarchy renders; current lesson
  has cosmic-gradient left border + bg accent; completed lessons
  (mark some via the MarkCompleteButton first) show green check +
  faded title; "Reading" badge appears on text-only lessons.
- Click a different lesson in the LessonsNav: page navigates;
  Lessons tab is still active on the new page (localStorage
  persistence); the new lesson is now the highlighted one.
- Switch back to Chat: chat appears instantly, scroll position
  preserved from before, no "Loading…" or reconnect flash.
- Collapse via the button: aside disappears, content takes full
  width, thin pill handle visible on the right edge.
- Click pill handle: aside re-opens with the same tab active as
  before collapse.
- New chat message arrives via Realtime while on Lessons tab: the
  Chat tab shows a small pulse dot; switching to Chat clears it.
- Refresh the page: tab + collapse state restored from localStorage.
- Mobile (<lg): bottom bar still works; tap opens drawer; drawer
  has the tab strip on top; both tabs work inside the drawer;
  pulse dot works on the collapsed bar when a new message arrives.

---

## Phase 3: Prod deploy + smoke

### Overview

Ship Phase 1 + Phase 2 to prod and verify the full flow end-to-end on
the live Worker.

### Changes Required:

#### 1. Deploy app code to prod Cloudflare Worker

**File**: External (build + wrangler deploy)

**Intent**: Push the refactored + new components to the live Worker.

**Contract**: Same dance as the S-04/S-05/S-06 deploy steps
(recorded in `[[unstuck-production]]` memory): move `.dev.vars` aside,
build with prod `SUPABASE_URL`/`SUPABASE_KEY` env vars,
`npx wrangler deploy`, restore `.dev.vars`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` exits 0 (pre-deploy sanity).
- `npm run build` exits 0.
- Post-deploy `curl -sS https://unstuck.lukasz-rdzanek.workers.dev/courses/generative-ai-leader/lessons/introduction` returns HTTP 302 to signin (unchanged; protected route per S-01).

#### Manual Verification:

- Sign in on prod, open the seeded lesson page → tab strip visible,
  Chat selected by default, chat works.
- Switch to Lessons tab → chapter hierarchy renders; "Introduction"
  chapter contains the seed lesson; the current lesson is highlighted
  with cosmic-gradient left border.
- (If the user has marked any lesson complete via S-06) → green check
  + faded title visible on completed lessons.
- Click "Introduction" (current lesson) in the panel → no change in
  URL or content (we're already there); state preserved.
- Collapse via the button → aside collapses, thin pill handle appears.
- Click pill handle → aside re-opens.
- Refresh → tab + collapse state preserved.
- Mobile (open the prod URL on phone or via DevTools mobile emulation
  set to a < 1024px viewport): bottom bar shows tab strip on tap;
  both tabs work inside the drawer.

---

## Testing Strategy

### Unit Tests:

None for S-07 (repo carries no test suite; Module 3 of the 10xDevs
curriculum introduces testing). Verification is automated-check
+ manual-walk.

### Integration Tests:

The RLS regression probe (`supabase/tests/rls_matrix.sql`) is unaffected
by this slice — no schema changes. Re-runs cleanly as a sanity check
in Phase 1.

### Manual Testing Steps:

End-to-end after Phase 3 ships, on prod:

1. Sign in as operator → open lesson page.
2. Verify Chat is default tab; chat works (post a message, verify it
   appears, Realtime delivery from a second tab still works).
3. Switch to Lessons tab; verify the current lesson highlight, green
   check on any completed lessons, click navigation works.
4. Open a second tab on the same browser → verify localStorage tab
   preference is shared (both tabs default to whatever was last
   selected).
5. Collapse via button; verify aside collapses + pill handle appears.
6. Refresh → tab + collapse restore.
7. Mobile emulation: tap the bottom bar; verify drawer expands with
   tab strip on top; switch tabs; both work.

## Performance Considerations

The new server-side query (`getCompletedLessonIdsForCourse`) joins
through `lessons` filtered by `course_id` — trivial at MVP scale
(<100 lessons per user per course). Already proven on the course detail
page (S-06). Running both new queries in parallel with the existing
`isLessonCompletedByUser` via `Promise.all` keeps the lesson page
server render to a single round-trip wall-clock.

Client-side, the LessonAside React island adds ~5kb gzipped (tab logic
+ collapse + localStorage). No additional dependencies beyond what's
already in the bundle (lucide-react for icons). ChatPanel staying
mounted under CSS toggle has zero runtime cost when hidden.

## Migration Notes

No schema migration. The localStorage keys (`unstuck.lesson-aside.tab`,
`unstuck.lesson-aside.collapsed`) are new — users on first visit get
the defaults (Chat tab, panel expanded). No data migration needed.

Rollback: revert the Phase 2 + Phase 3 commits and the Phase 1
refactor. The S-02 ChatPanel works as-is post-refactor (verified at
Phase 1 manual check); the Phase 1 commit can stay or be reverted
independently. localStorage keys become orphaned but cause no harm —
they're just unused.

## References

- Related change: `context/changes/lesson-nav-panel-and-chat-collapse/change.md`
- S-02 chat panel (the file we refactor): `src/components/chat/ChatPanel.tsx`
- S-05 course detail hierarchy (the rendering pattern we mirror): `src/pages/courses/[slug]/index.astro:46-100`
- S-06 completion service: `src/lib/services/completions.ts:30-46`
- S-06 MarkCompleteButton (in-flight ref pattern reference): `src/components/lesson/MarkCompleteButton.tsx`
- Memory pointer: `[[unstuck-production]]` (prod project ref, Worker URL, `.dev.vars` build gotcha — applies in Phase 3).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Refactor ChatPanel — extract chrome into composable wrapper

#### Automated

- [x] 1.1 `npm run lint` exits 0 — 4a169e0
- [x] 1.2 `npx astro check` exits 0 — 4a169e0
- [x] 1.3 `npm run build` exits 0 — 4a169e0

#### Manual

- [x] 1.4 Desktop lesson page renders chat panel identically to today (border, glow, scroll, Composer, Realtime delivery, new-message pill) — 4a169e0
- [x] 1.5 Mobile (<lg) bottom bar collapses + expands; body scroll-lock works; close button works — 4a169e0
- [x] 1.6 Optimistic post + retry/discard flow from S-02 still works in both viewports — 4a169e0
- [x] 1.7 Realtime delivery from another tab still appears in real-time — 4a169e0

### Phase 2: Build LessonAside (tabs + collapse + LessonsNav)

#### Automated

- [x] 2.1 `npm run lint` exits 0 — 88c7edf
- [x] 2.2 `npx astro check` exits 0 — 88c7edf
- [x] 2.3 `npm run build` exits 0 — 88c7edf

#### Manual

- [x] 2.4 First visit: aside shows tab strip with Chat default; chat content fills the aside — 88c7edf
- [x] 2.5 Switch to Lessons tab → chapter hierarchy with current-lesson cosmic-gradient highlight + green check on completed + Reading badge on text-only — 88c7edf
- [x] 2.6 Click another lesson in LessonsNav → page navigates; Lessons tab still active; new lesson is highlighted — 88c7edf
- [x] 2.7 Switch back to Chat → instant (no Loading flash); scroll position preserved — 88c7edf
- [x] 2.8 Collapse button → aside disappears, full-width content, pill handle visible on right edge; click handle → re-opens with same active tab — 88c7edf
- [x] 2.9 New chat message while on Lessons tab → Chat tab shows pulse dot; switching to Chat clears it — 88c7edf
- [x] 2.10 Page refresh → tab + collapse state restored from localStorage — 88c7edf
- [x] 2.11 Mobile (<lg): bottom drawer holds tab strip; both tabs work inside drawer; pulse dot on collapsed bar when new message — 88c7edf

### Phase 3: Prod deploy + smoke

#### Automated

- [x] 3.1 Pre-deploy `npm run lint` exits 0 — 7b8998c
- [x] 3.2 Pre-deploy `npm run build` exits 0 — 7b8998c
- [x] 3.3 Post-deploy curl `/courses/generative-ai-leader/lessons/introduction` returns HTTP 302 (protected route unchanged) — 7b8998c

#### Manual

- [x] 3.4 Prod signed-in operator: tab strip visible on lesson page; Chat default; chat works — 7b8998c
- [x] 3.5 Prod Lessons tab: chapter hierarchy + current lesson highlighted; click navigates correctly — 7b8998c
- [x] 3.6 Prod collapse + re-open works via pill handle — 7b8998c
- [x] 3.7 Prod refresh: tab + collapse persist — 7b8998c
- [x] 3.8 Prod mobile (or emulated <1024px viewport): bottom drawer holds tab switcher; both tabs work — 7b8998c
