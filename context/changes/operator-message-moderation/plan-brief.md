# Operator Message Moderation (S-03) — Plan Brief

> Full plan: `context/changes/operator-message-moderation/plan.md`

## What & Why

S-03 is the final MVP slice. It delivers operator-side moderation —
"the operator can delete any message in any lesson chat" (PRD FR-007) —
without an in-product admin UI (PRD Non-Goal). F-01 already shipped the
RLS posture that makes this safe (no DELETE policy for `authenticated`;
`service_role` bypasses); S-03 adds a regression-proof assertion plus
the operator workflow guide and audit log convention. Once S-03 ships,
F-01 + S-01 + S-02 + S-03 = MVP complete.

## Starting Point

F-01's `messages` table has zero DELETE/UPDATE policies for the
`authenticated` role — peers cannot mutate posted messages via the
application. `service_role` bypasses RLS by design (Supabase Studio's
SQL editor uses this role, as does Docker psql). `docs/operator/
seeding.md` already exists as the pattern for operator-facing markdown
guides; Step 4 there has a partial overlap (UPDATE/DELETE on seed
messages). `supabase/tests/rls_matrix.sql` (F-01) uses a probe-and-
assert pattern for RLS that S-03 extends.

## Desired End State

An adversarial probe in `rls_matrix.sql` asserts that authenticated
DELETE on messages returns 0 rows — protecting F-01's posture from
future accidental regression. An operator-facing
`docs/operator/moderation.md` walks the operator through locate-by-
content SQL, hard DELETE recipe, lightweight 3-5 criterion rubric, pre-
flight checklist, and the log convention. An append-only
`docs/operator/moderation-log.md` carries every deletion as a git-
tracked changelog. No schema migration, no app code change, no in-
product UI.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Delete semantics | Hard delete via service_role | Matches PRD literal "delete" + F-01 posture; avoids schema migration + RLS rewrite + chat filter + Realtime retest. |
| Audit log shape | Docs-only manual changelog (`moderation-log.md`) | Zero schema migration; operator discipline acceptable at v1 scale (single operator, ~100 users); revisit at scale. |
| Doc structure | Separate `docs/operator/moderation.md` (sibling to seeding.md) | Moderation deserves its own cognitive frame (toxic content vs curation); cross-link to seeding.md for shared prereqs; shareable separately. |
| Rubric depth + location | Lightweight 3-5 bullet rubric in `moderation.md` | Pragmatic for single-operator v1; latwy do iteracji; subjective edges acceptable. |
| Adversarial test mechanism | Extend `supabase/tests/rls_matrix.sql` with one probe block | Regression-proof; runs every `db reset`; matches F-01 pattern; cheaper than maintaining doc-only verify steps. |

## Scope

**In scope**:
- One adversarial probe block appended to `supabase/tests/rls_matrix.sql`
  asserting authenticated DELETE on messages denies (0 rows).
- New `docs/operator/moderation.md` — full operator workflow.
- New `docs/operator/moderation-log.md` — changelog skeleton with sample row.
- Phase 2: roadmap.md flip (S-03 → done, MVP-complete note) + epilogue.

**Out of scope**:
- Soft-delete `deleted_at` column + RLS filter + chat panel filter +
  Realtime retest (rejected as scope creep; revisit if PRD changes).
- `moderation_events` audit table + DELETE trigger (rejected; docs +
  operator discipline at v1 scale).
- DELETE event listener in ChatPanel — peers see deletes on next
  reload, not live (acceptable for moderation cadence).
- In-product moderation UI (PRD Non-Goal).
- Peer self-deletion (out of PRD scope).
- Bulk delete tooling (operator runs multi-row DELETE in Studio).
- Notification to deleted-message authors.
- Schema migrations of any kind.

## Architecture / Approach

S-03 = one SQL assertion + two markdown files. No app code touched, no
new tables, no new policies, no new APIs.

```
supabase/tests/rls_matrix.sql        ← APPEND probe block (authenticated DELETE denial)
docs/operator/moderation.md          ← NEW: operator workflow
docs/operator/moderation-log.md      ← NEW: changelog skeleton
```

The probe block follows F-01's existing pattern (SET LOCAL ROLE +
SET LOCAL request.jwt.claim.sub + DELETE attempt + GET DIAGNOSTICS
ROW_COUNT + ASSERT row_count = 0). The docs follow seeding.md's
section structure (Prerequisites + numbered Step blocks + Pre-launch
checklist + Operating notes).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Adversarial probe + moderation docs | rls_matrix.sql probe + moderation.md + moderation-log.md skeleton | Probe assertion syntax must mirror F-01's pattern exactly (else `db reset` fails on a typo) |
| 2. Final verification + MVP close-out | Full moderation flow verified; roadmap.md flipped to S-03 done; MVP-complete note | No real risk — close-out is mostly mechanical |

**Prerequisites**: F-01 RLS posture (done at `4228222` and prior),
S-02 messages flowing (done at `a97eef8`). Local Supabase stack
running for `db reset` verification + Studio access. Operator account
in `auth.users` (seed-operator from F-01's seed.sql works locally).

**Estimated effort**: 1 session, < 2 hours. Mostly content writing
(moderation.md is the longest single file at ~5-8 sections); SQL
probe is ~15 lines mirroring F-01's pattern; changelog skeleton is
~20 lines.

## Open Risks & Assumptions

- Audit log integrity depends on operator discipline — if they forget
  to append after DELETE, there is no technical trail beyond the gap
  in message IDs. Acceptable for v1; revisit if multi-operator setup
  ever ships.
- Adversarial test relies entirely on the SQL probe (`rls_matrix.sql`).
  Dropped the in-browser DevTools test per plan-review F2 — the S-02
  chat island doesn't expose a window debug handle, and the SQL probe
  already covers the same assertion path. Operators can re-run the
  probe outside `db reset` via `docker exec ... psql -f
  supabase/tests/rls_matrix.sql` (documented in moderation.md).
- Deletion is irreversible (no soft delete); operator mistakes require
  apology via a follow-up seeded message, not undo. Documented in
  Operating Notes.

## Success Criteria (Summary)

- Regression-proof RLS assertion: `db reset` exits 0 with the new probe
  asserting no peer can DELETE.
- Operator can perform a moderation deletion in production using only
  Studio SQL + the new moderation.md as guide; the deletion lands in
  moderation-log.md per the documented column convention.
- MVP closure: F-01 + S-01 + S-02 + S-03 all `implemented`; roadmap.md
  reflects the four-slice MVP completion.
