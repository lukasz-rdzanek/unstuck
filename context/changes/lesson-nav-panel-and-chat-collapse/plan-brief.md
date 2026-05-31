# Lesson Nav Panel + Chat Collapse — Plan Brief

> Full plan: `context/changes/lesson-nav-panel-and-chat-collapse/plan.md`

## What & Why

Turn the lesson page's right-side aside (chat-only since S-02) into a
tab-switching panel that holds Chat OR Lessons nav, with a collapse
toggle that hides the whole aside for distraction-free reading. The
Lessons tab gives the learner in-context navigation — chapter hierarchy
with completion state from S-06, current-lesson highlight, and
click-to-navigate — without leaving the lesson surface to use the
course detail page.

## Starting Point

S-02 shipped a chat-only aside that owns ALL of: container surface
styling, mobile drawer (collapsed bar ↔ expanded overlay + body
scroll-lock), and the actual chat content. S-05 + S-06 added chapter
hierarchy and per-user completion tracking, but only the course detail
page consumes that data — the lesson page doesn't expose it. The right
aside is the natural home, but ChatPanel's current shape couples chrome
to content; introducing a second tab requires extracting the chrome
first.

## Desired End State

A signed-in user opens any lesson and sees a tab strip at the top of
the right aside — "Chat" (default) and "Lessons". Switching to Lessons
shows the chapter hierarchy with green checks on completed lessons +
cosmic-gradient highlight on the current one; click navigates. Both
tab choice and collapse state persist across page loads. ChatPanel
stays mounted under a CSS toggle so its Realtime subscription never
reconnects. On mobile the same tab switcher lives inside the existing
bottom drawer.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Tab persistence | Default Chat + remember via localStorage | Chat is NORTH STAR (first-contact signal stays); learner browsing course remembers Lessons choice. |
| ChatPanel preservation | Keep mounted, CSS display toggle | Avoids 200-500ms Realtime reconnect + "Loading…" flash on every tab switch back to Chat. |
| Collapse re-open | Thin pill handle on right edge (fixed-position, desktop only) | Standard pattern (VSCode, Figma); always visible regardless of scroll. |
| Mobile UX | Tab switcher inside shared bottom drawer | One drawer = one interaction; collapse on mobile = drawer close. |
| Prev/next navigation | Click in Lessons tab only (no separate buttons) | Single source of truth; no duplication. |
| Current lesson highlight | Cosmic-gradient left-border + bg accent | Wyraziste, fits palette, scannable. |
| Collapse persistence | localStorage | Respects user preference across the course. |
| Out of scope | Keyboard shortcuts, chapter X/Y ratio, resume banner, cross-course nav | Each is its own slice; the panel surface stays focused. |

## Scope

**In scope:**
- New `ChatPanelChrome.tsx` — container surface + mobile drawer + body scroll-lock + open/close controls (extracted from ChatPanel).
- Refactored `ChatPanel.tsx` — pure chat content only (header + scroll area + messages + pill + composer).
- New `LessonsNav.tsx` — chapter hierarchy + completion check + current-lesson highlight + click-to-nav.
- New `LessonAside.tsx` (React island) — composes the chrome with tab strip + collapse + LessonsNav + ChatPanel.
- Server-side queries on the lesson page (Promise.all) feeding chapters + completedLessonIds + currentLessonId into LessonAside.
- localStorage persistence for activeTab + collapsed.
- Pulse dot on Chat tab when active=Lessons and a new message arrives.
- Mobile drawer integration (tabs inside the existing bottom drawer).
- Thin fixed-position pill handle (desktop only) to re-open the aside when collapsed.

**Out of scope:**
- Keyboard shortcuts (j/k or arrow keys).
- Chapter-level X/Y completion ratio.
- Resume-where-you-left-off banner.
- Cross-course navigation from the panel.
- Auto-scroll Lessons list to current lesson.
- "Tab switched away" toast (the pulse dot covers this).
- Schema changes — none needed.

## Architecture / Approach

