---
project: "Unstuck"
version: 1
status: draft
created: 2026-05-27
updated: 2026-06-03
prd_version: 1
main_goal: market-feedback
top_blocker: time
---

# Roadmap: Unstuck

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Unstuck unifies a video lesson and the conversation about that lesson on one surface, so a self-taught learner who hits a blocker mid-lesson can get unblocked by a contemporary peer without abandoning the page. The product bet is that **lesson-scoped** community (peer help attached to the exact lesson, available at the moment of friction) beats course-scoped forums and decoupled community platforms, where help arrives slowly or the context is buried.

## North star

**S-02: Learner gets unblocked in lesson-scoped chat** — the smallest end-to-end slice whose successful delivery would prove the core product hypothesis; everything else only matters if this works, so it is placed as early as its prerequisites allow. It is the validation milestone for `main_goal: market-feedback`: it exercises the riskiest assumption (that learners will actually use lesson-scoped chat to unblock) and the riskiest technical requirement (realtime message visibility < 2s) in one shippable capability.

## At a glance

| ID   | Change ID                    | Outcome (user can …)                                                          | Prerequisites | PRD refs              | Status   |
| ---- | ---------------------------- | ----------------------------------------------------------------------------- | ------------- | --------------------- | -------- |
| F-01 | `lesson-chat-data-model`     | (foundation) lesson/course/message schema with lesson-scoping, operator-seed flag, and RLS | —             | NFR (privacy), FR-006 | done |
| S-01 | `lesson-workspace-shell`     | browse the single-course catalog and open a lesson to watch video + read markdown | F-01          | FR-003, FR-004        | done |
| S-02 | `lesson-scoped-chat`         | post in a lesson's chat and read prior messages (operator seeds pinned on top, peer messages chronological below), live | S-01, F-01    | FR-004, FR-005, FR-006, US-01 | done |
| S-03 | `operator-message-moderation`| (operator) delete any message in any lesson chat                              | F-01, S-02    | FR-007                | done |

> **MVP complete (2026-05-30)** — all four planned slices (F-01 + S-01 + S-02 + S-03) shipped. North star (S-02) validated end-to-end via local stack. Deferred features captured under `## Parked`; revisit post-first-look per the `ship-over-polish` operating preference.

## Baseline

What's already in place in the codebase as of 2026-05-27 (auto-researched + user-confirmed). Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19; `src/components/{auth,ui}`, `src/layouts/Layout.astro`, `src/pages/`.
- **Backend / API:** present — `src/pages/api/auth/{signin,signup,signout}.ts` + `src/middleware.ts` (route gating).
- **Data:** partial — Supabase configured (`supabase/config.toml`); only the built-in `auth.users` table is in use. No `supabase/migrations/`, no `src/types.ts`. The lesson/course/message schema for the chat slices does not exist yet — this is the gap F-01 fills.
- **Auth:** present — `src/lib/supabase.ts` (SSR client), `src/pages/auth/{signin,signup,confirm-email}.astro`, middleware gating. Verified end-to-end in production (signup → sign-in → gated `/dashboard`) on 2026-05-27. **Satisfies FR-001 (create account, must-have) and FR-002 (sign in, nice-to-have)** — these are delivered by the present baseline, not by a slice below.
- **Deploy / infra:** present — `wrangler.jsonc`, `.github/workflows/ci.yml` (lint + build), live at `https://unstuck.lukasz-rdzanek.workers.dev`.
- **Observability:** partial — `wrangler.jsonc` enables Cloudflare observability; no app-level error tracking or structured logging. Not promoted to a Foundation: `main_goal: market-feedback` does not gate launch on observability, and no PRD NFR forces app-level instrumentation for the MVP.

## Foundations

### F-01: Lesson & chat data model

