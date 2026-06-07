# Grading & answer-matching integration tests (test-plan Phase 2) — Implementation Plan

## Overview

Add **integration tests against the local Supabase stack** that pin two correctness invariants of the Unstuck quiz/answer-matching platform, exercising the real GoTrue→PostgREST JWT path and the `SECURITY DEFINER` functions directly:

- **R3** — quiz grading (`submit_test_attempt`): all-or-nothing sorted-set equality, single==multi exact match, zero-correct guard, cross-question/foreign option ids filtered, score rounding + pass threshold, and what gets **persisted** (`test_attempts` + `attempt_answers`).
- **R5** — answer-matching: (a) `match_lesson_answers` never returns a row from another course (even when one ranks higher), and the threshold/exclude filters hold; (b) `set_message_embedding` changes only `embedding`, only when NULL, only the target row.

These tests characterize **already-correct** definer-function behavior; their job is regression-pinning. No production code, migrations, or RLS changes — test code + fixture extensions only. Reuses the Phase 1 harness wholesale.

## Current State Analysis

- **Grading (R3):** `submit_test_attempt` is a definer fn ([`supabase/migrations/20260606170000_tests_schema.sql:138-191`](../../../supabase/migrations/20260606170000_tests_schema.sql)) implementing the source-stated all-or-nothing rule (archive `learning-loop` plan.md:42,65). Selected ids are filtered to the question; `v_selected = v_correct` is a sorted-set equality; a zero-correct question can never be correct; `score = round(correct/total, 4)`; `passed = score >= pass_threshold`. Seed test `f1…001` (threshold 0.50): Q1 single `{f3…001}`, Q2 multi `{f3…004,005}` ([`supabase/seed.sql:207-226`](../../../supabase/seed.sql)).
- **Match isolation (R5a):** `match_lesson_answers` ([`supabase/migrations/20260607130000_message_embeddings.sql:65-89`](../../../supabase/migrations/20260607130000_message_embeddings.sql)) fences on `has_course_access(p_course_id) AND l.course_id = p_course_id` **before** ranking, then filters by `embedding is not null`, `exclude_message_id`, `exclude_author`, `char_length(body)>=40`, `similarity >= p_match_threshold`. Crafted `vector(768)` literals exercise it without Workers AI.
- **Embedding immutability (R5b):** `set_message_embedding` ([`message_embeddings.sql:107-112`](../../../supabase/migrations/20260607130000_message_embeddings.sql)) = `update messages set embedding = p_embedding where id = p_message_id and embedding is null`. `messages` has no UPDATE/DELETE policy; this definer fn is the only mutation path. **F1 caveat** (archive `ai-answer-matching` impl-review): granted to `authenticated` with no per-call access gate — so cross-course *write*-denial is NOT guaranteed today; assert only column-scope/null-only/single-row.
- **SRS (deferred):** `grade_question` is read-only; FSRS scheduling lives in Astro handlers, not definer fns → not a clean integration target. Out of scope for Phase 2 (see "What We're NOT Doing").
- **Harness:** Phase 1 shipped `tests/integration/` — `setup/{supabase-env,clients,fixtures}.ts`, the vitest `integration` project, `npm run test:integration`, per-run fixtures + cascade cleanup, prove-it-fails discipline. Full grounding: `context/changes/testing-grading-srs-integration/research.md`.

## Desired End State

- `npm run test:integration` proves R3 + R5; `npm run test`/CI stay unit-only and hermetic.
- Each risk test has been **proven able to fail** (break → red → revert).
- `test-plan.md` §6 has a concrete Phase-2 cookbook entry (grading oracle + crafted-vector recipe); §3 Phase 2 reads `complete`.

### Key Discoveries:

- Grading oracle is independent (hand-computed truth table), and the **zero-correct guard** needs a fixture question with all options `is_correct=false` — the seed has none.
- Match isolation is testable with **crafted vectors** (no Workers AI); the "trap" is a more-similar message in another course that must not leak.
- `messages.embedding` is typed `string | null` in `database.types.ts`; insert as a `"[f0,…,f767]"` literal. `match_lesson_answers`/`set_message_embedding` rpc vector args are typed `string`.
- F1: `set_message_embedding` has no per-call access gate — the test must NOT assert cross-course write-denial (would fail against correct current behavior).

## What We're NOT Doing

