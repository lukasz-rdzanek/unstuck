---
project: "Unstuck"
version: 1
status: draft
created: 2026-05-26
context_type: greenfield
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# Unstuck — Product Requirements Document

## Vision & Problem Statement

A self-taught learner upskilling in an advanced technical topic hits a bug or unexpected obstacle inside a video lesson and needs immediate peer validation. The course's official Q&A section is a ghost town. To get unblocked, they abandon their flow state and hunt for context across fragmented chat communities and discussion forums unrelated to the course they were following. They lose hours of deep work and often abandon the project entirely.

The insight that makes this product worth building: community must be lesson-scoped, not course-scoped. Existing course platforms attach community as a separate forum or general tab, so peer validation when a learner is stuck arrives slowly or not at all. Existing community platforms decouple the conversation from the content surface entirely, so the context a stuck learner needs to share is buried. This product unifies the lesson and the conversation about that lesson — peer help arrives in the same surface the learner is already working in, at the moment the failure (flow-state interruption, drop-off) is being felt.

## User & Persona

Primary persona: a self-taught learner working through technical video content. The canonical case is an intermediate-to-advanced practitioner upskilling in a discipline that mixes video instruction with hands-on practice — examples include frontend or backend engineering, data work, infrastructure, automation, product/operations tooling, and analogous technical fields.

They reach for this product the moment they hit a blocker mid-lesson — typically a bug, configuration issue, or concept they cannot resolve from the material alone — and need a contemporary peer working through the same lesson to validate or unblock them, without abandoning the page they are on.

## Success Criteria

### Primary

- A signed-in free-tier learner can complete the MVP flow end-to-end: land on a lesson, hit a blocker, post in the lesson-scoped chat panel, locate a relevant prior message (operator-seeded or peer-posted), apply it, and resume the lesson — without leaving the platform. The loop is demonstrable on every operator-seeded lesson from launch day.

### Secondary

- Learners post their own questions and answers in lesson chats organically — the community begins to self-sustain alongside operator-seeded threads, not only consume them.

### Guardrails

- The chat panel must not degrade the video / lesson flow. Posting, scrolling the chat, or receiving new chat messages must not interrupt video playback, steal focus from the lesson body, or noticeably slow the page. The product's promise is "don't leave the platform" — if the chat panel makes the lesson worse than a plain video page would be, the product breaks its own thesis.

## User Stories

### US-01: Free-tier learner gets unblocked in lesson-scoped chat

- **Given** a signed-in free-tier learner watching a free-tier lesson on the platform
- **When** they encounter a blocker (bug, configuration issue, unfamiliar step) and post a message in the chat panel pinned to that lesson
- **Then** they can read prior messages — including operator-seeded threads — in chronological order, locate one that addresses their blocker, apply the solution, and resume the lesson without leaving the page

#### Acceptance Criteria

- The chat panel is visible without scrolling on a standard desktop viewport.
- New messages appear in the chat without a full-page reload.
- Operator-seeded messages are indistinguishable in format from peer messages.
- Posting a message does not pause or reload the embedded video.

## Functional Requirements

### Authentication

- FR-001: Learner can create an account. Priority: must-have
  > Socrates: Counter considered — "email signup adds friction; magic-link or social OAuth would lose fewer first-time visitors." Resolution: rephrased FR to be mechanism-agnostic. Auth flavor (password / magic-link / OAuth) is a downstream stack decision and remains parked in Open Question #1; the FR captures the product-level capability only.

- FR-002: Returning learner can sign in to an existing account. Priority: nice-to-have
  > Socrates: Counter considered — "first-session is the only session for most MVP users; returning login is not load-bearing." Resolution: demoted to nice-to-have. v1 can rely on fresh sign-ups for repeat visits; proper sign-in lands in v2 or when the first returning-user complaint arrives.

### Lesson workspace

- FR-003: Visitor can view the public course catalog (single course in MVP). Priority: must-have
  > Socrates: Counter considered — "with only one course, a 'catalog' is just the course's landing page; cut it." Resolution: kept as written. Even a single-course view will be implemented as the catalog page so course #2 lands cleanly without UI rework.

- FR-004: Signed-in learner can view a lesson page combining an embedded video player, markdown content, and a lesson-scoped chat panel. On desktop the chat is shown alongside the lesson body; on narrow screens (mobile / tablet portrait) the chat collapses to a bottom drawer the learner can expand. Priority: must-have
  > Socrates: Counter considered — "side-by-side breaks on mobile; needs an answer for narrow screens or mobile must be a Non-Goal." Resolution: user committed mobile in scope; FR revised to specify the bottom-drawer pattern on narrow screens. Adds responsive UI work; the 3-week MVP timeline budget is tight under this commitment.

### Lesson-scoped chat

- FR-005: Signed-in learner can post a message in the chat panel scoped to the current lesson. Priority: must-have
  > Socrates: Counter considered — "no moderation tools means toxic / off-topic posts have no remedy." Resolution: added FR-007 (operator can delete any message). FR-005 itself stands as written.

- FR-006: Signed-in learner can read prior messages in the lesson-scoped chat panel. Operator-seeded threads are pinned to the top of the panel; peer-posted messages appear below them in chronological order. Priority: must-have
  > Socrates: Counter considered — "chronological order buries seed threads as chat grows; no search means learners scroll past the answer." Resolution evolved during Business Logic capture: pinning of operator-seeded threads to the top is the MVP-level business rule. Within peer messages, chronological order remains sufficient at MVP scale; search and full sorting become load-bearing when a lesson chat exceeds ~50 messages.

