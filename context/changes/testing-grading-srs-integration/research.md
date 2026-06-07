---
date: 2026-06-07T15:05:00+02:00
researcher: Lukasz Rdzanek
git_commit: cd995c8dfd13283328c91af1bb7509d74a781a17
branch: master
repository: Unstuck
topic: "Grading & SRS integration tests (test-plan Phase 2): R3 grading oracle, R5 match-isolation + embedding immutability, SRS scheduling scoping"
tags: [research, codebase, grading, submit_test_attempt, pgvector, match_lesson_answers, set_message_embedding, fsrs, integration-tests]
status: complete
last_updated: 2026-06-07
last_updated_by: Lukasz Rdzanek
---

# Research: Grading & SRS integration tests (test-plan Phase 2)

**Date**: 2026-06-07T15:05:00+02:00
**Researcher**: Lukasz Rdzanek
**Git Commit**: cd995c8dfd13283328c91af1bb7509d74a781a17
**Branch**: master
**Repository**: Unstuck

## Research Question

Ground rollout **Phase 2** of `context/foundation/test-plan.md` (change `testing-grading-srs-integration`), reusing the Phase 1 harness. Establish the **independent oracle** (product behavior, not the SQL) for:
- **R3** — quiz grading: `submit_test_attempt` all-or-nothing / sorted-set equality / single-vs-multi / zero-correct / cross-question option ids; what gets persisted.
- **R5** — `match_lesson_answers` cross-course isolation; `set_message_embedding` immutability (embedding-only, null-only).
- **R2** (attempts/SRS own-only) under the grading/SRS lens; plus what SRS scheduling can actually be integration-tested.

## Summary

Phase 2's clean integration targets are **R3 (grading)** and **R5 (match isolation + embedding immutability)** — both are `SECURITY DEFINER` functions the harness drives directly via the real JWT path. The grading contract faithfully implements the source-stated product rule (all-or-nothing exact-set match), so the oracle comes from the rule, not the code; a 6-row independent truth table against the seed quiz pins it. R5 has two precise invariants, with one important caveat carried over from the `ai-answer-matching` impl-review (F1): `set_message_embedding`'s SQL guarantees only column-scope + null-only + single-row — cross-course *write* protection is a deferred gap, so the test must assert only what the code promises today.

**Key scoping correction (changes the plan):** `grade_question` is **read-only** — it does *not* write `srs_question_state`. All FSRS scheduling lives in **Astro API route handlers** (`src/pages/api/{practice/[questionId]/grade,tests/[testId]/submit,reviews/[lessonId]/rate}.ts`) via `applyRating()` + a Supabase upsert, **not** in any definer function. The integration harness drives SQL/RLS directly and cannot invoke Astro handlers, so the SRS *scheduling write-path* is **not a clean Phase-2 integration target**. The FSRS math is already unit-tested (`src/lib/srs.test.ts`); the own-only RLS on `srs_*` is already covered by Phase 1's `idor.itest.ts`. Recommendation: **scope Phase 2 to R3 + R5**, and defer the SRS write-path (enrol-branch logic, session→user_id binding) to **Phase 3 (hermetic, stubbed client invoking the handler)** — or note it as e2e. This is a cost×signal call for `/10x-plan` to confirm.

## Detailed Findings

### R3 — Quiz grading (`submit_test_attempt`) — clean integration target

**Contract** ([`supabase/migrations/20260606170000_tests_schema.sql:138-191`](../../../supabase/migrations/20260606170000_tests_schema.sql)):
- `p_answers` shape: `{ "<questionId>": ["<optionId>", ...] }` (jsonb keyed by question id text), read per question via `p_answers -> r.id::text` defaulting to `'[]'`.
- **Selected ids are filtered to the question** (`tests_schema.sql:173-176`): any submitted id not belonging to that question is silently dropped before comparison — a foreign/cross-question id neither helps nor poisons.
- **All-or-nothing, sorted-set equality** (`:178` `v_selected = v_correct`, both built `array_agg(... order by o.id)`): order-independent exact-set match. **Single (`multi=false`) and multi use the identical rule** — the SQL never branches on `multi`.
- **Zero-correct guard** (`:178` `array_length(v_correct,1) is not null`): a question with no correct options is never correct (prevents `{} = {}` false positives).
- **Score** = `round(v_correct_n::numeric / v_total, 4)` (`:185`); `v_total = 0` → 0. **Passed** = `score >= pass_threshold` (`:186`, inclusive).
- **Persisted** (`:165,180,187`): exactly one `test_attempts` row (final `score`/`passed`) + one `attempt_answers` row per question (`is_correct`, **filtered** `selected_option_ids`) for `auth.uid()`. An attempt row is written even for an empty test (impl-review F3, deferred). Return: `{score, passed, perQuestion:[{questionId, isCorrect, correctOptionIds}]}`.
- Guards: `'unauthenticated'` / `'test_not_found'` / `'no_access'`.