- **No SRS scheduling tests** (R2/SRS write-path) — `grade_question` is read-only; scheduling is in Astro handlers. FSRS math is unit-tested (`src/lib/srs.test.ts`); `srs_*` own-only RLS is covered by Phase 1's `idor.itest.ts`. The SRS write-path (enrol branch, session→user_id, due-advances) is **deferred to Phase 3 (hermetic)**.
- No assertion of cross-course *write*-denial for `set_message_embedding` (deferred F1 gap; tracked in roadmap `## Blocked`).
- No production/migration/RLS/definer changes; no `pg` dep; no Stryker; no CI wiring (Phase 4).
- No Workers AI calls / real embedding generation — crafted vectors only.
- No new committed seed data — fixtures are runtime-created and cleaned up.

## Implementation Approach

Layered per-risk, mirroring Phase 1: extend the shared fixture builder first (Phase 1 here), then one phase per risk (R3 grading → R5a match → R5b immutability), each a self-contained `*.itest.ts` depending only on the shared helpers, then a close-out phase (cookbook + status sync). Each risk phase ends with a **prove-it-fails** step (break the invariant, confirm red, revert) to guard against vacuous green on already-correct code.

## Critical Implementation Details

- **Vector seam:** the RPCs take `vector(768)` args; tests build a `number[768]`, `JSON.stringify` → `"[…]"`, and pass it directly — skipping `embedText`/Workers AI entirely. For controlled cosine, use near-axis vectors (query ≈ `e1`; trap ≈ `e1`; courseA message = a mix of `e1`/`e2` above threshold). `match_lesson_answers` computes `1 - (embedding <=> query)`, so normalization isn't required.
- **char_length ≥ 40:** every embedded fixture message `body` must be ≥ 40 chars or `match_lesson_answers` silently drops it — a fixture footgun.
- **Drive `set_message_embedding` as a plain authenticated user** (the grant allows it; the operator check lives only in the API route, not the SQL).
- **F1 boundary:** the R5(b) test asserts column-scope/null-only/single-row ONLY. Do not add a cross-course write-denial assertion — that gate does not exist today.

## Phase 1: Fixture extensions

### Overview

Extend the shared fixture builder with the data Phase 2's risk tests need, without disturbing the Phase 1 fixtures or the unit run.

### Changes Required:

#### 1. Vector helper + fixture extensions

**File**: `tests/integration/setup/fixtures.ts`

**Intent**: Add the fixture data the three risk phases consume, and a helper to build crafted embedding literals. Keep `createRunFixture`'s existing return shape additive (new optional fields), and keep cleanup correct via the existing course/user cascade.

