# Lesson-scoped Chat (S-02) — Plan Brief

> Full plan: `context/changes/lesson-scoped-chat/plan.md`

## What & Why

S-02 is Unstuck's validation milestone — the slice that exercises the riskiest product
hypothesis (lesson-scoped peer chat unblocks learners) AND the riskiest technical NFR
(cross-viewer message visibility under 2 seconds without degrading the lesson flow). It
wraps the chat-slot placeholder S-01 left in the lesson page with a real React island:
initial fetch of the last 50 messages, Supabase Realtime subscription for live new posts,
optimistic UI for the user's own posts, polling-refetch + toast on reconnect, minimal
mobile bottom-drawer, and an operator-seeding guide for pre-launch content. When this
slice lands, US-01 closes end-to-end.

## Starting Point

F-01 ships the data layer: `messages` table with `is_seeded` partition, the
`(lesson_id, is_seeded, created_at)` hot-read index, RLS gating (anon nothing;
authenticated SELECT by `has_course_access`, INSERT own non-seed only, no UPDATE/DELETE),
and the table already joined to `supabase_realtime` publication. `LessonChatMessage` /
`NewMessage` types exist in `src/types.ts`. S-01 ships the host: a lesson page at
`/courses/[slug]/lessons/[lessonSlug]` with a `<aside>` chat-slot placeholder ready to be
replaced. AppLayout activates cosmic tokens, middleware gates anon. Zero realtime client
code exists today; this slice introduces it.

## Desired End State

A signed-in learner on a lesson page sees seeded operator threads pinned on top and peer
messages chronological below. Posting works optimistically (own bubble shows
instantly; appears in other open browsers within 2 s). New peer posts appear live. The
chat doesn't pause the video. On narrow viewports the chat is a fixed bottom bar that
expands on tap. Reconnects auto-refetch missed messages with a toast. Failed posts get
inline "Failed · Retry · Discard". The operator has a markdown guide for pre-launch
seeding via Supabase Studio.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Posting UX | Optimistic UI with reconciliation against Realtime echo | Guarantees < 200 ms perceived ack regardless of network; matches Slack/Discord baseline; reconciliation by `(author_id, body, ±5 s)` plus 10 s fallback timeout. | Plan |
| Initial load | Last 50 + "Load older" cursor pagination | Bounded payload (~30 KB max); seeds always come in initial fetch; matches F-01 index hot read pattern. | Plan |
| Reconnect strategy | Channel SYSTEM events + refetch last 50 + "Reconnected — catching up" toast | Guarantees no missed messages without new endpoints; toast = transparency. | Plan |
| CPU budget on Workers Free 10 ms | SSR markdown only; defer chat fetch to client mount | Keeps SSR safely under 10 ms; chat hydration is async anyway; SEO unaffected. | Plan |
| Message rendering | Discord-style: avatar (deterministic color from name) + name + relative time + body; own messages `bg-primary/20` right-aligned; seeds rendered identically to peer | Standard chat UX; relative time gives "live feel"; FR-006 AC mandates seeds visually indistinguishable from peer. | Plan |
| Composer | Textarea auto-grow 1-6 lines, Enter = send, Shift+Enter = newline, char counter at 3000+, send button | Modern chat baseline; multi-line for technical questions; counter quiet until needed. | Plan |
| Error UX | Inline "Failed · Retry · Discard" on failed bubble; bubble stays | Persistent context; user-controlled recovery; matches Slack/Discord failure pattern. | Plan |
| Mobile drawer | Build minimal in S-02 — collapsed by default <1024 px, tap to expand 70 vh, body scroll-lock, no focus-mgmt polish yet | Honors FR-004 mobile commit (otherwise demo on phone is broken); OQ 2 (cross-device floor) still unresolved so a11y polish deferred. | Plan |
| Operator seed workflow | `docs/operator/seeding.md` + example SQL via Studio | PRD US-01 requires "demonstrable from launch day"; matches "no admin UI" non-goal; out-of-band by design. | Plan |

## Scope

**In scope**:
- `src/components/chat/{ChatPanel, MessageBubble, Composer, useChatMessages, avatar-color}.tsx`/`.ts`.
- `src/lib/services/messages.ts` (read + write helpers).
- `src/lib/relative-time.ts` (helper).
- `src/lib/supabase-browser.ts` (new — browser-side Realtime-capable client).
- `astro.config.mjs` — expose `SUPABASE_URL` / `SUPABASE_KEY` to client bundle.
- `src/pages/courses/[slug]/lessons/[lessonSlug].astro` — swap placeholder for ChatPanel.
- `docs/operator/seeding.md` (new — operator-facing guide).
- `supabase/seed.sql` — append 3 more seeded messages to React Architecture lesson.
- `AGENTS.md` — one-paragraph note on client env exposure.

**Out of scope**:
- Edit / delete / reactions / threading / search / pinning / typing indicators / presence
  / read receipts / attachments — all PRD Non-Goals.