### Moderation

- FR-007: Operator can delete any message in any lesson chat. Priority: must-have
  > Socrates: Added during the Socrates challenge round as resolution to FR-005's moderation counter. No in-product moderation interface is provided in v1; the operator exercises this capability through out-of-band content management. Provides a remedy for toxic / off-topic content without adding admin-role infrastructure.

## Non-Functional Requirements

- A learner's chat message is acknowledged in their own viewer within 200 ms of submission, and new messages from other learners appear in any open viewer of the same lesson within 2 seconds. Below these thresholds, the chat panel is congruent with the Success-Criteria Guardrail (does not degrade the lesson flow).
- Lesson-chat content is not accessible to unauthenticated visitors, nor to signed-in learners who have not enrolled in (or accessed the free-tier of) the course that contains the lesson. The product makes no commitment to public chat indexing or search-engine visibility of any chat content.

## Business Logic

The application surfaces operator-curated solutions at the top of every lesson chat so that learners encounter validated historical answers before peer discussion, with peer messages below in chronological order.

Inputs the rule consumes (as user-facing inputs): the lesson the learner is currently viewing, and the set of messages that have been posted in that lesson's chat — partitioned into operator-seeded threads and peer-posted messages.

Output: an ordered display of the lesson's chat. Operator-seeded threads — pre-loaded by the platform operator before learners arrived — appear pinned at the top of the panel. Peer-posted messages appear below them in posting order.

How the user encounters it: when a learner hits a blocker mid-lesson and opens the chat panel, the first messages they see are operator-curated solutions to the most common blockers for that lesson. If no operator seed addresses their issue, they scroll into the peer messages or post their own question and rely on the community.

## Access Control

The product is multi-user with sign-in required for any non-public action. The public course catalog is browsable without an account; enrolling in a course, watching lessons, and posting in lesson chat all require a signed-in user.

Roles (MVP):

- **Free-tier learner** — signed in. The paywall is bypassed for courses (or course slices) marked as free / test mode. Can watch those lessons and post in their lesson chat. Cannot access paid-only content.
- **Paid learner** — signed in. Has cleared the paywall for one or more specific courses. Can watch lessons in their enrolled courses, post in lesson chat for those courses, and read other enrolled learners' messages there. (No payment flow ships in v1 — see Non-Goals.)
- **Operator** — the single platform owner. Seeds initial chat content per lesson before launch and can delete any message (per FR-007). No in-product administrative interface is provided in v1.

Sign-up vs sign-in: standard account creation and return-login. Specific authentication mechanism is deferred to downstream stack selection — see Open Question #1.

Gated-route behavior when an unauthenticated visitor clicks a gated action: not yet confirmed by the user — see Open Question #2.

Instructor / course creator role: deferred to v2. No course-authoring interface in MVP; the operator manages all course content out-of-band.

## Non-Goals

- **No in-platform video hosting.** Lessons embed externally-hosted videos chosen by the operator. The platform does not host, transcode, or store video content in v1 (likely never in scope).
- **No paywall or payment gateway in MVP.** All lessons in v1 are free-tier (paywall bypassed for the single seeded course). Per-course billing, payment integration, and the paid-learner role's paid-content access path are all deferred to v2.
- **No course-completion tracking, progress percentages, certificates, or badges.** The MVP value loop (peer unblocking) does not depend on completion telemetry; locking these out preserves the 3-week build budget.
- **No native mobile applications.** Mobile reach is achieved through responsive web (FR-004's bottom-drawer chat pattern); no native development is in scope.
- **No in-product moderation interface.** Moderation is exercised by the operator out-of-band (per FR-007). No flag/report UI, no administrative dashboard.
- **No search, sort, threading, or pinning of peer messages.** The only prioritization is operator-seeded-vs-peer (per FR-006); within peer messages, chronological order is the only sort. Search and threading land in v2.
- **No automated context-matching or recommendation engine in MVP.** Captured as a v2 candidate. The MVP rule is curation-based; automated matching does not land in v1.

## Open Questions

1. **Authentication mechanism flavor?** — Owner: user. Resolves during downstream stack selection. Non-blocking for product shape, but binding for v1 implementation. Mechanism options under consideration include password-based, magic-link, and federated sign-in patterns; the PRD does not constrain which.
2. ~~**What happens when an unauthenticated visitor clicks a gated action (enroll / watch / post)?**~~ — **RESOLVED 2026-05-27.** An unauthenticated visitor who clicks a gated action is redirected to `/auth/signin`. The intended destination is preserved in a query parameter (`?next=<original-path>`) and the visitor is returned to that destination after successful sign-in. This is the conventional intent-preserving redirect pattern, and the starter's `src/middleware.ts` already implements the redirect half (the `?next=` round-trip handling lives in the sign-in form's success handler; verify and complete during implementation).
3. **Cross-device support floor?** — Owner: user. FR-004 commits to a narrow-screen bottom-drawer chat pattern, but no Non-Functional Requirement locks which mobile operating systems and browser versions are in the v1 support floor. Without a floor, "responsive mobile" is unenforceable. Resolve before build.