**Contract**: Add to the `RunFixture` (and its builder), all namespaced by `runId`:
- **R3:** a zero-correct question on the existing gated test (a question whose 2 options are both `is_correct=false`) → expose `zeroCorrectQuestionId` + its option ids. (Grading's main truth table uses the seed test `f1…001`, referenced by constant in the grading test — no fixture needed for that part.)
- **R5(a):** a **second free course** (`is_free=true`) with a chapter + lesson + one embedded message ("courseA message", `body` ≥ 40 chars, embedding moderately close to a known query vector); and in a **third** free course (or the existing gated/second course's *other* lesson — must be a different `course_id`) a "trap" message embedded **more** similar to the query. Expose the two course ids, lesson ids, message ids, and the canonical query vector.
- **R5(b):** in a free course the test user can access, one message with `embedding NULL` (`unembeddedMessageId`) and one with a pre-set embedding (`embeddedMessageId`), both `body` ≥ 40.
- A `vec768(spec)` helper returning a `"[…]"` string literal (768 floats) with a few dims set for controlled cosine.

Cleanup: the new courses are deleted by id (cascade their lessons/messages); messages on those fixture lessons cascade with the course — no seed-lesson orphan risk (unlike Phase 1 role-matrix). Confirm `cleanup` removes every new course id.

### Success Criteria:

#### Automated Verification:

- Unit run unchanged: `npm run test`
- Existing integration suite still green with the extended fixtures: `npm run test:integration`
- Type check + lint pass: `npx tsc --noEmit` && `npm run lint`

#### Manual Verification:

- The extended `createRunFixture` leaves no residue after a run (spot-check: no leftover `itest-*` courses for this runId via the service client).

**Implementation Note**: Pause for manual confirmation before Phase 2.

---

## Phase 2: R3 — grading correctness

### Overview

Prove `submit_test_attempt` grades against the independent truth table and persists the right rows.

### Changes Required:

#### 1. Grading test

**File**: `tests/integration/grading.itest.ts`

**Intent**: Assert the grading oracle for the seed test across all branches, plus the zero-correct guard, plus persistence.

**Contract**: As an `authedClientFor` learner (seed course is free → access granted), call `rpc('submit_test_attempt', { p_test_id, p_answers })` for the seed test `f1…001` across the truth table:
- (a) both correct → score 1.0, passed true; (b) Q2 partial → 0.5, true; (c) Q2 superset (all 3) → 0.5, true; (d) empty → 0.0, false; (e) foreign id for Q1 (submit a Q2 option for Q1) → Q1 false, 0.5, true; (f) only Q1 → 0.5, true.
- For each: assert the RPC return (`score`, `passed`, `perQuestion[].isCorrect`) AND the **persisted** rows — `test_attempts.score/passed` for this attempt and the `attempt_answers` per-question `is_correct` + filtered `selected_option_ids` (read back as the learner; RLS own-only).
- **Zero-correct guard:** using the fixture's `zeroCorrectQuestionId` test, submit the (empty and non-empty) selection → the question is never correct.
- Assert order-independence at least once (submit Q2 as `[005,004]` → still correct).

#### 2. Prove-it-fails check (manual, reverted)

**Intent**: Confirm the truth-table assertions are not vacuous.

**Contract**: Temporarily invert one expected score (e.g. expect case (b) to be 1.0) → confirm red → revert. (Test-value inversion; no DB mutation needed.)

### Success Criteria:

#### Automated Verification:

- R3 test passes: `npm run test:integration -- grading`
- Type check + lint pass.

#### Manual Verification:

- Prove-it-fails performed: inverting a truth-table expectation flips the case red; revert restores green.

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: R5(a) — answer-match cross-course isolation

### Overview

Prove `match_lesson_answers` returns only the target course's rows and honors the threshold/exclude filters.

### Changes Required:

#### 1. Match-isolation test

**File**: `tests/integration/match-isolation.itest.ts`

**Intent**: Pin the cross-course fence and the high-value filters a regression would silently break.

**Contract**: As an authed learner, with the fixture's two embedded messages (courseA moderately similar; trap in another course more similar):
- **Trap:** `rpc('match_lesson_answers', { p_course_id: courseA, p_query_embedding: query, p_exclude_author: <nil/other>, p_exclude_message_id: <nil>, p_match_threshold: <below courseA sim>, p_match_count: 5 })` → returns courseA's message, **never** the trap, despite the trap's higher similarity.
- **Enrolled/other-course control:** `match(courseB/trapCourse, query)` returns the trap message (proves the fence isn't accidentally always-empty).
- **Threshold floor:** a `p_match_threshold` above courseA's similarity → `[]`.
- **exclude_message_id:** excluding courseA's message id → it's dropped from results.
- **exclude_author:** excluding courseA's message author → it's dropped.

#### 2. Prove-it-fails check (manual, reverted)

**Intent**: Confirm the isolation assertion is real.

**Contract**: Temporarily call `match` with `p_course_id` = the trap's course (or assert the trap id is returned for courseA) → confirm the cross-course assertion flips → revert.

### Success Criteria:

#### Automated Verification:

- R5(a) test passes: `npm run test:integration -- match-isolation`
- Type check + lint pass.

#### Manual Verification:

- Prove-it-fails performed: the cross-course leak assertion flips red when inverted; revert restores green.

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: R5(b) — embedding immutability

### Overview

Prove `set_message_embedding` is column-scoped, null-only, and single-row — exactly what the SQL guarantees today (not the deferred F1 gate).

### Changes Required:

#### 1. Embedding-immutability test

**File**: `tests/integration/embedding-immutability.itest.ts`

**Intent**: Pin the three-part immutability invariant via before/after snapshots.

**Contract**: As an authed learner (grant allows it):
- **Column-scope + null→set:** snapshot the `unembeddedMessageId` row (`body`, `author_id`, `is_seeded`, `lesson_id`, `created_at`, `embedding`=null) via the service client; call `rpc('set_message_embedding', { p_message_id, p_embedding: vec1 })`; re-read → `embedding` = vec1, every other column unchanged.
- **Null-only (no overwrite):** call `set_message_embedding(unembeddedMessageId, vec2)` on the now-set row → re-read → still vec1 (no-op; RPC returns void, verify via SELECT).
- **Single-row:** the pre-set `embeddedMessageId` and any sibling NULL message are unaffected by the above calls.

#### 2. Prove-it-fails check (manual, reverted)

**Intent**: Confirm the immutability assertion is real.

**Contract**: Temporarily expect `embedding` to become vec2 after the second call (i.e. expect an overwrite) → confirm red → revert.

### Success Criteria:

#### Automated Verification:

- R5(b) test passes: `npm run test:integration -- embedding-immutability`
- Full integration suite green: `npm run test:integration`
- Type check + lint pass.

#### Manual Verification:

- Prove-it-fails performed: expecting an overwrite flips red; revert restores green.

**Implementation Note**: Pause for manual confirmation before Phase 5.

---

## Phase 5: Cookbook & close-out

### Overview

Capture the Phase-2 recipes and sync rollout state.

### Changes Required:

#### 1. Cookbook entry

**File**: `context/foundation/test-plan.md` (§6)

**Intent**: Fill the Phase-2 TBD with reusable recipes: the grading truth-table oracle pattern and the crafted-vector recipe for match/embedding tests (char_length≥40 footgun, vector literal format, F1 boundary).

**Contract**: Replace the "Integration: definer-fn grading oracle — TBD (Phase 2)" bullet with the concrete recipe; point to the new `*.itest.ts` files.

#### 2. Rollout status sync

**File**: `context/foundation/test-plan.md` (§3 table)

**Intent**: Reflect that Phase 2 shipped.

**Contract**: Set §3 Phase-2 Status cell to `complete`. (change.md → `implemented` via the implement epilogue.)

### Success Criteria:

#### Automated Verification:

- Full integration suite green: `npm run test:integration`
- Unit run + lint green: `npm run test` && `npm run lint`

#### Manual Verification:

- §6 cookbook entry is concrete enough for Phase 3 to reuse the crafted-vector/oracle patterns without re-reading test source.

**Implementation Note**: Final phase — after automated verification, pause for manual confirmation, then the implement epilogue closes the change.

---

## Testing Strategy

### Integration Tests (the deliverable):

- `grading.itest.ts` — R3 truth table + zero-correct + persistence.
- `match-isolation.itest.ts` — R5(a) cross-course trap + threshold + exclude filters.
- `embedding-immutability.itest.ts` — R5(b) column-scope/null-only/single-row.

### Oracle rule:

Grading asserts a hand-computed truth table; match isolation asserts "target course only, even when another ranks higher"; immutability asserts a before/after column snapshot. None re-read a value through the path under test. Each risk test is proven able to fail.

### What stays out:

SRS scheduling (Phase 3 hermetic), cross-course embedding write-denial (deferred F1).

## Performance Considerations

I/O-bound against local Postgres; keep crafted vectors minimal (set a handful of dims, zero the rest) and fixtures small. Cleanup per-run via course/user cascade.

## Migration Notes

No DB migrations. Fixtures runtime-created + cleaned up; never `supabase db reset` ([[feedback-no-db-reset]]).

## References

- Research: `context/changes/testing-grading-srs-integration/research.md`
- Phase 1 harness: `context/archive/2026-06-07-testing-access-control-rls/` + `tests/integration/setup/`
- Grading oracle: `context/archive/2026-06-06-learning-loop/`
- R5 oracle + F1: `context/archive/2026-06-07-ai-answer-matching/`
- Rollout: `context/foundation/test-plan.md` (§2 R3/R5, §3 Phase 2, §6 cookbook)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Fixture extensions

#### Automated

- [x] 1.1 Unit run unchanged: `npm run test` — c7ddedb
- [x] 1.2 Existing integration suite green with extended fixtures: `npm run test:integration` — c7ddedb
- [x] 1.3 Type check + lint pass — c7ddedb

#### Manual

- [x] 1.4 Extended createRunFixture leaves no residue after a run — c7ddedb

### Phase 2: R3 — grading correctness

#### Automated

- [x] 2.1 R3 test passes: `npm run test:integration -- grading`
- [x] 2.2 Type check + lint pass

#### Manual

- [x] 2.3 Prove-it-fails: inverting a truth-table expectation flips red; revert restores green

### Phase 3: R5(a) — answer-match cross-course isolation

#### Automated

- [ ] 3.1 R5(a) test passes: `npm run test:integration -- match-isolation`
- [ ] 3.2 Type check + lint pass

#### Manual

- [ ] 3.3 Prove-it-fails: cross-course leak assertion flips red when inverted; revert restores green

### Phase 4: R5(b) — embedding immutability

#### Automated

- [ ] 4.1 R5(b) test passes: `npm run test:integration -- embedding-immutability`
- [ ] 4.2 Full integration suite green: `npm run test:integration`
- [ ] 4.3 Type check + lint pass

#### Manual

- [ ] 4.4 Prove-it-fails: expecting an overwrite flips red; revert restores green

### Phase 5: Cookbook & close-out

#### Automated

- [ ] 5.1 Full integration suite green: `npm run test:integration`
- [ ] 5.2 Unit run + lint green: `npm run test` && `npm run lint`

#### Manual

- [ ] 5.3 §6 cookbook entry is concrete enough for Phase 3 to reuse the patterns
