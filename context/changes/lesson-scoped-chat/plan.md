# Lesson-scoped Chat (S-02) — Implementation Plan

## Overview

S-02 is the validation milestone for Unstuck — the slice that exercises the riskiest
product hypothesis (lesson-scoped peer chat unblocks learners) and the riskiest technical
NFR (cross-viewer visibility under 2 seconds without degrading the lesson flow). The slice
wraps the chat-slot placeholder S-01 left in the lesson page (`<aside>`) with a real React
island: initial fetch of the last 50 messages (operator-seeded pinned on top, peer
chronological below), Supabase Realtime subscription for live new posts, optimistic UI
with reconciliation for the user's own posts, polling-refetch on reconnect with a toast,
and a minimal mobile bottom-drawer on narrow viewports. The operator-seeding workflow
ships as `docs/operator/seeding.md` plus expanded seed fixtures for local-dev demos.

When S-02 lands, US-01 closes end-to-end: a signed-in learner hits a blocker mid-lesson,
opens the chat, sees curated operator threads at the top, finds (or asks) one that
addresses the blocker, applies the fix, and resumes the lesson — without ever leaving the
page.

## Current State Analysis

**F-01 (DONE) gives the data layer**:
- `messages` table with `id`, `lesson_id`, `author_id` (FK → `profiles.id`, ON DELETE SET NULL),
  `body` (CHECK length 1–4000), `is_seeded`, `created_at`.
- Composite index `(lesson_id, is_seeded, created_at)` — exactly the hot read pattern
  S-02 needs (`WHERE lesson_id = $1 ORDER BY is_seeded DESC, created_at ASC`).
- RLS: anon nothing; authenticated SELECT gated by `has_course_access(course_id)`;
  authenticated INSERT only own + `is_seeded = false`; no UPDATE; no DELETE.
  service_role bypasses RLS (operator seeding hook).
- `messages` is in the `supabase_realtime` publication — delivery wiring is ready and the
  SELECT policy is what gates the subscribers (no extra filtering needed client-side for
  RLS).
- `src/types.ts` already exports `Message`, `NewMessage` (the `lesson_id + body` shape the
  composer submits), and `LessonChatMessage = Message & { author: Pick<Profile,'id'|'display_name'> | null }`.

