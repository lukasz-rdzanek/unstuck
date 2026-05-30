---
id: lesson-chat-data-model
title: Lesson & chat data model (schema + RLS + seed flag)
status: archived
created: 2026-05-28
updated: 2026-05-30
archived_at: 2026-05-30T10:58:07Z
phase: complete  # phase 1 done at ad8301d (1.1-1.7); phase 2 done at c9e25df (2.1-2.8); phase 3 done at 9b4960e (3.1-3.7); phase 4 done (4.1-4.5) — prod schema deployed via supabase db push, all 4 verification probes green
roadmap_ref: F-01
prd_refs:
  - NFR (privacy)
  - FR-006 (operator-seeded vs peer partition)
  - Business Logic (operator-seeded pinned on top)
  - Access Control (RLS)
---

# Lesson & chat data model

Foundation slice (F-01). A persistent, schema-only layer for courses, lessons, and
lesson-scoped messages, with an operator-seed flag partitioning curated threads from
peer posts, and row-level security enforcing that lesson content and chat are reachable
only by signed-in learners with course access. No application UI — this unblocks the
three chat slices (S-01 read paths, S-02 post/read live, S-03 delete).

## Artifacts

- `plan.md` — implementation contract
- `plan-brief.md` — compressed handoff
- `reviews/plan-review.md` — plan-review audit trail (4 findings, all fixed; verdict REVISE → SOUND)

## Upstream

- `context/foundation/roadmap.md` → F-01
- `context/foundation/prd.md` → NFR (privacy), FR-006, Business Logic, Access Control