- **Outcome:** (foundation) a persistent schema exists for courses, lessons, and lesson-scoped messages, with an operator-seed flag distinguishing curated threads from peer posts, and row-level security enforcing that chat content is reachable only by signed-in, enrolled/free-tier learners.
- **Change ID:** `lesson-chat-data-model`
- **PRD refs:** NFR (privacy: "lesson-chat content is not accessible to unauthenticated visitors, nor to non-enrolled learners"), FR-006 (operator-seeded vs peer partition), Business Logic (operator-seeded pinned on top), Access Control (RLS per project convention).
- **Unlocks:** S-01 (lesson/course read paths), S-02 (message read + write), S-03 (message delete). Also reduces the blocking unknown "what is the message partition / seeding shape" before any chat UI is planned.
- **Prerequisites:** — (auth + Supabase already present per Baseline).
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced first because every user-facing chat slice consumes this schema; getting the lesson-scoping + operator-seed-flag + RLS shape right once avoids reworking three slices. The realtime transport itself (Supabase Realtime per `infrastructure.md`) is intentionally NOT part of this foundation — it is implementation detail of S-02, planned there.
- **Status:** done (2026-05-28) — Phase 1 (schema + deny-all) at `ad8301d`; Phase 2 (RLS policies + `rls_matrix.sql`) at `c9e25df`; Phase 3 (seed + Database types + typed SSR client + lint ignore) at `9b4960e`; Phase 4 (prod deploy via `supabase db push`) verified by 4 SQL probes against `rhcioqeawpbuylbmkxnr` — 5 tables with RLS enabled+forced, 7 policies matching Phase 2 set, `has_course_access` + `handle_new_user` present, `profiles` backfilled for 2 existing test users, deployed Worker `/auth/signup` still returns 200.

## Slices

### S-01: Lesson workspace shell

- **Outcome:** A learner can browse the single-course catalog, open a lesson, and watch its embedded video alongside its markdown content. On desktop the lesson body and a (still-empty in this slice) chat region sit side by side; on narrow screens the layout reflows.
- **Change ID:** `lesson-workspace-shell`
- **PRD refs:** FR-003 (course catalog, single course), FR-004 (lesson page: embedded video + markdown content + responsive layout — the chat panel itself is completed in S-02).
- **Prerequisites:** F-01 (lesson/course data to render).
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Cross-device support floor (which mobile OS / browser versions the responsive bottom-drawer must support) — Owner: user. Block: no (ship desktop-first; the responsive refinement follows once the floor is set — see Open Roadmap Question 2).
- **Risk:** Sequenced before the chat north star because the chat panel attaches to this page — there is nowhere to put chat until the lesson surface exists. Kept deliberately thin (no chat) so the north star (S-02) lands as early as possible. Video is an external embed per Non-Goals, so no hosting/transcoding work here.
- **Status:** done (2026-05-29 impl_reviewed at `d087924`) — 5-phase implementation `442a6cf` → `c287271` → `141ea38` → `ad4b29f` → `4228222`; close-out + triage at `d087924`. 18 manual rows deferred per "ship over polish" — non-blocking.

### S-02: Lesson-scoped chat (NORTH STAR)

- **Outcome:** A signed-in learner can post a message in the chat panel scoped to the current lesson and read prior messages — operator-seeded threads pinned on top, peer messages chronological below — with new messages appearing live, without leaving the lesson page or interrupting the video.
- **Change ID:** `lesson-scoped-chat`
- **PRD refs:** FR-004 (completes the chat-panel half of the lesson page), FR-005 (post a message), FR-006 (read prior messages, seed-pinned + chronological), US-01 (the full unblock loop), NFR (< 200 ms post ack, < 2 s cross-viewer visibility; chat must not degrade the lesson flow).
- **Prerequisites:** S-01 (lesson page to host the chat panel), F-01 (message schema + RLS).
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Realtime transport shape (Supabase Realtime channel-per-lesson vs polling) and whether it meets the < 2 s NFR at MVP scale — Owner: user/team, resolve during `/10x-plan`. Block: no (`infrastructure.md` already commits to Supabase Realtime; this is a planning detail, not a roadmap blocker).
  - Operator-seeding workflow (how seed messages are inserted before launch, given no in-product UI) — Owner: user. Block: no (out-of-band per FR-007 model; the operator-seed flag from F-01 is the hook).
- **Risk:** The validation milestone and the riskiest slice in one. Carries both the product risk (will learners use lesson chat to unblock?) and the technical risk (realtime < 2 s without degrading the video). Sequenced as early as its prerequisites allow (immediately after the thin S-01) because, for `main_goal: market-feedback`, every later slice is wasted effort if this loop doesn't land. The Guardrail (chat must not degrade the lesson) is the acceptance bar.
- **Status:** done (2026-05-30 impl_reviewed + epilogue at `a97eef8` + `9340ae8`) — 5-phase implementation `f0baa1d` → `c65d0b5` → `d2ae86f` → `99bf572` → `fd5daec`; close-out `9340ae8`; impl-review triage `a97eef8`. NORTH STAR validated end-to-end: cross-viewer visibility verified <2 s via psql INSERT, reconnect catch-up verified via DevTools offline test, optimistic post + dedup verified via composer flow.