**Source-grounded oracle (not the SQL)** — from `context/archive/2026-06-06-learning-loop/plan.md:42,65` + `plan-brief.md:23-25`: "selected option set equals the correct set exactly (compare as sets, server-side)", "No partial credit — multi-correct is all-or-nothing", "`passed = score >= pass_threshold`", "unlimited retakes, stored". impl-review.md:23 independently confirms the SQL matches the rule. The PRD predates quizzes (no quiz FRs there).

**Seed quiz** ([`supabase/seed.sql:207-226`](../../../supabase/seed.sql)): test `f1000000-…001` (threshold **0.50**); Q1 `f2…001` single, correct = `{f3…001}`; Q2 `f2…002` multi, correct = `{f3…004, f3…005}`.

**Independent truth table** (2 questions, threshold 0.50, `score = round(n/2, 4)`):

| Case | p_answers | Q1 | Q2 | score | passed |
|---|---|---|---|---|---|
| a both correct | `{Q1:[001], Q2:[004,005]}` | ✓ | ✓ | 1.0000 | true |
| b Q2 partial (one of two) | `{Q1:[001], Q2:[004]}` | ✓ | ✗ | 0.5000 | true |
| c Q2 superset (all 3) | `{Q1:[001], Q2:[004,005,006]}` | ✓ | ✗ | 0.5000 | true |
| d empty | `{}` | ✗ | ✗ | 0.0000 | false |
| e foreign id for Q1 | `{Q1:[004], Q2:[004,005]}` | ✗ (004 dropped) | ✓ | 0.5000 | true |
| f only Q1 | `{Q1:[001]}` | ✓ | ✗ | 0.5000 | true |

Edges a naive test misses: filtered-to-question ids (e), order-independent sets, single==multi exact-set, zero-correct guard (needs a fixture question with no correct option), `round(...,4)` precision, attempt-row-always-written. **Assert the persisted rows, not just the RPC return.**

### R5(a) — `match_lesson_answers` cross-course isolation — clean integration target

Body ([`supabase/migrations/20260607130000_message_embeddings.sql:65-89`](../../../supabase/migrations/20260607130000_message_embeddings.sql)). Course fence (`:75-76`): `public.has_course_access(p_course_id) and l.course_id = p_course_id`. Filters: `embedding is not null`, `m.id <> p_exclude_message_id` (NULL→none), `m.author_id is distinct from p_exclude_author` (NULL→none), `char_length(m.body) >= 40`, `similarity >= p_match_threshold`. Order: `(similarity + 0.05*is_seeded) desc`, `limit least(greatest(p_match_count,1),5)`.

**Invariant:** for any `p_course_id`, no returned row's lesson may belong to another course — **even when a message in another course is strictly more similar**. The fence is applied before ordering.