**S-01 (DONE) gives the host page**:
- [src/pages/courses/[slug]/lessons/[lessonSlug].astro:64-72](src/pages/courses/[slug]/lessons/[lessonSlug].astro#L64-L72)
  contains the chat-slot `<aside>` placeholder ("Coming in S-02. The chat panel will
  live here on every lesson…") inside the desktop grid
  `lg:grid-cols-[minmax(0,1fr)_360px]`.
- AppLayout activates cosmic tokens (`.dark` wrapper), so any chat surface inherits the
  tokens automatically.
- Auth + middleware gating already in place — anon can't even reach the lesson page
  (middleware redirects to `/auth/signin?next=...`).
- Lesson page is 100% Astro right now; the chat panel will be the first React island
  introduced into this surface.

**Infrastructure constraints from `context/foundation/infrastructure.md`**:
- Cloudflare Workers Free has a 10ms CPU per invocation ceiling. Markdown-heavy lesson
  rendering already costs ~1–3ms; adding SSR of an initial 50-message chat would push
  closer to that ceiling. **Defer chat fetch to client mount** (per Round 1 Q4 answer).
- `nodejs_compat` compatibility flag is mandatory for the Supabase SDK and is already set
  in `wrangler.jsonc`.
- "Persistent connections delegated to Supabase Realtime" — explicit infrastructure
  commit. **Do not introduce Durable Objects.**

**The codebase has zero realtime client code today**:
- `src/lib/supabase.ts` exports an SSR-only cookie-based client. Realtime requires a
  browser-side client built from `@supabase/supabase-js`.
- No React component uses Supabase from the browser yet (auth forms post to the server).
- `astro.config.mjs` `env.schema` declares `SUPABASE_URL` / `SUPABASE_KEY` as
  `context: "server", access: "secret"` — both server-only. We'll need them client-side
  for the Realtime WebSocket, which means changing them to `context: "client"` or
  `context: "server-and-client"`. (The anon `SUPABASE_KEY` is safe to expose to the
  browser by design — it's the public anon key, gated by RLS.)

### Key Discoveries

- **Realtime echo dedup is the load-bearing detail.** When the user posts a message
  optimistically, the same INSERT will arrive back via the Realtime subscription. Without
  dedup we render a duplicate. The match key is `(author_id, body, ±5 s of created_at)`
  scoped to a pending bubble lifetime (10 s timeout window after which the pending bubble
  is replaced from the INSERT's RETURNING row).
- **Channel filter offloads to PostgreSQL.** Subscribing with
  `filter: 'lesson_id=eq.${lessonId}'` makes the server skip events for other lessons
  rather than wire-shipping them and filtering client-side. This is both bandwidth and
  RLS-cost efficient.
- **Mobile drawer doesn't need JS media queries.** We can express both desktop (in-aside)
  and mobile (fixed bottom bar) layouts in a single component via Tailwind responsive
  utilities. The `isExpanded` state only matters when the JS knows it's narrow viewport,
  but body scroll-lock can be conditional on `isExpanded && window.matchMedia('(max-width: 1023px)').matches`.
- **No need to fetch profiles separately for the signed-in user.** `Astro.locals.user.email`
  is available; F-01's signup trigger sets `profiles.display_name` to the email's local
  part by default. Pass `email.split('@')[0]` to the island for the "own message"
  rendering until/unless a profile-edit UI ships (out of MVP scope per PRD).
- **F-01 already seeded the demo content** (1 seed message + 1 peer message on the React
  Architecture lesson). Phase 1 verification works against the existing fixture; no DB
  re-seed required to see chat populate.

## Desired End State

A signed-in learner on a lesson page sees a chat panel populate with the operator-seeded
threads pinned on top and peer messages chronological below. They can compose a message
in a textarea (Enter to send, Shift+Enter for newline), see it appear instantly in their
own viewer, and within 2 seconds see it appear in any other open browser viewing the same
lesson. When a peer in another browser posts a message, it appears live in this learner's
chat panel without page reload. The chat does not pause video, does not steal scroll, does
not noticeably slow paint. On narrow viewports the chat collapses to a fixed bottom bar
the learner taps to expand into a 70 vh overlay with body scroll locked, then taps to
collapse again. If the Realtime connection drops mid-session, on reconnect the panel
refetches the last 50 messages, deduplicates against existing state, and surfaces a
"Reconnected — catching up" toast for 3 seconds. If a post fails (network, server error),
the optimistic bubble shows "Failed · Retry · Discard" inline. The operator has a markdown
guide (`docs/operator/seeding.md`) explaining how to insert seed messages through
Supabase Studio's SQL editor.

### How we verify the end state

- Signed-in learner on the React Architecture lesson sees ~6 messages in the chat
  (5 seeded + 1 peer after Phase 5 seed expansion).
- Posting a message: bubble appears in own viewer immediately; appears in a second
  browser within 2 s.
- Posting with network disabled: bubble shows "Failed · Retry · Discard" within 5 s.
- Toggle network back on and click Retry: succeeds.
- Resize viewport below 1024 px: chat collapses to fixed bottom bar; tap expands; tap
  close collapses.
- Open Supabase Studio in a third window, INSERT a peer message manually: appears within
  2 s in both open lesson windows.
- Disable network for 30 s, re-enable: "Reconnected — catching up" toast shows briefly,
  any messages inserted during the gap are present.
- `npm run lint`, `npm run build`, `npx astro check`, `npx supabase db reset` all exit 0.

## What We're NOT Doing

- **No edit, delete, or reactions by peers.** RLS denies UPDATE/DELETE for the
  `authenticated` role; PRD Non-Goals back this up. The composer is post-only.
- **No threading, search, sort, or peer-message pinning.** PRD Non-Goal; "load older"
  is sequential, not searchable.
- **No typing indicators, presence ("online users"), read receipts, or unread counts.**
  All non-MVP per PRD.
- **No attachments, images, file upload, or link previews.** Plain-text only per the
  `messages.body` CHECK constraint.
- **No moderator UI.** Deletion / curation by operator goes through service_role + SQL
  (S-03 will be the smallest possible "operator can delete any message" slice; out of
  S-02 scope).
- **No focus management or screen-reader polish on the mobile drawer.** Roadmap Open
  Question 2 (cross-device support floor) is still unresolved; we ship a functional
  drawer now and revisit a11y when the floor is set.
- **No Durable Objects, no custom WebSocket server.** infrastructure.md explicitly
  commits to Supabase Realtime as the message-push path.
- **No virtual-scroll library (react-virtuoso, react-window, etc.).** Premature at v1
  scale (dozens to ~100 users, max ~50 messages per lesson rendered at a time).
- **No client-side caching layer (TanStack Query, SWR, etc.).** A single component owns
  state; over-engineering with a cache layer isn't justified at this scope.
- **No tests.** No test framework is configured in the repo; verification stays on
  lint + build + astro check + manual walk-through (same as F-01 and S-01).
- **No update to `src/middleware.ts`.** Authenticated user is already attached to
  `Astro.locals.user`; lesson route is already gated; no new middleware concern.
- **No changes to schema or RLS.** F-01 already shipped everything S-02 needs.

## Implementation Approach

The chat panel is one React island (`<ChatPanel client:load />`) replacing the
placeholder `<div>` inside the lesson page's `<aside>`. State management is a custom
hook (`useChatMessages`) — no Redux, no context, no TanStack Query. The hook owns:
the message list, loading state, pending optimistic messages, the Realtime channel
subscription, reconnect detection, and the post/retry/discard actions. Components are
presentational (`MessageBubble`, `Composer`).

The Supabase browser client is built once per island mount via a new
`src/lib/supabase-browser.ts` that reads `SUPABASE_URL`/`SUPABASE_KEY` from
`astro:env/client` (declared in `astro.config.mjs`). This is the first time these env
vars are exposed to the client bundle; safe because the anon key is gated by RLS — the
same guarantee the SSR path already relies on.

The mobile drawer is pure CSS-driven: desktop renders the chat inside its `<aside>` slot;
narrow viewports apply Tailwind responsive utilities (`lg:`-prefixed for the desktop
shape) to flip the same DOM into a fixed bottom bar. `isExpanded` state plus body
scroll-lock are the only JS components of the drawer.

## Critical Implementation Details

- **Realtime echo dedup is the load-bearing detail.** When `useChatMessages.postMessage`
  inserts a pending bubble and fires the server INSERT, the same row will come back via
  the channel subscription. Without dedup we render a duplicate. The dedup match is:
  same `author_id` as the signed-in user, same `body`, and `created_at` within ±5 seconds
  of the pending bubble's optimistic timestamp. On match: replace the pending bubble
  (with `tempId`) by the real row (with server `id` + authoritative `created_at`).
  Fallback: if the channel echo doesn't arrive within 10 s but the INSERT itself
  succeeded (RETURNING gives us the row), replace the pending bubble from the INSERT
  result directly.

- **Auto-scroll on new message follows user intent.** Before applying a state update
  that adds a message, capture `wasAtBottom = (scrollTop + clientHeight >= scrollHeight - 50)`.
  After the DOM updates, scroll to bottom only if `wasAtBottom` was true at capture
  time. If false, show a "New ↓" pill near the bottom that scrolls into the new message
  when clicked. This is the standard chat scroll discipline (Slack, Discord); skipping
  it means new messages either yank the user away from what they're reading, or pile up
  silently below the fold.

- **Channel filter and naming.** Channel name is `lesson-chat-${lessonId}` (per-lesson
  scoping; one WebSocket per open lesson tab, max 1–2 at a time per user).
  Subscription:
  `channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: \`lesson_id=eq.${lessonId}\` }, handler)`.
  The PostgreSQL-side filter is what keeps the wire quiet and the RLS check cheap.

- **Cleanup on unmount is non-optional.** Channel `removeChannel(channel)` on cleanup;
  clear all timeouts/intervals (time-refresh, optimistic-timeout, scroll detection).
  Without this, navigating between lessons leaks subscriptions and intervals,
  manifesting as duplicate message echoes after enough navigation.

- **Client env exposure is a real config change.** `astro.config.mjs` must change
  `SUPABASE_URL` and `SUPABASE_KEY` from `context: "server"` to
  `context: "server-and-client"` (or accept a new public-prefixed var). The anon key is
  safe to expose (RLS gates everything), but this is the first time the value crosses
  the SSR boundary; the Worker payload size and build output will grow by ~100 bytes.
  Document in AGENTS.md (Phase 5 close-out).

## Phase 1: Chat panel scaffold + read path

### Overview

Land the React island shell, the Supabase browser client, the message-list service
helpers, the Discord-style `MessageBubble`, the `useChatMessages` hook in its read-only
form (initial fetch + "load older"), the relative-time helper, deterministic avatar
colors, the empty state, and auto-scroll. Replace the lesson page's chat-slot
placeholder with the new component. At the end of Phase 1, signed-in learners see the
F-01-seeded message + peer message in a rendered chat panel, with a "Composer goes here
(Phase 3)" empty area at the bottom.

### Changes Required

#### 1. Expose Supabase env vars to the client bundle

**File**: `astro.config.mjs`

**Intent**: The Realtime WebSocket lives in the browser; we need `SUPABASE_URL` and
`SUPABASE_KEY` (anon) accessible client-side. Both are safe to expose because the anon
key is gated by RLS — the same guarantee the SSR path already relies on.

**Contract**: Change the `env.schema` declarations for `SUPABASE_URL` and `SUPABASE_KEY`
from `context: "server", access: "secret"` to `context: "client", access: "public"`
(both — the anon `SUPABASE_KEY` is safe to expose; that is the standard Supabase pattern).
Keep `optional: true` for the dev-without-supabase case.

Astro 6 has exactly two `context` values: `"server"` and `"client"`. Vars declared with
`context: "client", access: "public"` are accessible from BOTH `astro:env/client` (in
browser/island code) AND `astro:env/server` (in `.astro` frontmatter and the SSR
client). That means the existing `import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server"`
in `src/lib/supabase.ts` continues to work unchanged after this config edit — no SSR
import migration required.

#### 2. Browser-side Supabase client

**File**: `src/lib/supabase-browser.ts` (new)

**Intent**: A singleton-per-island browser client built from `@supabase/ssr`'s
`createBrowserClient` (NOT bare `@supabase/supabase-js`). The `@supabase/ssr` browser
client bridges to the same cookie session as the SSR client at
[src/lib/supabase.ts](src/lib/supabase.ts) — its `.realtime` channel automatically
carries the JWT into the WebSocket handshake, which is what Realtime needs to evaluate
the `to authenticated using (has_course_access(...))` SELECT policy on `messages`.

A bare `@supabase/supabase-js` client built directly in the browser does NOT inherit the
SSR cookie session — the WebSocket would open as anon role and Realtime would deliver
zero events even though REST INSERTs could still succeed (since fetch carries cookies).
This trap is why we use `@supabase/ssr` here despite already having `@supabase/supabase-js`
in deps.

Reads `SUPABASE_URL`/`SUPABASE_KEY` from `astro:env/client`. Returns `null` when env
vars are missing (dev without Supabase configured).

**Contract**: Exports `createClientBrowser(): SupabaseClient | null`. Implementation:
```ts
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/client";

export function createClientBrowser() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: { params: { eventsPerSecond: 10 } }, // reasonable burst guard
  });
}
```

Named `createClientBrowser` (not `createBrowserClient`) to avoid name-collision when
both this module and `@supabase/ssr` are imported in the same file.

#### 3. Message service helpers

**File**: `src/lib/services/messages.ts` (new)

**Intent**: Typed read + write helpers for the chat hook to call. Mirrors the pattern
in `src/lib/services/courses.ts`. Errors logged with a labeled prefix; callers handle
empty/null results.

**Contract**: Exports:
- `listInitialMessages(supabase, lessonId, opts?: { peerLimit?: number }): Promise<LessonChatMessage[]>`
  — Two-query fetch (per plan-review F1; chat UX needs newest peers visible by default,
  not oldest):
    1. SEEDS: select all `is_seeded = true` rows for `lesson_id` ordered by `created_at ASC`
       (typically <10 — no limit).
    2. PEERS: select `is_seeded = false` rows for `lesson_id` ordered by `created_at DESC`
       limited to `peerLimit` (default 50), then reverse client-side to ASC.
  Concatenate `[...seeds, ...peersAsc]` and return. Both queries select
  `*, author:profiles!messages_author_id_fkey(id, display_name)` (prefix-alias is the
  Supabase JS PostgREST embed-with-alias syntax). Returns `[]` on error.
- `listOlderPeers(supabase, lessonId, before: string, opts?: { limit?: number }): Promise<LessonChatMessage[]>`
  — "Load older" pagination. Selects `is_seeded = false AND created_at < before` ordered
  `created_at DESC` limited to `limit` (default 50), reversed to ASC for prepend. Returns
  `[]` on error.
- `insertMessage(supabase, msg: NewMessage): Promise<{ data: LessonChatMessage | null; error: { message: string; code?: string } | null }>`
  — INSERT with `RETURNING *, author:profiles!messages_author_id_fkey(id, display_name)`.
  `author_id` is not in the request; RLS sets it server-side from `auth.uid()`. Returns
  the inserted row with author join.

Note: the `useChatMessages` hook (§7) tracks `hasOlder` based on whether the peer-query
in `listInitialMessages` returned exactly `peerLimit` rows (full page → assume more
exist).

Both helpers type the supabase param as `NonNullable<ReturnType<typeof createBrowserClient>>`
or accept the SSR client (whichever the caller has). Implementation reuses the
`LessonChatMessage` type from `src/types.ts`.

#### 4. Relative-time helper

**File**: `src/lib/relative-time.ts` (new)

**Intent**: Format a Date as "5 min ago" or similar, fall back to absolute time once a
message is older than 24 hours. Pure function — caller passes `now` for testability.

**Contract**: Exports `relativeTime(date: Date | string, now?: Date): string`. Rules:
- `< 60 s` → `"just now"`
- `< 60 min` → `"N min ago"` (e.g. `"5 min ago"`)
- `< 24 h` → `"Nh ago"` (e.g. `"3h ago"`)
- `>= 24 h` → absolute `"HH:MM · DD MMM"` (e.g. `"14:23 · 14 Mar"`)

No external date library — manual Date math is fine for this short list of cases.

#### 5. Deterministic avatar color

**File**: `src/components/chat/avatar-color.ts` (new)

**Intent**: Derive a stable HSL color from a display_name string so the same user gets
the same avatar color across sessions and across rerenders.

**Contract**: Exports `avatarColor(displayName: string | null): string`. Returns
`"hsl(<hue>, 60%, 50%)"` where hue is `0–359` derived from a simple string hash
(`djb2` or similar; ~10 lines). Null/empty → fixed neutral gray
`"hsl(220, 10%, 50%)"`.

#### 6. Message bubble component

**File**: `src/components/chat/MessageBubble.tsx` (new)

**Intent**: Render one message Discord-style. Avatar (32 px circle, first letter,
deterministic color), display name + relative time on one line, body below with
`whitespace-pre-wrap` so user-inserted newlines render.

**Contract**: Props `{ message: LessonChatMessage; isOwn: boolean; now: Date }`. Where:
- `isOwn=true` → outer flex `flex-row-reverse`, bubble `bg-primary/20`
- `isOwn=false` → bubble `bg-card/40`
- Avatar always on the side where `isOwn` is (right for own, left for others)
- Display name: `message.author?.display_name ?? "Learner"`
- Time: `relativeTime(message.created_at, now)` — `now` passed by parent so updates
  on the parent's 60 s interval propagate
- Body: `<p class="whitespace-pre-wrap wrap-break-word">{message.body}</p>` —
  `wrap-break-word` (Tailwind v4 canonical) to keep long URLs/tokens from blowing layout
- `isOwn` is derived by parent: `message.author?.id === userId`

Operator-seeded messages render IDENTICALLY to peer (per PRD FR-006 AC). The seed/peer
distinction is positional only (sorted to top by the query); no badge, no special color.

#### 7. Chat messages hook (read path only)

**File**: `src/components/chat/useChatMessages.ts` (new)

**Intent**: Own all chat state. Phase 1 = initial fetch + pagination. Realtime
subscription (Phase 2) and optimistic post (Phase 3) extend this same hook.

**Contract**: Exports default hook:
```
useChatMessages(opts: { lessonId: string; userId: string | null }):
  {
    messages: LessonChatMessage[];     // sorted: seeds first, then chronological
    isLoading: boolean;                // true during initial fetch
    error: string | null;              // labeled error message if fetch failed
    hasOlder: boolean;                 // true if "load older" should show
    isLoadingOlder: boolean;
    loadOlder: () => Promise<void>;
  }
```

Behavior:
- On mount: build the browser client; if null, set `error = "Chat unavailable"`. Else
  call `listLessonMessages(supabase, lessonId, { limit: 50 })`. Set initial state. Set
  `hasOlder = peerMessages.length === 50` (peer count = total − seed count; seeds
  always come in initial fetch).
- `loadOlder`: take the earliest non-seed `created_at` as cursor, call
  `listLessonMessages(supabase, lessonId, { limit: 50, before: cursor })`. Prepend
  results to the peer section (between seeds and existing peers). Update `hasOlder`.

#### 8. Chat panel React island

**File**: `src/components/chat/ChatPanel.tsx` (new)

**Intent**: Orchestrate the hook, render the message list, auto-scroll, render the
header, the "load older" button when applicable, the empty state when no messages, and
a reserved composer slot for Phase 3.

**Contract**: Props `{ lessonId: string; userId: string | null; userDisplayName: string | null }`.
- Header: `"Live peer chat"` (matches the placeholder S-01 used so the transition is
  invisible)
- Scroll container: `<div ref={scrollRef} class="flex flex-col gap-3 overflow-y-auto h-[60vh] lg:h-[calc(100vh-12rem)]">`
- For each message render `<MessageBubble ... />` keyed by `message.id`
- Auto-scroll: on `messages.length` change, check ref `wasAtBottom` captured BEFORE the
  render (use a layout effect to capture before next paint). If was-at-bottom, scroll
  to bottom. If not, set state to show a `"New ↓"` floating pill bottom-right that
  scrolls into view on click.
- Time refresh: `setInterval(() => setNow(new Date()), 60_000)` cleared on unmount. The
  `now` state is passed to every `MessageBubble`.
- Empty state (`messages.length === 0`): centered `"No messages yet — be the first to post."`
  in `text-muted-foreground`.
- "Load older" button (`hasOlder === true`): at top of scroll container,
  `text-primary text-sm`, calls `loadOlder()`, disabled while `isLoadingOlder`.
- Composer slot: `<div class="border-border mt-3 border-t pt-3" data-composer-slot>Composer lands in Phase 3</div>`
  placeholder.
- Error state: if hook `error !== null`, show inline error message in muted color, no
  message list.
- Loading state: skeleton (3 gray boxes) shown while `isLoading`.

#### 9. Wire into lesson page

**File**: `src/pages/courses/[slug]/lessons/[lessonSlug].astro`

**Intent**: Replace the placeholder `<div>` inside `<aside>` with the new ChatPanel
React island. Pass lessonId + userId + userDisplayName from `Astro.locals.user`.

**Contract**: At lines 64-72 (the inner placeholder div of `<aside>`), replace:
```
<div class="shadow-cosmic-glow ...">
  <h2>Live peer chat</h2>
  <p>Coming in S-02...</p>
</div>
```
with:
```
<ChatPanel
  client:load
  lessonId={lesson.id}
  userId={Astro.locals.user?.id ?? null}
  userDisplayName={Astro.locals.user?.email?.split("@")[0] ?? null}
/>
```
And add `import ChatPanel from "@/components/chat/ChatPanel";` to the frontmatter.

Note: middleware already blocks anon users from reaching this URL, so `userId === null`
should not occur in practice. The hook still handles it (renders auth-required message)
as defense in depth.

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0.
- `npm run build` exits 0.
- `npx astro check` exits 0.

#### Manual Verification

- Signed in, visit a lesson page → chat panel renders header "Live peer chat" + the
  F-01 seed message at top + the F-01 peer message below.
- Seeded and peer messages look IDENTICAL in format (per FR-006 AC).
- Relative time shows "X min ago" or "Xh ago" depending on seed age.
- Empty lesson chat (temporarily delete the two seed rows via Supabase Studio for this
  test, then restore) shows "No messages yet — be the first to post." Restore rows after.
- Refresh page: chat reloads with same content; scroll position lands at bottom.
- "Composer lands in Phase 3" placeholder visible below messages.

**Implementation Note**: After all automated verification passes, pause here for manual
confirmation before proceeding to Phase 2.

---

## Phase 2: Realtime subscription + reconnect handling

### Overview

Hook the existing `useChatMessages` into Supabase Realtime so new INSERTs from any
client arrive live in this panel within 2 seconds. Detect disconnect/reconnect via the
channel system events; on reconnect, refetch the last 50 messages and dedupe-merge with
existing state; surface a "Reconnected — catching up" toast for 3 seconds.

### Changes Required

#### 1. Extend hook with Realtime subscription

**File**: `src/components/chat/useChatMessages.ts`

**Intent**: After the initial fetch completes, subscribe to a per-lesson channel for
INSERT events. Track channel connection state to detect reconnects. Refetch + merge on
reconnect.

**Contract**: Hook signature grows:
```
{ ...previous, isReconnecting: boolean }
```

Implementation:
- After initial fetch resolves: `const channel = supabase.channel(\`lesson-chat-${lessonId}\`)`.
- `.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: \`lesson_id=eq.${lessonId}\` }, payload => addMessage(payload.new))`.
- `addMessage` appends to state, deduped by `id`.
- `.subscribe((status, err) => { ... })` — surface channel state to UI only. Possible
  statuses: `SUBSCRIBED | CHANNEL_ERROR | TIMED_OUT | CLOSED` (per
  `REALTIME_SUBSCRIBE_STATES`). On `CHANNEL_ERROR` log `err` for debugging.
- **Reconnect detection uses socket-level events**, not channel-status transitions —
  the auto-rejoin status-callback re-fire is documented as flaky (supabase-js#1473,
  Discussion #19263). Reliable trigger:
  ```ts
  supabase.realtime.onOpen(() => {
    // fires on every WebSocket open, including after auto-reconnect
    refetchAndMerge();
  });
  supabase.realtime.onClose(() => { setIsReconnecting(true); });
  supabase.realtime.onError((e) => { console.error("[realtime] socket error:", e); });
  ```
  `refetchAndMerge` calls `listInitialMessages` again, dedupe-merges by id with existing
  state, clears `isReconnecting`. Skip the first `onOpen` (initial connection — already
  handled by initial fetch); use a ref boolean to gate.
- Cleanup: `supabase.removeChannel(channel)` AND `supabase.realtime.off('open' | 'close' | 'error', handler)` on hook unmount.

#### 2. Reconnect toast in ChatPanel

**File**: `src/components/chat/ChatPanel.tsx`

**Intent**: When the hook reports `isReconnecting`, show a brief toast.

**Contract**: When `isReconnecting === true`, render a fixed-positioned (within panel)
toast pill at top: `"Reconnected — catching up"`, `bg-card border-border` styling. Auto
clears when `isReconnecting` flips to false. Implementation: simple conditional render
inside the panel, no portal.

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0.
- `npm run build` exits 0.
- `npx astro check` exits 0.

#### Manual Verification

- Open the same lesson page in two browser windows (or two browsers, both signed in —
  can be same account).
- In a third tool (Supabase Studio SQL editor or another signed-in browser), INSERT a
  new message with `lesson_id` matching the React Architecture lesson, `is_seeded=false`,
  `author_id` of the seed-peer user. Run within 5 s.
- Within 2 s, message appears in both open windows without page reload.
- In Window A: DevTools → Network → set throttling to Offline. Wait 30 s. Meanwhile in
  Window B (or via SQL editor), insert another message.
- Re-enable network in Window A.
- Within ~5 s of network restore: "Reconnected — catching up" toast appears briefly in
  Window A, and the message inserted during offline shows up.

**Implementation Note**: Pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Composer + optimistic post + error UX

### Overview

Build the textarea composer (auto-grow, Enter to send, Shift+Enter for newline, char
counter at 3000+). Wire submission to optimistic local insert with `tempId`, then fire
the real INSERT. Handle the dedup against the Realtime echo of our own post. On failure,
mark the bubble with `"Failed · Retry · Discard"` inline.

### Changes Required

#### 1. Composer component

**File**: `src/components/chat/Composer.tsx` (new)

**Intent**: Self-contained controlled component. Owns local textarea state. Calls
`onSubmit(body)` when user presses Enter (without Shift) or clicks the send button.

**Contract**: Props `{ onSubmit: (body: string) => void; disabled?: boolean }`.
- Textarea: `placeholder="Ask a question or share a tip..."`, `bg-card/40 border-border`,
  rounded.
- Auto-grow: on input, measure scrollHeight and apply as `rows` (clamped 1–6). Beyond
  6 lines, the textarea scrolls internally.
- Keydown handler: if `e.key === 'Enter' && !e.shiftKey && !disabled`, `preventDefault`,
  call `onSubmit(body.trim())` if body.trim() is non-empty, clear body.
- Char counter: only visible when `body.length >= 3000`. Shows `"<N> / 4000"` in
  `text-muted-foreground text-xs`.
- Send button: `<Send>` icon from lucide-react, disabled when
  `body.trim() === "" || disabled || body.length > 4000`. Click invokes `onSubmit`.
- `disabled` prop blocks submission and dims the textarea (used when user not signed
  in or when env not configured).

#### 2. Extend hook with optimistic post

**File**: `src/components/chat/useChatMessages.ts`

**Intent**: Add `postMessage`, `retryMessage`, `discardMessage`. Track pending bubbles.
Handle dedup of own messages echoed via the Realtime subscription.

**Contract**: Hook signature grows:
```
{
  ...previous,
  postMessage: (body: string) => Promise<void>;
  retryMessage: (tempId: string) => Promise<void>;
  discardMessage: (tempId: string) => void;
}
```

Implementation:
- `postMessage(body)`:
  1. Build `pendingMessage: LessonChatMessage & { tempId: string; status: 'sending' | 'failed' }`
     with `id = tempId`, `author = { id: userId, display_name: userDisplayName }`,
     `created_at = new Date().toISOString()`, `is_seeded = false`, `status = 'sending'`.
  2. Append to state at the bottom of the peer section.
  3. Call `insertMessage(supabase, { lesson_id, body })`.
  4. On success: the response contains the real row. Replace the pending bubble (by
     `tempId` match) with the real row. Schedule a 10 s safety timeout to ensure the
     pending bubble is replaced even if the Realtime echo doesn't arrive.
  5. On error: update pending bubble's `status = 'failed'`. Keep in state.

- `retryMessage(tempId)`: find the failed pending bubble, set status back to `'sending'`,
  re-fire `insertMessage` with the same body. Same success/failure handling.

- `discardMessage(tempId)`: remove the pending bubble from state.

- Realtime INSERT handler: when an INSERT event arrives, check if there's a pending
  bubble matching `(author_id === userId, body === payload.new.body, |Δ created_at| < 5 s)`.
  If yes: replace pending with the real row. If no: append normally.

#### 3. Render failed state in MessageBubble

**File**: `src/components/chat/MessageBubble.tsx`

**Intent**: When a message has `status === 'failed'`, show error styling + retry/discard
controls.

**Contract**: Extend props to optionally accept `status?: 'sending' | 'failed'` and
`onRetry?: () => void; onDiscard?: () => void`.
- `status === 'sending'`: bubble opacity slightly reduced (0.7), no error UI.
- `status === 'failed'`: bubble has `border border-destructive/40`, body `text-muted-foreground`,
  below body show `"Failed to send · [Retry] [Discard]"` with two clickable spans wired
  to handlers.

#### 4. Wire Composer + handlers in ChatPanel

**File**: `src/components/chat/ChatPanel.tsx`

**Intent**: Replace the "Composer lands in Phase 3" placeholder with the real
`<Composer onSubmit={postMessage} disabled={userId === null} />`. Pass
`onRetry`/`onDiscard` to each `MessageBubble` (closed over the message's tempId where
applicable).

**Contract**: At the placeholder location, render the Composer. For each message in
the list with `status === 'failed'`, build retry/discard closures and pass to bubble.

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0.
- `npm run build` exits 0.
- `npx astro check` exits 0.

#### Manual Verification

- Signed in: type a message, press Enter → bubble appears instantly in own viewer with
  own styling (`bg-primary/20` on the right). Within 2 s, appears in second open window.
- Multi-line: Shift+Enter inserts newline, body preserves with `whitespace-pre-wrap`.
- Type 3000+ characters: char counter appears at bottom of composer.
- Disable network in DevTools: press Enter → bubble appears with `sending` opacity. After
  the request timeout (~5 s), bubble flips to `failed` with "Retry · Discard" inline.
- Re-enable network, click Retry → bubble flips back to `sending`, then to confirmed
  (own message renders normally).
- Type a message and click Discard before sending? — Discard only shows on failed; can't
  test pre-send. But: click Discard on a failed bubble → bubble removed from view.

**Implementation Note**: This phase closes US-01. Pause for manual confirmation before
Phase 4.

---

## Phase 4: Minimal mobile bottom-drawer

### Overview

Below the `lg` breakpoint (1024 px), render the chat as a fixed bottom bar instead of
in the desktop `<aside>` slot. Tap the bar to expand into a 70 vh overlay with body
scroll locked; tap close (X) to collapse. Pulse the bar subtly when new messages arrive
while collapsed.

### Changes Required

#### 1. Responsive shell in ChatPanel

**File**: `src/components/chat/ChatPanel.tsx`

**Intent**: One component, two layouts via Tailwind responsive utilities. Add an
`isExpanded` state (default `false`) and a pulse indicator.

**Contract**:

Layout:
- Desktop (`lg:`): existing inline rendering inside `<aside>` (no change to desktop).
- Mobile (default): outer wrapper becomes `fixed bottom-0 left-0 right-0 z-40 lg:static lg:z-auto`.
  - Collapsed (`!isExpanded` on mobile): just a bar with header
    `"Live peer chat · N messages"`, `bg-card/95 border-t border-border backdrop-blur-xl`,
    height auto, tappable.
  - Expanded (`isExpanded` on mobile): expand to `fixed inset-x-0 top-16 bottom-0 z-50`
    (top-16 keeps the topbar visible). Add close button (X icon) top-right of the
    expanded panel.
  - Desktop `lg:`: rules override mobile (`lg:relative lg:inset-auto lg:z-auto`), so
    the same component just renders inline.

State:
- `isExpanded` (boolean, default false).
- `hasNewMessageSinceCollapse` (boolean, set true on each new message arrival if
  `!isExpanded && isMobile`, set false when expanded).

JS behavior (only meaningful on mobile):
- On tap of bar: set `isExpanded = true`, body scroll-lock
  (`document.body.style.overflow = 'hidden'`).
- On tap close: set `isExpanded = false`, restore body scroll
  (`document.body.style.overflow = ''`).
- Cleanup: on unmount, ensure body scroll is restored.
- Detect mobile for body-scroll-lock side effects via
  `window.matchMedia('(max-width: 1023px)').matches`.

Pulse: when `hasNewMessageSinceCollapse`, render a small `bg-accent` dot inside the bar
header with `animate-pulse`.

Desktop is unaffected — `lg:` rules win.

#### 2. Lesson page slot accommodation

**File**: `src/pages/courses/[slug]/lessons/[lessonSlug].astro`

**Intent**: On narrow viewports the chat is fixed (not in the grid). The `<aside>` still
exists in the DOM but should not reserve space below `lg:`. Confirm grid collapses to a
single column below lg (it already does per the existing `grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]`).
Add bottom padding to the lesson body to make room for the collapsed bar so the user
can scroll all of it without the bar overlapping content.

**Contract**: Add `pb-24 lg:pb-0` (or similar) to the outer lesson container so the
fixed-bottom bar on mobile doesn't cover the last paragraph of the markdown.

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0.
- `npm run build` exits 0.
- `npx astro check` exits 0.

#### Manual Verification

- Resize browser to < 1024 px: chat collapses to a fixed bottom bar showing
  `"Live peer chat · N messages"`.
- Tap the bar: chat expands to ~70 vh overlay with messages + composer; body scroll is
  locked.
- Tap close (X): collapses back to bar.
- While collapsed, insert a message in another window: small pulse dot appears in the
  bar; clears on expand.
- Markdown body has bottom padding so the last paragraph is fully visible above the
  collapsed bar.
- Resize back to ≥ 1024 px: chat returns to the desktop aside layout, no fixed
  positioning.

**Implementation Note**: Pause for manual confirmation before Phase 5.

---

## Phase 5: Operator seeding docs + final verification + close-out

### Overview

Write the operator-facing guide for inserting seed messages in production. Append 3–5
example seed messages to `supabase/seed.sql` so local-dev demos a richer chat. Run final
verification across the whole slice. Close out S-02.

### Changes Required

#### 1. Operator seeding guide

**File**: `docs/operator/seeding.md` (new)

**Intent**: Markdown guide the operator (the platform owner) reads once before launch.
Covers locating the relevant lesson, finding the operator's `author_id`, the exact
INSERT statement, and FAQ for update/delete.

**Contract**: Sections (in order):

1. **Prerequisites** — Access to the production Supabase project's SQL editor (Studio
   uses the service_role by default in the SQL editor, which bypasses RLS — this is the
   intended hook for operator seeding).
2. **Find your operator `author_id`** — single SQL:
   `SELECT id FROM auth.users WHERE email = '<your-email>';`. Store the UUID.
3. **Find the lesson `lesson_id`** — single SQL:
   `SELECT l.id, l.title FROM public.lessons l JOIN public.courses c ON c.id = l.course_id WHERE c.slug = '<course-slug>' AND l.slug = '<lesson-slug>';`.
4. **Insert a seed message** — example:
   ```sql
   INSERT INTO public.messages (lesson_id, author_id, body, is_seeded)
   VALUES ('<lesson-uuid>', '<operator-uuid>', 'If your Suspense fallback flashes...', true);
   ```
5. **Update / Delete** — UPDATE/DELETE work in Studio SQL editor because service_role
   bypasses RLS. The application's authenticated session cannot perform either operation
   per RLS policy. Examples included.
6. **Pre-launch checklist** — For each lesson on launch day, insert 5–10 seed messages
   covering common blockers + step-back tips.

#### 2. Expand local seed fixture

**File**: `supabase/seed.sql`

**Intent**: After the existing seed insertions, append 3 more seeded messages for the
React Architecture lesson so a local `db reset` shows a fuller chat panel (the existing
single seed message is enough to verify rendering, but a fuller panel is a better demo
of "operator-seeded threads pinned on top, peer messages chronological below").

**Contract**: After the existing INSERT block (lines ~92-107), add 3 more INSERTs with
`is_seeded=true`, `author_id = c0000000-0000-0000-0000-000000000001` (seed-operator),
varied bodies covering common React Server Components blockers (e.g. "If your fallback
flashes...", "When in doubt about Suspense...", "Streaming and parallel data fetching..."). 
Use `on conflict (id) do nothing` for idempotency with new fixed UUIDs.

#### 3. Document client env exposure

**File**: `AGENTS.md`

**Intent**: The Phase 1 change to `astro.config.mjs` (`SUPABASE_URL`/`SUPABASE_KEY` →
`context: "server-and-client"`) is a real boundary shift. Document it so future
maintainers know the anon key is intentionally in the client bundle.

**Contract**: Add a one-paragraph note under the existing auth-flow section in AGENTS.md:
`SUPABASE_URL` and `SUPABASE_KEY` (anon) are exposed to the client bundle via
`astro:env/client` so the browser Supabase client (for Realtime subscriptions) can be
built. The anon key is gated by RLS — exposing it client-side is the standard Supabase
pattern; only the service_role key would be sensitive and that is never in app env.

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0.
- `npm run build` exits 0.
- `npx astro check` exits 0.
- `npx supabase db reset` applies cleanly with the expanded seed fixture.

#### Manual Verification

- `docs/operator/seeding.md` renders cleanly (preview in IDE or GitHub).
- After `db reset`, the React Architecture lesson chat shows ~4 seeded messages pinned
  at top + 1 peer message below.
- Full end-to-end demo: anon → `/courses` → click → `/courses/[slug]` → "Sign in to view
  lessons" → login → lesson page → seeded chat visible → post a message → see appear
  live → narrow viewport → drawer works → close → desktop layout intact.
- `AGENTS.md` carries the one-paragraph note on client-env exposure (SUPABASE_URL +
  SUPABASE_KEY available in client bundle, anon key safe by RLS).
- `change.md.status` flips to `implemented` after epilogue commit.

**Implementation Note**: This is the slice's exit gate. After manual verify + epilogue
commit, the change is ready for `/10x-archive` after S-03 ships.

---

## Testing Strategy

Same as F-01 and S-01: no test framework configured. Verification is:

- **Static** — `npm run lint`, `npm run build`, `npx astro check` per phase.
- **Manual** — browser walk-throughs per phase's Manual Verification list against
  `npm run dev` + local Supabase stack (`.dev.vars` points to `127.0.0.1:54321`).
- **Realtime / NFR** — open two browser windows, post in one, verify visibility in the
  other within 2 s (FR-006 NFR).
- **Schema/RLS** — already proven by F-01; S-02 introduces no schema or RLS change.

Introducing a test framework (Vitest for hooks/services, Playwright for e2e) is captured
as out-of-scope; would be a separate change.

## Performance Considerations

- **Initial paint**: Chat panel hydrates after first paint; lesson video + markdown
  appear immediately, chat shows a brief skeleton until the fetch resolves (~50-150 ms
  to Supabase in EU). User perceives lesson is "live" instantly.
- **Realtime cost**: One WebSocket per open lesson tab. Supabase Realtime free tier
  covers ~200 concurrent connections per project — at MVP scale (dozens to ~100 users,
  not all on chat simultaneously) we're nowhere near the ceiling.
- **Time refresh interval**: 60 s tick triggers re-render of message list (~5 ms for
  50 messages). Negligible.
- **Auto-scroll detection**: O(1) check per message arrival.
- **Workers CPU**: SSR of lesson page stays as-is (markdown only). Chat does NOT add to
  SSR cost — entirely client-mounted.
- **Browser bundle delta**: `@supabase/supabase-js` (already in `package.json` for
  the SSR client) ships its Realtime module. The browser bundle gains the React island
  (~3–5 KB minified) + the chat components (~3–4 KB). Total impact: ~6–9 KB additional
  client JS on lesson pages.

## Migration Notes

- No production schema migrations. F-01 covered everything.
- `supabase/seed.sql` is local-dev only; the Phase 5 expansion affects only
  `npx supabase db reset` outputs.
- `astro.config.mjs` env schema change is a build-config update, not a runtime
  migration. After the change, both `npm run dev` and the deployed Worker need a rebuild
  to pick up the new client-side env. (Cloudflare automatic build does this on push.)
- No environment variable VALUE changes; only their exposure scope (server → server+client).

## References

- F-01 plan: [context/changes/lesson-chat-data-model/plan.md](context/changes/lesson-chat-data-model/plan.md)
- F-01 brief: [context/changes/lesson-chat-data-model/plan-brief.md](context/changes/lesson-chat-data-model/plan-brief.md)
- S-01 plan: [context/changes/lesson-workspace-shell/plan.md](context/changes/lesson-workspace-shell/plan.md)
- S-01 brief: [context/changes/lesson-workspace-shell/plan-brief.md](context/changes/lesson-workspace-shell/plan-brief.md)
- Roadmap S-02: [context/foundation/roadmap.md#L76-L88](context/foundation/roadmap.md#L76-L88)
- PRD US-01, FR-004 through FR-006, NFR: [context/foundation/prd.md](context/foundation/prd.md)
- Infrastructure (Supabase Realtime commit + Workers CPU ceiling): [context/foundation/infrastructure.md](context/foundation/infrastructure.md)
- F-01 RLS migration (trust boundary cross-link from S-01 impl-review F4): [supabase/migrations/20260528140054_lesson_chat_rls.sql](supabase/migrations/20260528140054_lesson_chat_rls.sql)
- S-01 lesson page (chat-slot host): [src/pages/courses/[slug]/lessons/[lessonSlug].astro](src/pages/courses/[slug]/lessons/[lessonSlug].astro)
- Existing services pattern: [src/lib/services/courses.ts](src/lib/services/courses.ts)
- Existing types: [src/types.ts](src/types.ts)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Chat panel scaffold + read path

#### Automated

- [x] 1.1 `npm run lint` exits 0 — f0baa1d
- [x] 1.2 `npm run build` exits 0 — f0baa1d
- [x] 1.3 `npx astro check` exits 0 — f0baa1d

#### Manual

- [x] 1.4 Lesson chat renders seeded message at top + peer message below (from F-01 seed) — f0baa1d
- [x] 1.5 Seeded and peer messages format identically (per FR-006 AC) — f0baa1d
- [x] 1.6 Relative time shows "X min ago" or "Xh ago" — f0baa1d
- [x] 1.7 Empty chat shows "No messages yet — be the first to post" — f0baa1d
- [x] 1.8 Refresh page: chat reloads, scroll lands at bottom — f0baa1d
- [x] 1.9 Composer placeholder visible below messages — f0baa1d

### Phase 2: Realtime subscription + reconnect handling

#### Automated

- [x] 2.1 `npm run lint` exits 0
- [x] 2.2 `npm run build` exits 0
- [x] 2.3 `npx astro check` exits 0

#### Manual

- [x] 2.4 INSERT via Studio appears in both open lesson windows within 2 s
- [x] 2.5 Offline 30 s + insert in other window + restore network → "Reconnected — catching up" toast briefly + missed message present

### Phase 3: Composer + optimistic post + error UX

#### Automated

- [ ] 3.1 `npm run lint` exits 0
- [ ] 3.2 `npm run build` exits 0
- [ ] 3.3 `npx astro check` exits 0

#### Manual

- [ ] 3.4 Post message: bubble appears instantly with own styling (bg-primary/20 right)
- [ ] 3.5 Posted message appears in second window within 2 s
- [ ] 3.6 Shift+Enter inserts newline; body preserves linebreaks (whitespace-pre-wrap)
- [ ] 3.7 Char counter appears at 3000+ chars
- [ ] 3.8 Offline → post → bubble shows "Failed · Retry · Discard"; Retry → succeeds; Discard → bubble removed

### Phase 4: Minimal mobile bottom-drawer

#### Automated

- [ ] 4.1 `npm run lint` exits 0
- [ ] 4.2 `npm run build` exits 0
- [ ] 4.3 `npx astro check` exits 0

#### Manual

- [ ] 4.4 Narrow viewport (< 1024 px): chat collapses to fixed bottom bar
- [ ] 4.5 Tap bar → expands to 70 vh overlay with body scroll locked
- [ ] 4.6 Tap close (X) → collapses back to bar
- [ ] 4.7 New message while collapsed → pulse dot on bar; clears on expand
- [ ] 4.8 Lesson body has bottom padding; last paragraph visible above collapsed bar
- [ ] 4.9 Resize ≥ 1024 px: chat returns to desktop aside layout

### Phase 5: Operator seeding docs + final verification + close-out

#### Automated

- [ ] 5.1 `npm run lint` exits 0
- [ ] 5.2 `npm run build` exits 0
- [ ] 5.3 `npx astro check` exits 0
- [ ] 5.4 `npx supabase db reset` applies cleanly with expanded seed

#### Manual

- [ ] 5.5 `docs/operator/seeding.md` renders cleanly
- [ ] 5.6 After db reset, lesson chat shows ~4 seeded + 1 peer message
- [ ] 5.7 Full end-to-end demo: anon → catalog → course → sign-in → lesson → chat populated → post → live → narrow viewport drawer works
- [ ] 5.8 AGENTS.md has the client-env exposure paragraph
- [ ] 5.9 `change.md.status: implemented` after epilogue commit
