# Operator Message Moderation (S-03) — Implementation Plan

## Overview

S-03 is the final MVP slice. It delivers the operator-side capability to delete
any message in any lesson chat (PRD FR-007) without an in-product moderation UI.
The heavy lifting was already done by F-01 — RLS has no DELETE policy for the
`authenticated` role, so peers cannot delete anything via the application
session; `service_role` (Studio SQL editor's default) bypasses all policies and
can delete freely. What this slice adds: a regression-proof assertion that the
RLS posture holds, an operator-facing workflow guide, and an append-only manual
changelog convention so operator deletions leave a trail.

No schema migrations. No app code changes. Hard delete via `service_role`
(`UPDATE messages SET deleted_at = now()` was considered and rejected — see
Key Decisions in plan-brief). Once S-03 ships, F-01 + S-01 + S-02 + S-03 = MVP
complete.

## Current State Analysis

**F-01 (DONE) gives the policy posture S-03 leans on**:
- [supabase/migrations/20260528140054_lesson_chat_rls.sql:75](supabase/migrations/20260528140054_lesson_chat_rls.sql#L75)
  comment: "No UPDATE policy → messages are immutable to learners (a 'delete
  and repost' mental model). No DELETE policy → only the operator removes
  content, via service_role out-of-band (FR-007)."
- `messages` table has explicit policies for SELECT (gated by
  `has_course_access`) and INSERT (peer-own-non-seed). Zero DELETE or
  UPDATE policies for `authenticated`. RLS is `enabled + force` so even
  the table owner is subject to it.
- `service_role` bypasses RLS by design (Supabase Studio SQL editor uses
  this role; CLI `psql` via the connection string in `npx supabase
  status` also uses it).
- `messages` is in the `supabase_realtime` publication. Realtime
  postgres_changes fires `DELETE` events to subscribers — but our S-02
  ChatPanel/useChatMessages only listens for `INSERT`, so a delete won't
  live-disappear from open lesson panels. (Acceptable for moderation
  cadence — see "What We're NOT Doing".)

**F-01's RLS assertion infrastructure exists** at
[supabase/tests/rls_matrix.sql](supabase/tests/rls_matrix.sql) (277 lines).
The file uses a probe-and-assert pattern: each policy gets a smoke test
that exercises it via `SET LOCAL ROLE` + a deliberate query, asserting
either success (row count matches expectation) or RLS-denied silence (0
rows returned for the wrong role). S-03 extends this file with one more
probe block covering DELETE denial.

**S-02 (DONE) gives the operator user base**:
- Operator account in `auth.users` is the same one used for seeding
  (per docs/operator/seeding.md). No new auth setup needed.
- `docs/operator/seeding.md` already includes Step 4 "Update or delete a
  seed" with SQL examples — partial overlap with moderation. New
  moderation.md cross-links to seeding.md rather than duplicating.

**Realtime chat panel**:
- S-02 [src/components/chat/useChatMessages.ts:158-178](src/components/chat/useChatMessages.ts#L158-L178)
  subscribes to `postgres_changes` events of type `INSERT` only. A
  service_role DELETE will not propagate to open chat panels live. The
  message disappears only on next hard-reload or when reconnect refetch
  runs. For moderation (rare, operator-initiated), this is acceptable;
  the cost of adding a DELETE handler to S-02 is real (state mutation
  during render, removed-message UX decisions) and out of MVP scope.

### Key Discoveries

- **Realtime DELETE delivery is automatic at the DB layer.** Subscribers
  who add a DELETE handler get the events for free — F-01's publication
  membership doesn't filter by event type. The bottleneck is purely
  client-side: ChatPanel has no DELETE handler in S-02. We defer that
  handler (see Non-Goals); peers see deletions on next reload.
- **RLS probe pattern** (canonical F-01 form, verified at
  [supabase/tests/rls_matrix.sql:126](supabase/tests/rls_matrix.sql#L126) +
  [:216](supabase/tests/rls_matrix.sql#L216)):
  ```sql
  reset role;
  set local request.jwt.claims to '{"sub":"<uuid>","role":"authenticated"}';
  set local role authenticated;
  DELETE FROM public.messages WHERE id = '<uuid>';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception '...' end if;
  ```
  Use `request.jwt.claims` (plural, full JSON blob) — NOT `request.jwt.claim.sub`
  (sub-key). With the sub-key form, `auth.uid()` returns NULL inside the
  probe, the DELETE silently denies for the wrong reason, and the assertion
  passes for a fake reason. F-01 also `reset role;` before each switch
  to prevent role-state leak across probes.
- **Operator account UUID** for the local seed: `c0000000-0000-0000-0000-000000000001`
  (`seed-operator@unstuck.local`); for production, the operator looks up
  via the SQL in seeding.md Step 1.
- **PRD FR-007 + Non-Goals are binding**: "operator can delete any
  message" + "no in-product moderation interface". Soft-delete with UI
  filter would technically respect Non-Goals (no admin UI surfaces it
  to learners) but adds the `deleted_at` column + RLS rewrite + chat
  filter + Realtime retest — all work F-01's posture was designed to
  avoid. Hard delete matches the "out-of-band content management"
  language literally.
- **Audit log is operator discipline, not technical enforcement**. A
  manual append-only markdown changelog (`docs/operator/moderation-log.md`)
  carries the audit. Operator runs DELETE, then immediately appends a
  row. If they forget, there is no technical trace beyond the gap in
  message IDs. Acceptable for v1 (single operator, ~100 users); a real
  audit table is post-MVP.

## Desired End State

A regression-proof RLS assertion that authenticated learners cannot
DELETE any message exists in `supabase/tests/rls_matrix.sql` and passes
every `npx supabase db reset`. The operator has a markdown guide
(`docs/operator/moderation.md`) explaining how to delete a message via
Studio SQL editor, what to delete (lightweight 3-5 criterion rubric),
and how to log each deletion in the append-only
`docs/operator/moderation-log.md` changelog. The RLS posture that makes
peer DELETE impossible is regression-proofed by the assertion in
`rls_matrix.sql` (which runs on every `db reset` against authenticated
JWTs of both seed users).

### How we verify the end state

- `npx supabase db reset` succeeds; the new probe in `rls_matrix.sql`
  asserts: `authenticated` role DELETE on a peer message AND on an
  operator-seeded message both return `row_count = 0` (RLS denies
  silently).
- Studio (or Docker psql) executes `DELETE FROM public.messages WHERE
  id = '<peer-msg-uuid>'` as service_role → row removed; next page
  reload on the lesson shows the message gone.
- `docs/operator/moderation.md` renders cleanly in IDE/GitHub preview.
- `docs/operator/moderation-log.md` exists with the documented columns
  and one sample row.

## What We're NOT Doing

- **No `deleted_at` soft-delete column.** Hard delete via service_role,
  matches PRD literal + F-01 posture. Rejected because it'd require
  schema migration + RLS SELECT rewrite (filter `WHERE deleted_at IS
  NULL`) + chat panel filter + Realtime retest — out of "smallest
  slice" scope.
- **No `moderation_events` audit table.** Docs-only manual changelog
  (`moderation-log.md`). Rejected because: migration + trigger + RLS
  on new table is real work; operator discipline is acceptable at v1
  scale (single operator, ~100 users). Revisit when scale demands.
- **No DELETE event listener in ChatPanel.** S-02 subscribes only to
  `INSERT` events. After moderation, peers see the gap on next reload
  or reconnect. Live disappearance would require S-02 hook surgery
  (DELETE handler, removed-message UX, scroll discipline interaction)
  for a rare event — explicit defer to post-MVP.
- **No in-product moderation UI.** PRD Non-Goal — operator works
  exclusively via Studio SQL editor or psql.
- **No peer self-deletion.** RLS denies (no DELETE policy for
  authenticated); PRD doesn't call for it; adding peer-own-delete
  would require a new RLS policy + UI affordance + edit/delete UX
  considerations. Out of MVP.
- **No bulk delete tooling.** Operator runs multi-row DELETE in Studio
  if needed; no helper script. PRD "out-of-band content management"
  covers this implicitly.
- **No automated notification to deleted-message authors.** Author sees
  silence — message is gone, no "your post was removed by moderator"
  notification. Out of MVP (would require notifications subsystem).
- **No schema migration.** S-03 adds zero new tables, columns, or
  policies. The only DB-adjacent change is one assertion block appended
  to `supabase/tests/rls_matrix.sql`, which is a local-dev assertion
  file (not a migration).
- **No tests beyond the SQL assertion + manual.** No JS unit tests; no
  framework configured in the repo.

## Implementation Approach

S-03 is two coordinated changes:

1. **One SQL assertion block** appended to `supabase/tests/rls_matrix.sql`
   — proves the F-01 RLS posture forbids `authenticated` DELETE on
   `messages`. This is the regression-proof bit; runs on every `db reset`.

2. **Two markdown files** in `docs/operator/`:
   - `moderation.md` — the operator workflow guide: prereqs, find-message
     SQL, hard-delete SQL recipe, lightweight rubric (3-5 criteria),
     pre-flight checklist, cross-link to seeding.md and the log.
   - `moderation-log.md` — the append-only changelog skeleton: header,
     column convention (date, lesson_slug, message_id_or_uuid,
     body_excerpt, reason), one sample row.

No app code changes. No new dependencies. No new tables.

## Phase 1: Adversarial RLS probe + moderation docs

### Overview

Land all three artifacts (one SQL assertion + two operator docs) in a
single coherent phase. The assertion regression-proofs F-01's posture;
the docs give the operator the workflow needed to actually use that
posture. All three are tightly related — one ships incomplete if any of
them is missing.

### Changes Required

#### 1. Adversarial RLS probe — authenticated DELETE denial

**File**: `supabase/tests/rls_matrix.sql`

**Intent**: Append one probe block at the end of the file that asserts
F-01's no-DELETE-policy posture: a query running as `authenticated` with
the seed-peer's JWT cannot DELETE any message (own or otherwise). Without
this probe, a future schema change that accidentally adds a peer-DELETE
policy would silently regress the moderation invariant.

**Contract**: A new section following the file's existing pattern (see
the SELECT/INSERT probes at lines 124–146 + 214–236 + 240–267 of
`rls_matrix.sql`). The probe must:

- `reset role;` (clear any leaked role state from prior probes).
- Set the JWT claims via the **JSON-blob GUC** (`request.jwt.claims`,
  plural — NOT `request.jwt.claim.sub`):
  `set local request.jwt.claims to '{"sub":"c0000000-0000-0000-0000-000000000002","role":"authenticated"}';`
  This is the form Supabase reads — `auth.uid()` parses `sub` out of
  the JSON. The sub-key form (`request.jwt.claim.sub`) yields
  `auth.uid() = NULL` inside the probe, making the assertion silently
  pass without ever testing the authenticated path (plan-review F1).
- `set local role authenticated;`
- Attempt `DELETE FROM public.messages WHERE id = 'd0000000-0000-0000-0000-000000000002'`
  (the F-01 seed peer message — peer trying to delete own message).
- Capture `row_count` via `get diagnostics affected = row_count;`.
- Assert `affected = 0` via `if affected <> 0 then raise exception ...`.
- `reset role;` again before the next sub-probe.
- Repeat for `DELETE FROM public.messages WHERE id = 'd0000000-...-001'`
  (the F-01 seed operator message — peer trying to delete operator's
  content; must also fail).

A short comment block above the probe explaining the FR-007 invariant
the assertion protects (one paragraph max).

#### 2. Operator moderation guide

**File**: `docs/operator/moderation.md` (new)

**Intent**: Operator-facing markdown guide for deleting messages from
production lesson chats. Same audience and structure as seeding.md (one
human reading it once before launch). Covers prereqs, locate-by-content,
DELETE SQL, the deletion rubric, pre-flight checklist, and how to log
each deletion in the changelog.

**Contract**: Sections in order:

1. **Prerequisites** — same Studio service_role assumption as seeding.md;
   one-line link back to seeding.md for the env setup if unread.
2. **Step 1 — Locate the message** — SQL to find a message by content
   substring or by recent-on-a-lesson, returning `id`, `lesson`,
   `author_email`, `body`, `created_at`. Two queries (by content, by
   lesson + recency).
3. **Step 2 — Capture the audit row BEFORE deleting** — operator copies
   the row's UUID + body excerpt + lesson slug into clipboard or scratch
   before running DELETE. Reason: once deleted, the body is gone (no
   audit table per Key Decisions).
4. **Step 3 — Delete the message** — single SQL:
   ```sql
   DELETE FROM public.messages WHERE id = '<message-uuid>' RETURNING id, body;
   ```
   Note: `RETURNING` confirms the row that just vanished and gives the
   operator the body text for the log even if they didn't capture it in
   Step 2 (defense in depth).
5. **Step 4 — Append to the moderation log** — point to
   `moderation-log.md`; show the row template; remind to commit the doc.
6. **Deletion rubric** — 3-5 criteria with the
   "delete vs keep" framing. Sample content (implementer can tighten):

   **Delete**:
   - Targeted personal attack (slurs, threats, doxxing).
   - Illegal content (CSAM, copyright dump, etc.).
   - Off-topic by full content (spam, unrelated marketing, etc.).

   **Keep** (even if uncomfortable):
   - Frustration expressed on-topic ("this lesson is confusing because…").
   - Misframed question (operator can clarify in a follow-up seed
     rather than delete).
   - Cynicism without personal attack.

7. **Pre-launch readiness checklist** — short list (modeled on
   seeding.md's pre-launch checklist): confirm operator account exists,
   confirm `moderation-log.md` is committed and accessible, run the
   adversarial test once locally to confirm the RLS posture, decide who
   has the service_role key.
8. **Operating notes** — irreversibility warning, "what to do if you
   delete the wrong message" (apologize via a seeded message; nothing
   to undo), recommended cadence (review chat weekly, not in
   the-moment). Plus one note: "**Regression-proof of the no-peer-DELETE
   posture** is the SQL probe in `supabase/tests/rls_matrix.sql`
   (added by S-03). It runs on every `npx supabase db reset` and
   asserts authenticated DELETE returns 0 rows for both peer and
   operator-seeded messages. To re-verify manually outside of `db
   reset`, the operator can run the probe block via `docker exec
   supabase_db_<project> psql -U postgres -d postgres -f supabase/tests/rls_matrix.sql`."

Cross-links to `seeding.md` (for prereqs + Studio orientation) and to
`moderation-log.md` (for the changelog).

#### 3. Moderation changelog skeleton

**File**: `docs/operator/moderation-log.md` (new)

**Intent**: Append-only markdown log carrying every operator deletion.
This is the audit trail. Operator writes one row per DELETE,
immediately after running the SQL. Lives in git; commits are the
audit's persistence layer.

**Contract**: File structure:

- Title + one-paragraph intro explaining the file's role (audit trail
  for operator deletions; append-only; commit each entry).
- Column convention (markdown table):
  `| date_utc | lesson | message_id | body_excerpt | reason | operator |`
  - `date_utc` — ISO date, e.g. `2026-06-01`
  - `lesson` — `course_slug/lesson_slug`
  - `message_id` — UUID of the deleted message
  - `body_excerpt` — first 80 chars of body, ellipsis if longer
  - `reason` — one of the rubric criteria, plus a 1-line note
  - `operator` — operator's email (or initials if shared in future)
- One sample row to anchor the format (clearly marked as `sample` so
  it's obviously not a real deletion event).
- Closing note: "Append rows here, do not edit or delete past entries.
  If a row was a mistake, add a corrective row noting the error."

### Success Criteria

#### Automated Verification

- `npx supabase db reset` applies cleanly; the new probe block in
  `rls_matrix.sql` asserts authenticated DELETE returns 0 rows
  (file completes without `RAISE EXCEPTION`).
- `npm run lint` exits 0 (no app code touched; this should be a no-op).
- `npm run build` exits 0 (no app code touched; no-op).
- `npx astro check` exits 0 (no app code touched; no-op).

#### Manual Verification

- `docs/operator/moderation.md` renders cleanly in IDE/GitHub preview;
  SQL blocks syntax-highlighted; cross-links resolve.
- `docs/operator/moderation-log.md` exists with the sample row and the
  column convention is unambiguous.
- Operator-flow verify: in Studio SQL editor, run the locate-message
  query → copy ID → run DELETE → confirm row gone via re-query.
  Then reload the lesson page (the message should be absent from the
  initial fetch; live disappearance is out of scope per Non-Goals).

**Implementation Note**: After all automated verification passes and the
manual rubric + cross-links read clean, pause for manual confirmation
before proceeding to Phase 2.

---

## Phase 2: Final verification + MVP close-out

### Overview

S-03 is the final MVP slice. This phase verifies the moderation flow
end-to-end against the local stack and confirms the four-slice MVP
(F-01 + S-01 + S-02 + S-03) is shippable. No file changes — purely
verification + close-out commit.

### Changes Required

#### 1. Final end-to-end verification

**Files**: none (verification step)

**Intent**: Run the full moderation flow on the local stack as if you
were the operator, then re-verify F-01's adversarial test from
browser. Captures the close-out evidence.

**Contract**: Walk the verification steps under "How we verify the end
state" (Desired End State section). Each pass is recorded in a manual
verification row in Progress.

#### 2. Close out S-03 + MVP marker

**Files**: `context/changes/operator-message-moderation/change.md`,
`context/foundation/roadmap.md`

**Intent**: Mark S-03 as `implemented`; update roadmap's `## Done`
section (or status table) to reflect that all four MVP slices are
shipped. Surface MVP readiness in the roadmap as a one-line note.

**Contract**: 
- `change.md`: status flips from `implementing` → `implemented` via the
  epilogue commit ritual (standard /10x-implement flow). Updated date
  set to today.
- `context/foundation/roadmap.md`: change S-03's row in the "At a glance"
  table from `proposed` to `implemented` (or `done`, matching the
  existing pattern in the F-01 row). Optional: a brief one-line note
  under the table or in a `## Done` section: "MVP complete YYYY-MM-DD —
  all four slices shipped; deferred features tracked in
  `## Parked` for post-MVP review."

### Success Criteria

#### Automated Verification

- `npx supabase db reset` clean; probe asserts; lint + build + check
  all 0-exit.

#### Manual Verification

- Full moderation flow walked end-to-end on local stack (Phase 1's
  manual steps re-run as a connected sequence).
- `roadmap.md` reflects S-03 done + MVP-complete one-liner.
- `change.md` flipped to `implemented` after epilogue commit.

**Implementation Note**: This phase is the slice's exit gate AND the
MVP's exit gate. After manual verify + epilogue commit, the change is
ready for `/10x-archive` and the project moves to post-MVP backlog
review per the `ship-over-polish` memory note.

---

## Testing Strategy

Same posture as F-01 / S-01 / S-02: no test framework configured in the
repo. Verification stack:

- **SQL assertions** (`supabase/tests/rls_matrix.sql`) — the only
  automated regression-proof artifact for RLS posture. The S-03 probe
  joins the existing F-01 probes in the same file.
- **Static checks** — `npm run lint`, `npm run build`, `npx astro check`
  per phase (all no-ops for S-03 since no app code changes).
- **Manual** — browser + Studio walk-through per phase.

Introducing JS test framework (Vitest for utils, Playwright for e2e) is
captured as out-of-scope post-MVP follow-up.

## Performance Considerations

None applicable. S-03 ships only assertion SQL + markdown files. No
runtime overhead. The `rls_matrix.sql` file runs only on
`supabase db reset` (local-dev), not in production. Production deploy
is unaffected.

## Migration Notes

No production migrations. F-01 + S-02 covered all schema. S-03's only
DB-adjacent file is `supabase/tests/rls_matrix.sql` which is a local-dev
assertion artifact, not a migration. Production Supabase project is
untouched by this slice.

If operator moderation actions need to be replayed against the
production audit log later: they live in `docs/operator/moderation-log.md`
in git history — `git log -- docs/operator/moderation-log.md` gives a
chronological timeline of every moderation decision.

## References

- F-01 plan: [context/changes/lesson-chat-data-model/plan.md](context/changes/lesson-chat-data-model/plan.md)
- S-01 plan: [context/changes/lesson-workspace-shell/plan.md](context/changes/lesson-workspace-shell/plan.md)
- S-02 plan: [context/changes/lesson-scoped-chat/plan.md](context/changes/lesson-scoped-chat/plan.md)
- F-01 RLS migration (the posture S-03 protects):
  [supabase/migrations/20260528140054_lesson_chat_rls.sql:75](supabase/migrations/20260528140054_lesson_chat_rls.sql#L75)
- F-01 RLS assertion file (extension target):
  [supabase/tests/rls_matrix.sql](supabase/tests/rls_matrix.sql)
- Operator seeding guide (cross-link target):
  [docs/operator/seeding.md](docs/operator/seeding.md)
- Roadmap S-03 entry (close-out target):
  [context/foundation/roadmap.md#L90-L101](context/foundation/roadmap.md#L90-L101)
- PRD FR-007 + Non-Goals (no in-product moderation):
  [context/foundation/prd.md](context/foundation/prd.md)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Adversarial RLS probe + moderation docs

#### Automated

- [x] 1.1 `npx supabase db reset` clean; new rls_matrix.sql probe asserts
- [x] 1.2 `npm run lint` exits 0
- [x] 1.3 `npm run build` exits 0
- [x] 1.4 `npx astro check` exits 0

#### Manual

- [x] 1.5 `docs/operator/moderation.md` renders cleanly; SQL blocks highlighted; cross-links resolve
- [x] 1.6 `docs/operator/moderation-log.md` exists with sample row + column convention
- [x] 1.7 Operator-flow: Studio SQL DELETE removes message; reload shows it gone

### Phase 2: Final verification + MVP close-out

#### Automated

- [ ] 2.1 `npx supabase db reset` clean (probe still asserts)
- [ ] 2.2 `npm run lint` exits 0
- [ ] 2.3 `npm run build` exits 0
- [ ] 2.4 `npx astro check` exits 0

#### Manual

- [ ] 2.5 Full moderation flow walked end-to-end on local stack
- [ ] 2.6 `roadmap.md` reflects S-03 done + MVP-complete one-liner
- [ ] 2.7 `change.md.status: implemented` after epilogue commit
