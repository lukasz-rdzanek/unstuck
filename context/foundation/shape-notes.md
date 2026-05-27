---
project: "Unstuck"
context_type: greenfield
created: 2026-05-25
updated: 2026-05-26
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "workflow friction — deep-work / flow-state interruption is the primary cost"
    - topic: "core insight"
      decision: "community must be lesson-scoped, not course-scoped; peer validation arrives in-context and live"
    - topic: "primary persona scope"
      decision: "any self-taught learner of a technical topic via video; advanced React dev is the canonical example, not a constraint"
    - topic: "auth shape"
      decision: "hybrid login — public catalog browsable; sign-in required to enroll, watch lessons, or post in lesson chat"
    - topic: "MVP roles"
      decision: "free-tier learner + paid learner; instructor/course creator DEFERRED to v2 (operator seeds content)"
    - topic: "MVP scope path"
      decision: "scope down: flat chat (no threading/pinning), YouTube/Vimeo embed, one course with hardcoded lessons, paywall deferred to v2, operator-seeded chat content"
    - topic: "cold-start strategy"
      decision: "operator-seeded threads pre-launch — 5–10 plausible problem/solution messages per lesson before any real user arrives"
    - topic: "MVP timeline target"
      decision: "~3 weeks of after-hours work (scoped down)"
    - topic: "mobile scope"
      decision: "in scope — chat collapses to a bottom drawer on narrow screens (responsive web, not native apps)"
    - topic: "business logic rule"
      decision: "MVP: operator-seeded threads pinned to top of every lesson chat, peer messages chronological below. Full automated context-matching engine deferred to v2 (Forward: product-roadmap)."
    - topic: "AI / LLM guard"
      decision: "AI acceptable in MVP IF it IS the recommendation engine; MVP rule does not require AI, but the door is open for v2 LLM-based matching"
    - topic: "product type"
      decision: "web-app (responsive desktop + mobile via bottom-drawer chat)"
    - topic: "target scale"
      decision: "medium — dozens to ~100 users at MVP launch"
    - topic: "timing"
      decision: "no hard deadline; after-hours / side project"
    - topic: "project name"
      decision: "Unstuck (placeholder; user-renameable downstream)"
  frs_drafted: 7
  quality_check_status: accepted
---

# Shape notes

Working notes for the future PRD. Sections below anticipate the greenfield PRD schema (10 sections in order). Frontmatter `checkpoint:` is load-bearing for resume; do not hand-edit it during a session.

## Vision & Problem Statement

A self-taught developer upskilling in advanced React architecture hits a bug inside a video module and needs immediate peer validation. The course's official Q&A section is a ghost town. To get unblocked, they abandon their flow state and hunt for context across fragmented, unrelated Discord servers and Reddit threads. They lose hours of deep work and often abandon the project entirely.

The insight that makes this product worth building: community must be lesson-scoped, not course-scoped. Existing course platforms attach community as a separate forum or general tab, so peer validation when a learner is stuck arrives slowly or not at all. Existing community platforms (Circle, Skool, Mighty Networks) decouple the conversation from the content surface entirely, so the context a stuck learner needs to share is buried. This product unifies the lesson and the conversation about that lesson — peer help arrives in the same surface the learner is already working in, at the moment the failure (flow-state interruption, drop-off) is being felt.

## User & Persona

Primary persona: a self-taught learner working through technical video content. The canonical example is an intermediate-to-advanced developer studying a topic like React architecture; the audience extends to other technical disciplines that mix video instruction with hands-on practice.

They reach for this product the moment they hit a blocker mid-lesson — typically a bug, error, or concept they cannot resolve from the material alone — and need a contemporary peer working through the same lesson to validate or unblock them, without abandoning the page they are on.

**Scale note:** at the MVP target (dozens to ~100 users) the curation-based rule (operator-seeded threads pinned to top, peer messages chronological below) is sufficient. At ~100x that scale, peer noise will overwhelm seeds within days and manual operator curation cannot keep up — at that point the `## Forward: product-roadmap` matching engine moves from aspirational to load-bearing.

## Success Criteria

### Primary

- A signed-in free-tier learner can complete the MVP flow end-to-end: land on a lesson, hit a blocker, post in the lesson-scoped chat panel, locate a relevant prior message (operator-seeded or peer-posted), apply it, and resume the lesson — without leaving the platform. The loop is demonstrable on every operator-seeded lesson from launch day.

### Secondary

- Learners post their own questions and answers in lesson chats organically — the community begins to self-sustain alongside operator-seeded threads, not only consume them.

### Guardrails

- The chat panel must not degrade the video / lesson flow. Posting, scrolling chat, or receiving new chat messages must not interrupt video playback, steal focus from the lesson body, or noticeably slow the page. The product's promise is "don't leave the platform" — if the chat panel makes the lesson worse than a plain video page would be, the product breaks its own thesis.

## User Stories

### US-01: Free-tier learner gets unblocked in lesson-scoped chat

