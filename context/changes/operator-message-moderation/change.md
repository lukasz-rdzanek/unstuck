---
change_id: operator-message-moderation
title: Operator message moderation — out-of-band delete
status: impl_reviewed
created: 2026-05-30
updated: 2026-05-30
archived_at: null
---

## Notes

S-03 from roadmap.md — the final MVP slice. Closes the moderation half
of US-01's guardrail: the platform owner can remove toxic or off-topic
messages from any lesson chat without an in-product admin UI.

Per PRD FR-007 + Non-Goals: "Operator can delete any message in any lesson
chat. No in-product moderation interface is provided in v1; the operator
exercises this capability through out-of-band content management." Roadmap
labels this as the smallest slice — the heavy lifting is already done by
F-01's RLS posture (`service_role` bypasses all policies; the application
`authenticated` session has no DELETE policy on messages).

Prereqs:
- F-01 (`messages` table + RLS with no peer-DELETE policy — already done)
- S-02 (peers must be posting before moderation has anything to act on —
  just shipped at a97eef8 + 9340ae8 epilogue, with impl-review APPROVED)

PRD anchor: FR-007 (operator can delete any message; no in-product admin
UI; out-of-band content management).

Expected scope (light — this is the smallest slice on the roadmap):
- Operator moderation guide as a sibling to `docs/operator/seeding.md`
  (or extending it) — locate-by-content + DELETE SQL recipes, audit log
  recommendations, "what to delete" rubric for toxic vs misframed content.
- Possibly a one-page rationale + delete-trail recommendation (manual
  changelog of operator deletions, since RLS has no DELETE policy = no
  Postgres trigger to log them automatically without schema change).
- Confirm by adversarial test: a regular signed-in `authenticated` user
  CANNOT delete any message via the supabase-js client — verify the RLS
  refusal lands as expected.

Unknowns to resolve during /10x-plan:
- Whether to add a tiny audit table / log convention for operator
  deletions (light schema migration) or keep purely doc-based for v1.
  Owner: user/team — resolve during planning. Block: no (PRD Non-Goals
  forbids in-product moderation; an audit log is operator-only and
  doesn't violate that).
- Whether the "what to delete" rubric belongs in PRD or in the operator
  doc itself. Owner: user. Block: no.

MVP closure: after S-03 ships + manual verify of operator-delete flow,
all four roadmap items (F-01 + S-01 + S-02 + S-03) are done and the
product can go to first-look. From the "ship over polish" memory:
remaining deferred items (account mgmt, multi-course, progress
tracking) move into a post-MVP backlog review session.