**Oracle / fixture (the "trap" test):** two **free** courses (default `is_free=true` → any authed user has access, no enrollment needed), a lesson + an embedded message (`body` length ≥ 40) in each. `msgB` (courseB) gets a vector **more** similar to the query than `msgA` (courseA). Call `match_lesson_answers(courseA, query, …)` → must return **only `msgA`**, never `msgB`. Control: `match_lesson_answers(courseB, query)` returns `msgB` (proves the fence isn't always-empty). Crafted vectors give controlled cosine (e.g. query = `e1`; `msgB ≈ e1`; `msgA` = mix of `e1`/`e2` above threshold) — **no Workers AI needed**; the RPC takes a `vector(768)` arg, the seam is `toVectorLiteral` ([`src/lib/embeddings.ts:45-47`](../../../src/lib/embeddings.ts), `JSON.stringify(vec)` → `"[…]"`).

### R5(b) — `set_message_embedding` immutability — clean integration target (with a caveat)

Body (`message_embeddings.sql:107-112`): `update public.messages set embedding = p_embedding where id = p_message_id and embedding is null;`. **Three-part invariant:** (1) only the `embedding` column is written; (2) only when it was NULL (already-set rows are a no-op); (3) only the target row. This is the *only* write path to a `messages` row — the table has SELECT+INSERT policies but **no UPDATE/DELETE policy** ([`20260528140054_lesson_chat_rls.sql:129-131`](../../../supabase/migrations/20260528140054_lesson_chat_rls.sql)).

**Caveat (impl-review F1, accepted-as-risk):** `set_message_embedding` and `list_unembedded_messages` are granted to `authenticated` with **no per-call `has_course_access` gate** (only `match_lesson_answers` gates). Not exploitable today (all courses free; embeddings are derived/null-only). So the test must assert **only what the SQL guarantees today**: column-scope + null-only + single-row — **not** a cross-course write-denial (that gap is deferred, tracked in roadmap `## Blocked`). Source: `context/archive/2026-06-07-ai-answer-matching/plan.md:61,63` + `reviews/impl-review.md:23,29-45`.

**Oracle / fixture:** a message with `embedding NULL` → `set_message_embedding(id, vec1)` sets it; snapshot `body`/`author_id`/`is_seeded`/`lesson_id`/`created_at` before+after and assert unchanged. Then `set_message_embedding(id, vec2)` on the now-set row → still `vec1` (no-op; verify via SELECT, the RPC returns void). A second NULL-embedding message stays NULL (single-row). Drive as a plain **authenticated** user (grant allows it).

### R2 / SRS — scoping correction (read carefully before planning)

- **`grade_question` is read-only** ([`20260607100000_srs_question_state.sql:82-110`](../../../supabase/migrations/20260607100000_srs_question_state.sql), declared `stable`): returns `{isCorrect, correctOptionIds}`, **writes nothing**. The migration header says scheduling happens in the API route.
- **FSRS scheduling lives in Astro API handlers**, not SQL: `src/pages/api/practice/[questionId]/grade.ts:76-82` (Good=3 / Again=1 upsert), `src/pages/api/tests/[testId]/submit.ts:92-114` (wrong→enrol+Again; correct-with-existing-card→Good; correct first-timer→**not enrolled**), `src/pages/api/reviews/[lessonId]/rate.ts:75-83` (raw 1–4 → upsert). All call `applyRating()` ([`src/lib/srs.ts:71`](../../../src/lib/srs.ts), wraps `ts-fsrs` `scheduler.next`). The `srs_*` columns are dumb persistence (`default 0`), no triggers.
- **Already covered:** FSRS math is unit-tested ([`src/lib/srs.test.ts`](../../../src/lib/srs.test.ts): reps increment, fresh-card invariants, `easy.due > again.due`). Own-only RLS on `srs_review_state`/`srs_question_state` is covered by Phase 1 [`tests/integration/idor.itest.ts`](../../../tests/integration/idor.itest.ts).
- **Consequence:** the integration harness (direct SQL/RLS) **cannot cleanly test the SRS scheduling write-path** — it lives in TS handlers, reachable only by running the server (e2e) or invoking the handler with a stubbed client (Phase 3 hermetic). An integration test that re-applies `applyRating` itself would be a mirror test. **Recommendation: scope Phase 2 to R3 + R5; defer the SRS scheduling write-path (enrol branch, session→user_id, due-advances) to Phase 3 hermetic.** Do NOT pad Phase 2 with a redundant SRS-math integration test.

### Harness reuse + fixture extensions

Reuse verbatim ([`tests/integration/setup/`](../../../tests/integration/setup/)): `serviceClient`/`anonClient`/`authedClientFor` (clients.ts), `getSupabaseLocalEnv` (supabase-env.ts), `createRunFixture(runId)`/`cleanup(runId, users)` + `uid(runId,key)` (fixtures.ts), the vitest `integration` project + global-setup. New files land as `tests/integration/*.itest.ts` and run under `npm run test:integration`.

**Extensions needed in `createRunFixture` (or a sibling builder):**
- **R3 grading:** reuse the existing gated-course `testId`/`questionId`/`correctOptionId`/`wrongOptionId`, OR the seed FREE test `f1…001`. The seed test is the better grading oracle (known 2-question shape, threshold 0.50). For the **zero-correct** edge, add a fixture question whose options are all `is_correct=false`.
- **R5(a) match isolation:** a **second free course** + lesson + an embedded message, plus an embedded "trap" message in a different course. `messages.embedding` is typed `string | null` in `database.types.ts`; insert as a string literal `"[f0,f1,…,f767]"` (768 floats). RPC args `p_query_embedding`/`p_embedding` are typed `string`.
- **R5(b) immutability:** one message with `embedding` NULL (to set) and one already set (to prove no-overwrite), in a course the test user can access.

Vector helper for fixtures: `` `[${new Array(768).fill(0).join(",")}]` `` with a few dims varied for controlled cosine (Phase 1 already uses a ZERO_VEC like this in `course-access.itest.ts`).

## Code References

- `supabase/migrations/20260606170000_tests_schema.sql:138-191` — `submit_test_attempt` grading loop (R3).
- `supabase/seed.sql:207-226` — seed quiz ids + answer key.
- `context/archive/2026-06-06-learning-loop/plan.md:42,65`, `plan-brief.md:23-25`, `reviews/impl-review.md:23` — grading oracle (source).
- `supabase/migrations/20260607130000_message_embeddings.sql:65-89,107-112,139-144` — `match_lesson_answers`, `set_message_embedding`, grants (R5).
- `context/archive/2026-06-07-ai-answer-matching/plan.md:61,63` + `reviews/impl-review.md:23,29-45` — R5 oracle + F1 caveat.
- `src/lib/embeddings.ts:27-47` — `embedText` (needs Workers AI) + `toVectorLiteral` (the test seam).
- `supabase/migrations/20260607100000_srs_question_state.sql:82-110` — `grade_question` (read-only, no scheduling).
- `src/pages/api/{practice/[questionId]/grade,tests/[testId]/submit,reviews/[lessonId]/rate}.ts` — where SRS scheduling actually writes.
- `src/lib/srs.ts:71`, `src/lib/srs.test.ts` — FSRS engine + existing unit coverage.
- `tests/integration/setup/{fixtures,clients,supabase-env}.ts`, `vitest.config.ts` — Phase 1 harness to reuse/extend.

## Architecture Insights

- **Definer-fn vs handler boundary decides what's integration-testable.** Grading (`submit_test_attempt`) and matching/embedding (`match_lesson_answers`, `set_message_embedding`) are definer functions → the SQL is the contract → perfect for direct-SQL integration tests. SRS scheduling is TS-in-handlers → not a definer fn → belongs to hermetic (Phase 3) or e2e, not Phase 2 integration. This boundary, not the risk label, should drive Phase 2 scope.
- **Oracle independence holds across all three.** Grading asserts a hand-computed truth table; match isolation asserts "courseA only, even when courseB ranks higher"; embedding immutability asserts a before/after column snapshot. None re-read a value through the path under test.
- **The F1 grant gap means R5(b) tests must be precise** — assert column-scope/null-only/single-row (guaranteed), not cross-course write-denial (not guaranteed today). Over-asserting would pin behavior the code doesn't promise.
- **Crafted vectors decouple R5 from Workers AI** — the RPCs take `vector(768)` args, so tests feed deterministic literals and skip `embedText` entirely.

## Historical Context (from prior changes)

- `context/archive/2026-06-06-learning-loop/` — origin of the tests schema + grading rule (R3 oracle).
- `context/archive/2026-06-07-ai-answer-matching/` — origin of `match_lesson_answers`/`set_message_embedding` + the F1/F2 impl-review findings (R5 oracle + caveat).
- `context/archive/2026-06-07-testing-access-control-rls/` — Phase 1: the harness this phase reuses; already covers `srs_*` own-only RLS (R2).
- `context/foundation/lessons.md` — answer-key invariant ([[lessons.md]]); [[feedback-no-db-reset]].

## Related Research

- `context/archive/2026-06-07-testing-access-control-rls/research.md` — the Phase 1 harness research (env discovery, client tiers, fixtures, prove-it-fails).
- `context/foundation/test-plan.md` §2 (R3/R5), §3 Phase 2, §6 cookbook.

## Open Questions

1. **SRS scope (for `/10x-plan` to decide):** confirm Phase 2 = R3 + R5 only, with the SRS scheduling write-path deferred to Phase 3 hermetic. The alternative — an e2e of the practice/submit rate path — is heavier and overlaps the existing unit math tests; likely not worth it now.
2. **Grading fixture source:** seed FREE test `f1…001` (known oracle) vs a fresh fixture test. The seed test is recommended for the main truth table; a small fixture question with **zero correct options** is still needed for that edge.
3. **Embedding-set caller:** drive `set_message_embedding` as a plain authenticated user (grant allows it) — confirm the plan asserts only column-scope/null-only/single-row, not the deferred cross-course write gate (F1).
