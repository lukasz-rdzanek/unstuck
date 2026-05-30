---
change_id: lesson-scoped-chat
title: Lesson-scoped chat — post, read, live (NORTH STAR)
status: implemented
created: 2026-05-29
updated: 2026-05-30
archived_at: null
---

## Notes

S-02 from roadmap.md — the validation milestone. Closes US-01: a signed-in
learner posts a message in a lesson's chat panel, reads prior messages
(operator-seeded pinned on top, peer messages chronological below), and sees
new messages from other learners live without leaving the lesson page or
interrupting the video.

Prereqs: S-01 (lesson page hosts the chat panel — placeholder slot already
rendered; see `src/pages/courses/[slug]/lessons/[lessonSlug].astro`); F-01
(`messages` table with `is_seeded` partition, RLS gated by `has_course_access`,
already joined to `supabase_realtime` publication).

PRD anchors:
- FR-004 — completes the chat-panel half of the lesson page.
- FR-005 — signed-in learner can post a message.
- FR-006 — read prior messages, operator-seeded pinned on top, peer messages
  chronological below.
- US-01 — the full unblock loop.
- NFR — < 200 ms post ack, < 2 s cross-viewer visibility; chat must not
  degrade the lesson flow (no video pause, no focus steal).

Unknowns to resolve during /10x-plan (per roadmap):
- Realtime transport shape (Supabase Realtime channel-per-lesson is committed
  by infrastructure.md; planning detail is whether channel naming + ordering +
  reconnect can hit the < 2 s NFR at MVP scale).
- Operator-seeding workflow (out-of-band per FR-007; the `is_seeded` flag is
  the hook — how seeded messages get inserted before launch given there's no
  in-product UI).

S-01 carry-over: 18 manual verification rows on `lesson-workspace-shell`'s
plan.md remain `[ ]` — deferred per the "ship over polish" memory; not
blocking S-02 start. They'll surface as informational warnings during
`/10x-archive` for S-01.