### S-03: Operator message moderation

- **Outcome:** The operator can delete any message in any lesson chat, removing toxic or off-topic content. No in-product moderation UI — exercised out-of-band against the data store.
- **Change ID:** `operator-message-moderation`
- **PRD refs:** FR-007 (operator can delete any message).
- **Prerequisites:** F-01 (messages to delete), S-02 (messages are being posted before moderation has anything to act on).
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Whether "out-of-band" is acceptable for launch or a minimal operator-only delete affordance is needed — Owner: user. Block: no (PRD Non-Goals explicitly defer an in-product moderation interface; out-of-band delete is the v1 contract).
- **Risk:** Smallest slice; sequenced last because moderation is only meaningful once peer posting (S-02) exists. Low risk — the operator-seed flag and RLS from F-01 already establish the data paths; this adds a delete capability, not new infrastructure.
- **Status:** done (2026-05-30) — Phase 1 at `0c26468` (Cell 5 probe in `supabase/tests/rls_matrix.sql` asserts authenticated DELETE returns row_count = 0 for own + seeded messages; `docs/operator/moderation.md` workflow guide + `docs/operator/moderation-log.md` changelog skeleton). Verified manually: operator DELETE via psql removed `d0000000-...005`; refresh on lesson page showed the message gone.

## Backlog Handoff