```
src/pages/courses/[slug]/lessons/[lessonSlug].astro
  └─ <LessonAside client:load
       lessonId  userId  userDisplayName  courseSlug
       chapters  completedLessonIds  currentLessonId
     />
       └─ <ChatPanelChrome> (container surface + mobile drawer)
            └─ [tab strip — Chat / Lessons]
            └─ [collapse button]
            ├─ <ChatPanel> (display: hidden when tab=Lessons)
            └─ {tab === 'lessons' && <LessonsNav … />}

       fixed-position pill handle (desktop, collapsed-only)
         └─ click → setCollapsed(false)
```

Three phases. Phase 1 is a pure refactor (extract chrome from
ChatPanel); behaviour identical to today. Phase 2 builds the new
LessonAside + LessonsNav; wires into the lesson page. Phase 3 ships
to prod + smoke.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. ChatPanel refactor | ChatPanelChrome wrapper extracted; ChatPanel becomes pure content | Could break S-02 NORTH STAR if container styling drifts — mitigated by manual checks against S-02 success criteria before commit |
| 2. LessonAside + LessonsNav | Full feature working locally; tabs + collapse + persistence + mobile drawer integration | Pulse-dot wiring needs ChatPanel to surface message count to LessonAside via callback prop (small API surface addition) |
| 3. Prod deploy + smoke | Live on Worker; manual e2e verification | Standard deploy dance per `[[unstuck-production]]` memory |

**Prerequisites:**
- S-02 ChatPanel (✅ archived) — the component we refactor.
- S-05 chapter hierarchy + `listChaptersWithLessonsForCourse` (✅ archived).
- S-06 completion tracking + `getCompletedLessonIdsForCourse` (✅ archived).
- Wrangler authed (✅ verified during recent deploys).

**Estimated effort:** ~4-6 hours across 3 phases. Phase 2 carries the bulk (new wrapper component with several pieces of state + mobile drawer integration); Phase 1 is a careful refactor; Phase 3 is mechanical deploy + smoke.

## Open Risks & Assumptions

- **Astro nested `client:load` islands.** `<ChatPanelChrome client:load><ChatPanel client:load … /></ChatPanelChrome>` is the Phase 1 mount pattern. Astro processes islands per-file; the outer wrapper is one island, the inner is another. This works but is rare enough that we verify in Phase 1's automated build check + manual viewport test. Fallback if it misbehaves: collapse the chrome wrapper into LessonAside directly (skip the separate ChatPanelChrome export, just inline the chrome logic) — adds ~50 lines to LessonAside but eliminates the nested-island question.
- **localStorage in Safari private mode** throws on write. Wrap reads/writes in try/catch with sensible defaults — same idiom S-02 uses for the chat scroll guard.
- **`completedLessonIds` Set → Array → Set conversion** across the SSR / React-island boundary. Astro serialises props as JSON, so the Set becomes Array; LessonsNav re-converts via `useMemo`. Small ceremony, well-understood.
- **Pulse-dot wiring across components.** ChatPanel needs to expose a count signal to its parent (LessonAside) via callback prop. Adding `onMessageCountChange?: (count: number) => void` to ChatPanel is the lightest touch; pattern matches React's controlled-output convention.
- **Mobile pulse on collapsed bar** when both new messages arrive AND active tab is Lessons. The existing `hasNewSinceCollapse` from S-02 fires only when the drawer is collapsed; we need a similar signal when the drawer is open but the active tab is Lessons. Handled inside LessonAside's pulse state machine.

## Success Criteria (Summary)

- A signed-in user can switch between Chat and Lessons inside the lesson aside; both tab states persist via localStorage.
- The Lessons tab shows the chapter hierarchy with green checks on completed lessons (from S-06) and a cosmic-gradient highlight on the current lesson; clicking a lesson navigates.
- Collapsing the aside via the button hides the whole panel; a thin pill handle on the right edge re-opens it; collapse state persists.
- ChatPanel's Realtime subscription stays alive across tab switches (no reconnect, no Loading flash).
- Mobile drawer continues to work (S-02 behavior preserved), now holds the tab switcher inside.