- **Given** a signed-in free-tier learner watching a free-tier lesson on the platform
- **When** they encounter a blocker (bug, configuration issue, unfamiliar step) and post a message in the chat panel pinned to that lesson
- **Then** they can read prior messages — including operator-seeded threads — in chronological order, locate one that addresses their blocker, apply the solution, and resume the lesson without leaving the page

#### Acceptance Criteria

- The chat panel is visible without scrolling on a standard desktop viewport.
- New messages appear in the chat without a full-page reload.
- Operator-seeded messages are indistinguishable in format from peer messages.
- Posting a message does not pause or reload the video.

## Functional Requirements

### Authentication

- FR-001: Learner can create an account. Priority: must-have
  > Socrates: Counter considered — "email signup adds friction; magic-link or social OAuth would lose fewer first-time visitors." Resolution: rephrased FR to be mechanism-agnostic. Auth flavor (password / magic-link / OAuth) is a downstream stack decision and remains parked in Open Question #1; the FR captures the product-level capability only.

- FR-002: Returning learner can sign in to an existing account. Priority: nice-to-have
  > Socrates: Counter considered — "first-session is the only session for most MVP users; returning login is not load-bearing." Resolution: demoted to nice-to-have. v1 can rely on fresh sign-ups for repeat visits; proper sign-in lands in v2 or when the first returning-user complaint arrives.

### Lesson workspace

- FR-003: Visitor can view the public course catalog (single course in MVP). Priority: must-have
  > Socrates: Counter considered — "with only one course, a 'catalog' is just the course's landing page; cut it." Resolution: kept as written. Even a single-course view will be implemented as the catalog page so course #2 lands cleanly without UI rework.

- FR-004: Signed-in learner can view a lesson page combining an embedded video player, markdown content, and a lesson-scoped chat panel. On desktop the chat is side-by-side with the lesson body; on narrow screens (mobile / tablet portrait) the chat collapses to a bottom drawer the learner can expand. Priority: must-have
  > Socrates: Counter considered — "side-by-side breaks on mobile; needs an answer for narrow screens or mobile must be a Non-Goal." Resolution: user committed mobile in scope; FR revised to specify the bottom-drawer pattern on narrow screens. Adds responsive UI work; the 3-week MVP timeline budget is tight under this commitment.

### Lesson-scoped chat

- FR-005: Signed-in learner can post a message in the chat panel scoped to the current lesson. Priority: must-have
  > Socrates: Counter considered — "no moderation tools means toxic / off-topic posts have no remedy." Resolution: added FR-007 (operator can delete any message via direct content management, no in-app moderation UI). FR-005 itself stands as written.

- FR-006: Signed-in learner can read prior messages in the lesson-scoped chat panel. Operator-seeded threads are pinned to the top of the panel; peer-posted messages appear below them in chronological order. Priority: must-have
  > Socrates: Counter considered — "chronological order buries seed threads as chat grows; no search means learners scroll past the answer." Resolution evolved in Phase 5: pinning of operator-seeded threads to the top is now the MVP-level business rule. Within peer messages, chronological order remains sufficient at MVP scale; search and full sorting become load-bearing when a lesson chat exceeds ~50 messages — revisit then.

### Moderation

- FR-007: Operator can delete any message in any lesson chat. Priority: must-have
  > Socrates: Added during Step 4.5 as resolution to FR-005's moderation counter. No in-app moderation UI; operator acts directly on the data store. Provides a remedy for toxic / off-topic content without adding admin-role infrastructure.

## Non-Functional Requirements

- A learner's chat message is acknowledged in their own viewer within 200 ms of submission, and new messages from other learners appear in any open viewer of the same lesson within 2 seconds. Below these thresholds, the chat panel is congruent with the Phase 3 Guardrail (does not degrade the lesson flow).
- Lesson-chat content is not accessible to unauthenticated visitors, nor to signed-in learners who have not enrolled in (or accessed the free-tier of) the course that contains the lesson. The product makes no commitment to public chat indexing or search-engine visibility of any chat content.

## Business Logic

The application surfaces operator-curated solutions at the top of every lesson chat so that learners encounter validated historical answers before peer discussion, with peer messages below in chronological order.

Inputs the rule consumes (as user-facing inputs): the lesson the learner is currently viewing, and the set of messages that have been posted in that lesson's chat — partitioned internally into operator-seeded threads and peer-posted messages.

Output: an ordered display of the lesson's chat. Operator-seeded threads — pre-loaded by the platform operator before learners arrived — appear pinned at the top of the panel. Peer-posted messages appear below them in posting order.

How the user encounters it: when a learner hits a blocker mid-lesson and opens the chat panel, the first messages they see are operator-curated solutions to the most common blockers for that lesson. If no operator seed addresses their issue, they scroll into the peer messages or post their own question and rely on the community.

The v2 evolution — automated context-matching of the learner's question against the highest-rated historical solution — is captured under `## Forward: product-roadmap`. The MVP rule is the curation-based foundation that v2's matching engine will build on.

## Access Control

The product is multi-user with login required for any non-public action. The public course catalog is browsable without an account; enrolling, watching lessons, and posting in lesson chat all require a signed-in user.