- Moderator UI (S-03 will be smallest possible operator-delete slice).
- Schema or RLS changes — F-01 shipped everything we need.
- Test framework introduction.
- Durable Objects / custom WebSocket server (infrastructure.md committed to Realtime).
- Focus-mgmt / a11y polish on mobile drawer (OQ 2 still unresolved).
- TanStack Query / SWR / virtual scroll — premature at v1 scale.
- Profile-edit UI (`Astro.locals.user.email.split('@')[0]` is sufficient for own
  display name).

## Architecture / Approach

`ChatPanel` is a single React island (`client:load`) mounted in the lesson page's
`<aside>` slot. State management is a custom hook `useChatMessages` — no Redux, no
context, no fetch library. The hook owns: message list, loading/error state, pending
optimistic messages, the Realtime channel subscription, reconnect detection, and the
post/retry/discard actions. `MessageBubble` and `Composer` are pure presentational.
The browser Supabase client (`src/lib/supabase-browser.ts`, new) is built once per
mount from `@supabase/supabase-js` (not `@supabase/ssr`) so it can establish the
Realtime WebSocket. The mobile drawer is CSS-driven via Tailwind responsive utilities
(`lg:` for desktop); `isExpanded` + body scroll-lock are the only JS additions for
narrow viewports.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Chat panel scaffold + read path | ChatPanel island visible on lesson page; seed + peer message render Discord-style; "load older" button; empty state; auto-scroll; relative time | Client env exposure misconfigured (anon key not reaching browser) — chat appears stuck loading |
| 2. Realtime subscription + reconnect | Live new INSERTs appear within 2 s; reconnect after offline gap refetches + toast | Channel filter syntax wrong → either every-lesson noise OR zero events; reconnect false-positive (SUBSCRIBED → SUBSCRIBED transitions) triggering spurious toasts |
| 3. Composer + optimistic post + error UX | Full US-01 loop closes — post, see instantly, others see < 2 s; failed bubbles retryable | Realtime echo dedup miss → duplicate bubble appears in own viewer; pending bubbles leak if dedup match key drift |
| 4. Minimal mobile bottom-drawer | Chat works on narrow viewports without devastating UX; body scroll-lock + collapse/expand | Body scroll-lock not restored on unmount → page becomes unscrollable after lesson navigation |
| 5. Operator seeding docs + final verification + close-out | Operator has a guide for pre-launch seeding; local demo fuller (4 seeds + 1 peer); slice closes | None — close-out phase |

**Prerequisites**: F-01 schema deployed (done — local + prod); S-01 lesson page exists
(done — chat-slot placeholder waiting); local Supabase stack running with seed; signed-in
test account (sign up via `/auth/signup`, confirm via Mailpit at `localhost:54324`).

**Estimated effort**: ~3-4 sessions across 5 phases. Phase 3 is the heaviest
(optimistic + dedup); Phase 4 is medium (drawer state + body scroll-lock); others are
straightforward. This is genuinely the longest slice of the MVP — it's also where the
product value lives.

## Open Risks & Assumptions

- Realtime echo dedup match key (`author_id` + `body` + ±5 s `created_at`) is sufficient
  for v1. Edge case: user posts the same body twice within 5 s — both pendings get
  matched to the same echo. Mitigation: each pending also carries a `tempId`; dedup
  walks pending list in submission order so first-pending-first-match. Real users
  posting identical content within 5 s is extremely rare; acceptable risk.
- Supabase Realtime free tier (~200 concurrent connections per project) is enough for
  MVP scale. At ~100 users with 1-2 lesson tabs each, peak is 100-200 connections —
  margin is thin but adequate. If we hit the ceiling, the upgrade path is Supabase Pro
  ($25/mo) — not a code change.
- Cloudflare Workers 10 ms CPU ceiling on lesson page SSR — we don't add to SSR cost in
  this slice (chat is client-mounted). If a future slice changes that, this assumption
  needs re-validation.
- `Astro.locals.user.email.split('@')[0]` is "close enough" for own display name. Users
  who later customize `display_name` via a profile-edit UI (post-MVP) will see slight
  discrepancy until their own messages re-fetch with the proper join.
- Mobile drawer ships without focus management or screen-reader polish. OQ 2
  (cross-device support floor) is the gate before we revisit; until then, the drawer is
  "functional, not accessible."

## Success Criteria (Summary)

- A signed-in learner posts a message in the chat panel scoped to the lesson, sees it
  appear instantly, and sees it appear in any other browser on the same lesson within
  2 s.
- Operator-seeded threads are visually identical to peer messages but pinned at the top
  of the panel by sort order.
- Chat does not pause the video or steal focus from the lesson body.
- Narrow viewport: chat is a collapsed bottom bar that expands on tap.
- Offline gap → reconnect: missed messages catch up automatically with a toast.
- `npm run lint`, `npm run build`, `npx astro check`, `npx supabase db reset` all exit 0.