> **Mirrored to Linear** (2026-05-28): [Unstuck — MVP Roadmap](https://linear.app/unstack-ai/project/unstuck-mvp-roadmap-b74a3f5bda9a) (team `UNS`). Each item below is a Linear issue with native blocked-by relations (F-01 → S-01 → S-02 → S-03) and `foundation` / `slice` / `north-star` labels. Linear is the canonical, shareable backlog; this table is the local index.

| Roadmap ID | Change ID                     | Linear | Suggested issue title                                  | Ready for `/10x-plan` | Notes |
| ---------- | ----------------------------- | ------ | ------------------------------------------------------ | --------------------- | ----- |
| F-01       | `lesson-chat-data-model`      | [UNS-5](https://linear.app/unstack-ai/issue/UNS-5) | Lesson & chat data model (schema + RLS + seed flag)    | yes                   | Run `/10x-plan lesson-chat-data-model` — the only `ready` item; unblocks everything. |
| S-01       | `lesson-workspace-shell`      | [UNS-6](https://linear.app/unstack-ai/issue/UNS-6) | Lesson workspace shell (catalog + video + markdown)    | no                    | Needs F-01. Cross-device floor (OQ 2) is a non-blocking unknown — ship desktop-first. |
| S-02       | `lesson-scoped-chat`          | [UNS-7](https://linear.app/unstack-ai/issue/UNS-7) | Lesson-scoped chat — post, read, live (NORTH STAR)     | no                    | Needs S-01 + F-01. The validation milestone. |
| S-03       | `operator-message-moderation` | [UNS-8](https://linear.app/unstack-ai/issue/UNS-8) | Operator message moderation (out-of-band delete)       | no                    | Needs F-01 + S-02. |

## Open Roadmap Questions

1. **Authentication mechanism flavor (password / magic-link / federated)?** — Owner: user. Block: none. De-facto resolved by the present baseline — the shipped starter uses Supabase email/password and it is verified in production. PRD OQ#1 stays nominally open only if you intend to change the mechanism; otherwise treat as answered (email/password).
2. **Cross-device support floor — which mobile OS / browser versions must the responsive layout support?** — Owner: user. Block: S-01's responsive refinement only (not S-01 desktop, not the north-star path). FR-004 commits to a narrow-screen bottom-drawer; without a floor, "responsive" is unenforceable. Resolve before the responsive portion of S-01 is planned; desktop-first can proceed without it.

## Parked

- **In-platform video hosting** — Why parked: PRD Non-Goals; lessons embed externally-hosted video, no hosting/transcoding in scope (likely never).
- **Paywall / payment gateway / per-course billing** — Why parked: PRD Non-Goals; all v1 lessons are free-tier, paywall deferred to v2.
- **Course-completion tracking, progress %, certificates, badges** — Why parked: PRD Non-Goals; the unblock loop doesn't depend on completion telemetry.
- **Native mobile applications** — Why parked: PRD Non-Goals; mobile reach via responsive web only.
- **In-product moderation interface (flag/report UI, admin dashboard)** — Why parked: PRD Non-Goals; moderation is out-of-band (S-03).
- **Search / sort / threading / pinning of peer messages** — Why parked: PRD Non-Goals; only operator-seeded-vs-peer prioritization in v1; the rest lands when a lesson chat exceeds ~50 messages.
- **Automated context-matching / AI recommendation engine** — Why parked: PRD Non-Goals + `shape-notes.md` `## Forward: product-roadmap`. The v2 evolution (auto-match a learner's question to the highest-rated historical solution) builds on the v1 curation-based rule; no LLM dependency in v1.
- **Replay 18 deferred S-01 manual verification rows** — Why parked: `ship-over-polish` operating preference at MVP-complete. Source: [`context/changes/lesson-workspace-shell/reviews/impl-review.md`](../changes/lesson-workspace-shell/reviews/impl-review.md) "Manual / Deferred" section. Revisit after first-user observation; decide which still matter before walking them mechanically — many may be invalidated or already-confirmed by real usage.
- **Branded confirmation email + custom-domain sender** — Why parked: S-04 reverted to Supabase default sender (`noreply@mail.app.supabase.io`) because Resend free tier requires a verified custom domain to send to arbitrary recipients. Resend account is provisioned and ready; flip happens the day a custom domain (e.g., `unstuck.app`) is purchased and DNS-verified. Scope when un-parked: (a) verify domain on Resend (~15-30 min DNS), (b) flip Custom SMTP toggle back on in Supabase prod dashboard with the existing Resend API key + new sender like `noreply@unstuck.app`, (c) customize the confirmation email template in Supabase (subject + body + branding) so users recognize it as Unstuck. Removes the 2-email/hour project cap and the visual-mismatch UX issue.
- **Unify SignInForm yellow-box button styling** — Why parked: ship-over-polish at S-04 close. `[Send confirmation again]` button and `[Enter code →]` link share base classes but have asymmetric icon placement (left vs right) and the resend button widens during countdown (`Send again (60s)`) which makes them visually mismatched when wrapped. Quick fix scope: pick one icon side, set `min-w-[…]` on both, or use `flex-1` for equal width; consider a `grid grid-cols-2` instead of `flex flex-wrap`. Trivially small but better grouped with the broader brand-polish slice (S-08) so we don't churn the button twice.
- **Distinguish RLS-gated lessons from genuinely-empty chapter in course detail UI** — Why parked: S-05 impl-review F1 caught it but the failure mode is unreachable today (only course is free, `has_course_access` returns true for everyone signed-in). Becomes real the day a paid course lands without enrollment. The PostgREST embed `chapters?select=*,lessons(*)` returns chapter rows with `lessons: []` for gated users — UI then renders "No lessons in this chapter yet." for every chapter, misleading the user into thinking the course is empty rather than that they need access. Fix scope: a page-level access probe (RPC wrapper around `public.has_course_access(course.id)`) to branch the chapter placeholder copy ("Enroll to view lessons" vs "No lessons yet"). Block on the paid-course / enrollment slice.
- **Page-wide particle burst on Mark Complete (origin = button)** — Why parked: captured 2026-05-31 during S-07 manual review. The S-06 completion celebration currently spawns particles bounded to the button's local container; user wants the burst to emanate from the button position but fill the viewport (full-page canvas overlay). Scope when un-parked: lift the particle system to a `position: fixed` overlay rendered at the document root (likely a portal from `MarkCompleteButton`), compute the button's viewport-rect at click time, seed particle origins from that rect, animate across the full viewport. Z-index above content but below modals; pointer-events: none. Keep the existing fade/cleanup logic so it doesn't linger.
- **Replace topbar email with username/profile entry point** — Why parked: captured 2026-05-31 during S-07 manual review. Showing the raw email next to Dashboard / Sign out is both ugly and a privacy leak when screen-sharing. Scope: surface `profiles.display_name` as the primary identity (fall back to email-local-part); change the topbar element to either a username pill or a Profile icon/word that opens an account dropdown (Profile, Settings, Sign out). Account-settings page itself can be a stub initially — the key win is hiding the email.
- **Aside-collapsed → content fluidly takes full width** — Why parked: captured 2026-05-31 during S-07 manual review. Today collapsing the aside hides the panel but the lesson grid keeps its 360px right column reserved (CSS grid template stays fixed). When collapsed, the grid should collapse to single-column so the video + content naturally take the freed width. Scope: thread `collapsed` state out of `LessonAside` (e.g., via a small client-side event or moving the grid into a wrapper island) and switch the grid template based on it; or use a CSS-only approach with `:has()` once browser support is acceptable.
- **Rich custom video player controls** — Why parked: captured 2026-05-31 during S-07 manual review. The current YouTube embed exposes only YouTube's default chrome. User wants a unified player with: play/pause, volume, settings cog (quality + playback speed), CC toggle, fullscreen, and an **Expand** button that auto-collapses the right aside to maximize stage. Scope: likely a custom player wrapping the YouTube iframe API (or migrating to a self-hostable player like Plyr / Vidstack), then wiring the Expand button to the same aside-collapse mechanism above. Expensive but high-impact for the "lean back and learn" mode.
- **Content / Autodescription tabs under the video** — Why parked: captured 2026-05-31 during S-07 manual review. Below the video, two tabs: **Content** (default, current `lesson.content_md` markdown) and **Autodescription** (text-only summary of the video for readers who skip the playback). Data scope: needs a new `lessons.autodescription_md` column (operator-seeded; nullable; the tab is hidden if absent); seed pipeline updated; UI tab strip styled to match the aside's tabs for consistency.
- **Save lesson as `.md` / `.pdf` (+research-driven format choice)** — Why parked: captured 2026-05-31 during S-07 manual review. A **Save** button next to Mark as Complete that exports the current lesson's content (markdown body + optional video link) to a downloadable file. Constraint: the export must be useful for personal notes but NOT a clean mirror of the course (otherwise the platform becomes redundant once the user has every lesson saved). Research scope before implementation: (a) compare server-side PDF (Workers-compatible? puppeteer is too heavy; consider `@react-pdf/renderer` or a hosted service) vs client-side markdown download; (b) decide whether to include video URL (deep-link risk vs convenience); (c) consider auto-summarization (LLM) to inject value-add into the export so the saved version is a derivative, not a copy. Likely a two-phase change: (1) ship plain-markdown export, (2) layer PDF and/or summarization.
- **Lesson topbar prev/next arrows + "Lesson N of M" badge** — Why parked: captured 2026-05-31 during S-07 manual review. At the top of the lesson page, in the same container as the `← <course>` back link, add right-aligned **Back** and **Next** arrows. Back hidden on the first lesson of the course; Next hidden on the last. Click navigates to the sibling lesson. Also: above the H1 lesson title, surface a `Lesson 9 of 16` badge (current position / total lessons across all chapters in the course). Data is already loaded by S-07's `Promise.all` (chapters with lessons); just flatten and compute the index. Wire prev/next via the same flattened list. Cosmic-styled badge to match the existing Reading badge.

## Done

- **F-01: (foundation) a persistent schema exists for courses, lessons, and lesson-scoped messages, with an operator-seed flag distinguishing curated threads from peer posts, and row-level security enforcing that chat content is reachable only by signed-in, enrolled/free-tier learners.** — Archived 2026-05-30 → `context/archive/2026-05-28-lesson-chat-data-model/`. Lesson: —.
- **S-01: A learner can browse the single-course catalog, open a lesson, and watch its embedded video alongside its markdown content. On desktop the lesson body and a (still-empty in this slice) chat region sit side by side; on narrow screens the layout reflows.** — Archived 2026-05-30 → `context/archive/2026-05-28-lesson-workspace-shell/`. Lesson: —.
- **S-02: A signed-in learner can post a message in the chat panel scoped to the current lesson and read prior messages — operator-seeded threads pinned on top, peer messages chronological below — with new messages appearing live, without leaving the lesson page or interrupting the video.** — Archived 2026-05-30 → `context/archive/2026-05-29-lesson-scoped-chat/`. Lesson: —.
- **S-03: The operator can delete any message in any lesson chat, removing toxic or off-topic content. No in-product moderation UI — exercised out-of-band against the data store.** — Archived 2026-05-30 → `context/archive/2026-05-30-operator-message-moderation/`. Lesson: —.
- **Re-order lesson aside tabs (Lessons default) + completion sync + course-updated indicator** — Shipped & archived 2026-06-02 (`6d82c52`) → `context/archive/lesson-tabs-reorder-and-completion-sync/`.
- **`cursor: pointer` on all interactive controls + custom main-page cosmic scrollbar** — Shipped as polish (now in `global.css` base layer + `html`/`body` scrollbar rules).
- **Site-wide light theme + sun/moon toggle** — impl_reviewed 2026-06-03 (`386011c` → `f7c603f`; review `4ac9d00`). Cosmic-dawn light palette, root-level theme control with no-FOUC cookie+SSR+inline-script, semantic status/glass tokens, theme-aware lesson markdown. Linear UNS-16. Pending prod deploy.