Roles (MVP):

- **Free-tier learner** — signed in. The paywall is bypassed for courses (or course slices) marked as free / test mode. Can watch those lessons and post in their lesson chat. Cannot access paid-only content.
- **Paid learner** — signed in. Has cleared the paywall for one or more specific courses. Can watch lessons in their enrolled courses, post in lesson chat for those courses, and read other enrolled learners' messages there.
- **Operator** — the single platform owner (you). Seeds initial chat content per lesson before launch and can delete any message (per FR-007). No in-app admin UI; operator acts directly on the data store.

Sign-up vs sign-in: standard account creation and return-login. Specific auth mechanism (password / OAuth / passwordless) is deferred to stack selection — see Open Questions.

Gated-route behavior when unauthenticated: not yet confirmed by the user — see Open Questions.

Instructor / course creator role: DEFERRED to v2 (resolved in Phase 3). No course-authoring UI in MVP; operator seeds all course content via direct content management.

## Non-Goals

- **No in-platform video hosting.** Lessons embed YouTube or Vimeo videos. No upload pipeline, no transcoding, no DRM in MVP — likely never in scope.
- **No paywall or payment gateway in MVP.** All lessons in v1 are free-tier (paywall bypassed for the single seeded course). Per-course billing, payment integration, and the paid-learner role's paid-content access path are all deferred to v2. Pinned here so the seed's paywall mention does not re-enter MVP scope.
- **No course-completion tracking, progress percentages, certificates, or badges.** The MVP value loop (peer unblocking) does not depend on completion telemetry; locking these out preserves the 3-week build budget.
- **No native mobile apps.** Mobile reach is achieved through responsive web (FR-004's bottom-drawer chat pattern); no iOS or Android native development in scope.
- **No in-app moderation UI / admin role.** Moderation is handled by the operator acting directly on the data store (per FR-007). No flag/report UI, no admin dashboard.
- **No search, sort, threading, or pinning of peer messages.** The only prioritization is operator-seeded-vs-peer (per FR-006); within peer messages, chronological order is the only sort. Search and threading land in v2.
- **No automated context-matching / AI recommendation engine in MVP.** Captured as v2 candidate in `## Forward: product-roadmap`. The MVP "no AI coaches" guard from the seed has been revised to allow AI in v2 if it IS the recommendation engine, but no LLM dependency lands in v1.

## Open Questions

1. **Auth mechanism flavor (password / OAuth / passwordless)?** — Owner: user, resolves during tech-stack selection. Non-blocking for product shape.
2. **What happens when an unauthenticated visitor clicks a gated action (enroll / watch / post)?** — Owner: user. Typical pattern is redirect-to-login then return to the gated content, but user has not confirmed. Resolve before /10x-prd.
3. ~~**Is "Instructor" a single platform owner (you) or many independent creators in MVP?**~~ — RESOLVED in Phase 3: instructor role deferred to v2; operator (single owner) seeds all course content for MVP. No course-authoring UI in MVP.
4. **Cross-device support floor?** — Owner: user. FR-004 commits to "narrow-screen bottom drawer" but no NFR locks which browsers / iOS / Android versions are in scope. Without a floor, "responsive mobile" is unenforceable. Resolve before build.

## Forward: product-roadmap

Captured for /10x-tech-stack-selector context — these are v2+ product directions, NOT MVP commitments.

**Automated context-aware matching engine (v2 candidate).** The user's full domain-rule vision: "The application automatically analyzes the context of a learner's question or error log and dynamically surfaces the highest-rated historical solution from that specific lesson's chat to instantly resolve their blocker."

This requires capabilities not in MVP:
- A matching engine (keyword / embeddings / LLM) that scores historical messages against a learner's freshly-typed question.
- A rating mechanism (votes, "marked as helpful", or downstream signal like "learner resumed the lesson within 60s of viewing this message") that ranks messages.
- A suggested-answer UI surface inside the lesson page that proactively presents matches.

The MVP rule (operator-curated pinning) is the curation-based foundation this v2 engine extends. The AI-coach Non-Goal from the seed has been revised: AI is acceptable in MVP if it IS the recommendation engine (the user has explicitly opened this door, but not yet committed for v1).

Implication for tech-stack selection: choose a stack that does not preclude adding an LLM-based matcher in v2 (rules out very thin stacks; admits flexibility for vector storage / embedding APIs later).

## Forward: tech-stack

The seed input volunteered stack-shaped intent that does NOT belong in the PRD but is preserved here for the downstream tech-stack-selection step:

- Stated stack preference: React + Next.js for the web frontend.
- Stated tooling preference: AI-assisted development with Claude Code and Cursor.
- Stated framing: "MVP prioritization — shortest path to a working flow; avoid scope creep (no AI coaches, no complex charts)." Note: the AI-coach part of this guard has been revised in Phase 5 — AI is acceptable in v2 if it IS the recommendation engine.

These are inputs to `10x-tech-stack-selector`, not commitments captured by this PRD.
