# Access-control & answer-key integration tests (test-plan Phase 1) — Implementation Plan

## Overview

Build **integration tests against the local Supabase stack** that pin three security invariants of the Unstuck quiz/course platform, exercising the real GoTrue→PostgREST JWT path (not Postgres `set role` impersonation):

- **R1** — a learner can never read the quiz answer key (`question_options.is_correct`) via any read path.
- **R2** — cross-user IDOR is denied: user A cannot read/write user B's `test_attempts` / `attempt_answers` / `messages` / `srs_*` / `lesson_completions`.
- **R4** — `has_course_access` gating holds: a non-enrolled user cannot reach gated (non-free) course content.

These tests characterize **already-correct** production behavior. Their job is **regression-pinning**: a future migration that adds an `authenticated` SELECT policy on `question_options`, flips it to `FORCE`, drops an own-only predicate, or weakens a definer gate must turn these tests red. No production code, migrations, or app behavior change in this plan — it is test code + Vitest config only.

## Current State Analysis

- **Answer-key invariant (R1):** `question_options` has RLS **ENABLE (not FORCE)** with **no `authenticated`/`anon` SELECT policy** ([`supabase/migrations/20260606170000_tests_schema.sql:90-93`](../../../supabase/migrations/20260606170000_tests_schema.sql)). The `postgres`-owned `SECURITY DEFINER` functions read `is_correct` server-side and omit it from every payload. This is one migration from breaking and nothing currently fails if it does — exactly what this plan pins. See [[lessons.md]] "Quiz answer-key protection".
- **Own-only RLS (R2):** `test_attempts` / `attempt_answers` / `srs_review_state` / `srs_question_state` / `lesson_completions` are ENABLE + FORCE with `user_id = auth.uid()` predicates; attempt/answer writes are definer-only (no authenticated write policy). **`messages` is the exception** — SELECT is course-gated, not author-owned (seeded/peer messages are visible to all enrolled users by design), so the message IDOR surface is the *foreign-author INSERT rejection* + absence of UPDATE/DELETE, not a read denial.
- **Course gate (R4):** `has_course_access(course_id)` = `is_free OR enrolled-via-auth.uid()` ([`20260528122957_lesson_chat_schema.sql:116-130`](../../../supabase/migrations/20260528122957_lesson_chat_schema.sql)), used in RLS SELECT policies and re-checked inside every definer fn. The seed has **only a free course**, so R4 needs a gated-course fixture.
- **Test infra today:** `vitest.config.ts` runs `src/**/*.test.ts` (node env, `@`→`./src`, a `cloudflare:workers` stub); `npm run test` = `vitest run` and **CI runs exactly this** ([`.github/workflows/ci.yml:36`](../../../.github/workflows/ci.yml)). `@supabase/supabase-js@^2.99.1` is installed; `pg` is not. Seed users have empty passwords (un-loginable). A manual `supabase/tests/rls_matrix.sql` probe exists but is un-run and uses `set role` (a different layer than the JWT path).
- **Full grounding:** `context/changes/testing-access-control-rls/research.md`.

## Desired End State

- `npm run test:integration` runs a Vitest **`integration` project** against a running local Supabase stack and proves R1/R2/R4. It fails fast with a readable message if the stack is down.
- `npm run test` (and therefore CI) is **unchanged** — unit-only, hermetic, no Docker.
- Each risk test has been **proven able to fail** (temporarily break the invariant → red → revert) so no assertion is vacuous.
- `supabase/tests/rls_matrix.sql` is deleted, its coverage folded into the Vitest tests.
- `test-plan.md` §6 cookbook has a concrete Phase-1 entry; §3 status row for Phase 1 reads `complete`.

### Key Discoveries:

- The R1 invariant is an **absence of policy** — the test must probe the raw table + a PostgREST embed, not just the safe RPC ([research.md R1 oracle]).
- `messages` SELECT is course-scoped, not author-scoped — asserting "user B can't read user A's message" would be a **false test** ([research.md R2]).
- The seed answer key is **Q1→`f3000000-…001`, Q2→`f3000000-…004`+`…005`** — the hand-derived oracle for R1/grading ([`supabase/seed.sql`](../../../supabase/seed.sql)).
- Integration tests **must not** import `src/lib/supabase.ts` — it pulls `astro:env/client`, which Vitest can't resolve. Build clients directly from `@supabase/supabase-js`.
- `enable_confirmations=true` ([`supabase/config.toml:209`](../../../supabase/config.toml)) → mint users via `auth.admin.createUser({email_confirm:true})`, not `signUp`.

## What We're NOT Doing

- No production code, migration, RLS-policy, or definer-fn changes. (If a test reveals a real leak, that's a separate change.)
- No grading-correctness oracle (R3), no embedding/immutability (R5) — that's **test-plan Phase 2**.
- No hermetic stub-client service/API tests (R6/R7) — that's **Phase 3**.
- No CI wiring for integration tests and no Stryker — that's **Phase 4**. `npm run test` stays hermetic here.
- No `pg` dependency / transaction-per-test isolation (chosen: fixtures + cleanup).
- No new seed data committed to `supabase/seed.sql` — fixtures are created at runtime and cleaned up.

## Implementation Approach

Layered, per-risk: stand up the harness + fixtures first (Phase 1), then one phase per risk (R1→R2→R4), each a self-contained `*.itest.ts` that depends only on the Phase-1 helpers, then a close-out phase (cookbook + rls_matrix.sql retirement + status sync). Isolation is per-run unique-id fixtures with FK-ordered `service_role` cleanup; read-only assertions reuse stable seed ids. Each risk phase ends with a **prove-it-fails** step: temporarily break the invariant, confirm the test goes red, revert — guarding against vacuous green on already-correct code.

## Critical Implementation Details

- **Client seam:** never import `src/lib/supabase.ts` / `supabase-browser.ts` (both read `astro:env`). Construct `@supabase/supabase-js` clients directly with URL + key from `npx supabase status -o json`.
- **Auth path for assertions:** anon-key client + `signInWithPassword` (or POST `:54321/auth/v1/token?grant_type=password`) → real JWT → RLS as that user. The `service_role` client is for setup/teardown only (it bypasses RLS, so it must never be the client under assertion).
- **Cleanup ordering:** delete children before parents (attempt_answers → test_attempts → question_options → questions → tests → messages → lessons → chapters → enrollments → courses → `auth.admin.deleteUser`). Make cleanup idempotent (delete-by-id, ignore not-found) so an aborted run self-heals on the next run.
- **Prove-it-fails hygiene:** the temporary break is a local edit (e.g. a scratch SQL `create policy` via the service_role/psql, or a deliberately wrong expected value) applied, observed red, then fully reverted **before** the phase commit. Never commit a broken invariant. Prefer flipping the *expected value in the test* over mutating the DB where it proves the same thing, to avoid leaving DB residue.

## Phase 1: Harness & fixtures

### Overview

Stand up a separate Vitest `integration` project and the helpers every risk phase depends on: env discovery, clients, fixture builder, cleanup. No risk assertions yet — this phase delivers the scaffolding and one trivial connectivity test that proves the stack is reachable.

### Changes Required:

#### 1. Vitest project split

**File**: `vitest.config.ts`

**Intent**: Add an `integration` project so integration tests are isolated from the hermetic unit run; `npm run test` must stay unit-only and Docker-free.

**Contract**: Convert to Vitest `projects` (unit + integration) sharing a hoisted `resolve.alias` (`@`→`./src`, the `cloudflare:workers` stub). `unit` includes `src/**/*.test.ts` and excludes `**/*.itest.ts`; `integration` includes `tests/integration/**/*.itest.ts` with a `globalSetup` (see #3). Keep the existing unit behavior byte-for-byte.

#### 2. npm scripts

**File**: `package.json`

**Intent**: Keep CI's `test` hermetic; add an explicit integration entry point.

**Contract**: `test` → `vitest run --project unit` (CI-safe, unchanged behavior); add `test:integration` → `vitest run --project integration`. Leave `test:watch`, `test:e2e` as-is.

#### 3. Env discovery + fail-fast global setup

**File**: `tests/integration/setup/supabase-env.ts`, `tests/integration/setup/global-setup.ts`

**Intent**: Discover the local stack's URL + anon + service_role keys at runtime (nothing secret committed) and fail fast with a clear message if the stack is down.

**Contract**: `supabase-env.ts` exports a function that shells `npx supabase status -o json` and returns `{ url, anonKey, serviceRoleKey }` (throws a readable error if parsing fails). `global-setup.ts` calls it and probes `:54321/auth/v1/health` (or equivalent) — on failure throws `"Local Supabase not running — run `npx supabase start` (integration tests need it)."`.

#### 4. Client helpers

**File**: `tests/integration/setup/clients.ts`

**Intent**: Provide the two client tiers the tests need without touching `astro:env`.

**Contract**: `serviceClient()` → `createClient(url, serviceRoleKey, {auth:{persistSession:false,autoRefreshToken:false}})`; `authedClientFor(email, password)` → sign in on an anon-key client, return a client carrying the user's JWT (`global.headers.Authorization`); `anonClient()` → anon-key, no session. All read URL/keys from `supabase-env.ts`.

#### 5. Fixture builder + cleanup

**File**: `tests/integration/setup/fixtures.ts`

**Intent**: Create per-run, uniquely-id'd fixtures for the multi-user + gated-course scenarios, and tear them down FK-ordered.

**Contract**: `createRunFixture(runId)` (service_role) mints two login-capable learners (`auth.admin.createUser({email_confirm:true})`), a **gated** course (`is_free=false`) + chapter + lesson + test + question + options + one seeded message, and enrolls exactly one learner. Returns the ids + credentials. `cleanup(runId)` deletes everything created, children-before-parents, idempotently. `runId` is derived per file without `Math.random`/`Date.now` (e.g. a per-file constant suffix) to stay deterministic.

#### 6. Connectivity smoke test

**File**: `tests/integration/smoke.itest.ts`

**Intent**: Prove the harness wires up end-to-end before any risk logic.

**Contract**: One test: `serviceClient()` can read the seed course `a0000000-…0001`; an `authedClientFor` a freshly-created user gets a valid session. Created users cleaned up in `afterAll`.

### Success Criteria:

#### Automated Verification:

- Unit run unchanged and green: `npm run test`
- Integration project discovered and smoke test passes (stack up): `npm run test:integration`
- Type checking passes: `npx tsc --noEmit` (or `npm run build`)
- Linting passes: `npm run lint`

#### Manual Verification:

- With the stack **down**, `npm run test:integration` fails fast with the readable "run `npx supabase start`" message (not a timeout).
- `npm run test` does not start Docker and does not hit `:54321`.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: R1 — answer-key never readable

### Overview

Prove an authenticated non-operator learner gets **zero** `is_correct` from all three read paths. Oracle = the seed answer key (Q1→`…001`, Q2→`…004`+`…005`), derived independently of the SQL.

### Changes Required:

#### 1. Answer-key probe test

**File**: `tests/integration/answer-key.itest.ts`

**Intent**: Pin the load-bearing R1 invariant across every vector it could leak through.

**Contract**: As an `authedClientFor` a fresh enrolled learner against the **seed free course** test `f1000000-…0001`:
- **Raw table:** `from('question_options').select('*')` → **0 rows** (and `from('question_options').select('is_correct')` → 0 rows / no data).
- **Embed:** attempt to reach options through a PostgREST embed from `questions` (e.g. `select('*, question_options(*)')`) → assert no option rows / no `is_correct` field surface (assertion tolerant to "errors" OR "returns questions without options", per research open-question on embed shape).
- **RPC:** `rpc('get_test_questions', {p_test_id})` → returns questions+options, **`is_correct` key absent** from every option object; the returned option ids match the seed (so it's a real payload, not empty), and the *correct* ids (`…001/004/005`) are NOT distinguishable in the payload.

#### 2. Prove-it-fails check (manual, reverted)

**Intent**: Confirm the raw-table assertion is not vacuous.

**Contract**: Temporarily add an `authenticated` SELECT policy on `question_options` (scratch SQL via service_role/psql), re-run the test, confirm the raw-table assertion goes **red**, then drop the policy and confirm green. Document the observation; commit nothing broken.

### Success Criteria:

#### Automated Verification:

- R1 test passes: `npm run test:integration -- answer-key`
- Type check + lint pass: `npx tsc --noEmit` && `npm run lint`

#### Manual Verification:

- Prove-it-fails performed: with a temporary authenticated SELECT policy on `question_options`, the raw-table assertion fails; after revert, it passes.

**Implementation Note**: Pause for manual confirmation (incl. the prove-it-fails observation) before Phase 3.

---

## Phase 3: R2 — cross-user IDOR denial

### Overview

Prove user B cannot read or write user A's own-only rows, and that the message IDOR surface (foreign-author INSERT, immutability) holds — with an own-row control proving the policy isn't globally denying.

### Changes Required:

#### 1. IDOR test

**File**: `tests/integration/idor.itest.ts`

**Intent**: Assert the denied cross-user path for each own-only table, plus the message-specific surface, plus a passing own path.

**Contract**: Using two `authedClientFor` users (A and B) created in the fixture:
- **Read denial** (own-only tables): B `from(<table>).select().eq('id', <A's row id>)` → **0 rows** for `test_attempts`, `attempt_answers`, `srs_review_state`, `srs_question_state`, `lesson_completions`, `enrollments`. (Seed/create A's rows via service_role or A's own authed writes where a write path exists.)
- **Write denial:** B INSERT/UPDATE with a foreign `user_id` → rejected (RLS error or 0 rows affected). For `messages`: B INSERT with `author_id = <A>` or `is_seeded = true` → WITH CHECK rejected; B UPDATE/DELETE any message → denied (no policy).
- **Own-path control:** B performing the same SELECT/write on **B's own** rows succeeds — proves denial is ownership-scoped, not blanket.
- **Messages read note:** explicitly assert B *can* read a shared/seeded message in a course B is enrolled in (documents that message SELECT is course-gated, not author-owned — prevents a future false "fix").

#### 2. Prove-it-fails check (manual, reverted)

**Intent**: Confirm a cross-user read assertion is not vacuous.

**Contract**: Temporarily weaken one own-only assertion (e.g. expect B to read A's `test_attempts` row) or relax a predicate in a scratch DB copy; confirm the test flips; revert. Prefer flipping the test's expected value over mutating the DB. Commit nothing broken.

### Success Criteria:

#### Automated Verification:

- R2 test passes: `npm run test:integration -- idor`
- Type check + lint pass: `npx tsc --noEmit` && `npm run lint`

#### Manual Verification:

- Prove-it-fails performed: the cross-user read assertion fails when inverted, passes when correct.

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: R4 — course-access gate

### Overview

Prove a non-enrolled user is denied gated (non-free) course content across tables and RPCs, with an enrolled control proving the gate is the enrollment.

### Changes Required:

#### 1. Course-gate test

**File**: `tests/integration/course-access.itest.ts`

**Intent**: Assert the gated-course denial surface for the non-enrolled user and the enrolled control.

**Contract**: Using the fixture's **gated course** (`is_free=false`), the **non-enrolled** learner (authed):
- `from('lessons'|'messages'|'tests'|'questions')` filtered to the gated course → **0 rows**.
- `rpc('get_test_questions', {gated test})` → `[]`; `rpc('get_due_practice_questions', {gated course})` → `[]`; `rpc('match_lesson_answers', {gated course, …})` → `[]`.
- `rpc('submit_test_attempt', {gated test, …})` → **`no_access`** error; `rpc('grade_question', {gated question, …})` → **`no_access`** error.
- **Enrolled control:** the fixture's enrolled learner gets rows / non-error from the same calls — proves the gate is enrollment, not an unrelated denial.

#### 2. Prove-it-fails check (manual, reverted)

**Intent**: Confirm the gate assertion is not vacuous.

**Contract**: Temporarily enroll the "non-enrolled" user (service_role insert) and confirm the denial assertions flip to allowed; remove the enrollment and confirm denial returns. (This break/revert is pure fixture data, auto-cleaned — low residue risk.)

### Success Criteria:

#### Automated Verification:

- R4 test passes: `npm run test:integration -- course-access`
- Full integration suite green: `npm run test:integration`
- Type check + lint pass: `npx tsc --noEmit` && `npm run lint`

#### Manual Verification:

- Prove-it-fails performed: enrolling the non-enrolled user flips denials to allowed; un-enrolling restores denial.

**Implementation Note**: Pause for manual confirmation before Phase 5.

---

## Phase 5: Cookbook & close-out

### Overview

Capture the reusable harness recipe, retire the superseded manual probe, and sync rollout state.

### Changes Required:

#### 1. Cookbook entry

**File**: `context/foundation/test-plan.md` (§6)

**Intent**: Replace the Phase-1 TBD with a concrete recipe future phases reuse.

**Contract**: Fill the "Integration: multi-user RLS / answer-key probe" bullet: how to discover env from `supabase status`, the two client tiers, the per-run fixture + FK-ordered cleanup pattern, and the prove-it-fails discipline. Point to `tests/integration/setup/`.

#### 2. Retire the manual probe

**File**: `supabase/tests/rls_matrix.sql` (delete)

**Intent**: Single automated source of truth; its cells are now covered by the Vitest tests.

**Contract**: Confirm each `rls_matrix.sql` cell maps to an assertion in `answer-key`/`idor`/`course-access` (add any missing cell first), then `git rm` the file. Note the mapping in the cookbook entry.

#### 3. Rollout status sync

**File**: `context/foundation/test-plan.md` (§3 table), `context/changes/testing-access-control-rls/change.md`

**Intent**: Reflect that Phase 1 shipped.

**Contract**: Set §3 Phase-1 Status cell to `complete`. (change.md status is driven to `implemented` by the implement skill's epilogue; §4/§5 already document the stack prereq.)

### Success Criteria:

#### Automated Verification:

- Full integration suite still green: `npm run test:integration`
- Unit run + lint still green: `npm run test` && `npm run lint`
- `supabase/tests/rls_matrix.sql` no longer exists: `test ! -f supabase/tests/rls_matrix.sql`

#### Manual Verification:

- §6 cookbook entry is concrete enough that Phase 2 can reuse the harness without re-reading the test source.
- Every former `rls_matrix.sql` cell has a confirmed home in the Vitest suite.

**Implementation Note**: Final phase — after automated verification, pause for manual confirmation, then the implement epilogue closes the change.

---

## Testing Strategy

### Integration Tests (the deliverable):

- `answer-key.itest.ts` — R1 across raw table, embed, RPC.
- `idor.itest.ts` — R2 cross-user denial + own-path control + message surface.
- `course-access.itest.ts` — R4 gated denial + enrolled control.
- `smoke.itest.ts` — harness connectivity.

### Oracle rule:

Every assertion compares against hand-derived truth (the seed answer key, the ownership/enrollment contract), never against a value re-read through the path under test. Each risk test is proven able to fail (prove-it-fails) so green means protected, not vacuous.

### What stays hermetic:

The unit run (`npm run test`) and CI are untouched — no Docker, no `:54321`.

## Performance Considerations

Integration tests are I/O-bound against local Postgres; keep fixtures minimal (one gated course, two users) and reuse stable seed ids for read-only assertions. Cleanup is per-run, not per-test, to limit round-trips.

## Migration Notes

No DB migrations. Fixtures are runtime-created and cleaned up; nothing is committed to `supabase/seed.sql`. Never `supabase db reset` ([[feedback-no-db-reset]]).

## References

- Research: `context/changes/testing-access-control-rls/research.md`
- Rollout blueprint: `context/foundation/test-plan.md` (§2 risks, §3 Phase 1, §5 layers, §6 cookbook)
- Answer-key invariant: `context/foundation/lessons.md`
- Manual probe to port/retire: `supabase/tests/rls_matrix.sql`
- Local-stack prereq precedent: `playwright.config.ts`, `e2e/test-taking.spec.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Harness & fixtures

#### Automated

- [x] 1.1 Unit run unchanged and green: `npm run test`
- [x] 1.2 Integration project discovered and smoke test passes: `npm run test:integration`
- [x] 1.3 Type checking passes: `npx tsc --noEmit`
- [x] 1.4 Linting passes: `npm run lint`

#### Manual

- [x] 1.5 With stack down, `npm run test:integration` fails fast with the readable message
- [x] 1.6 `npm run test` does not start Docker / hit `:54321`

### Phase 2: R1 — answer-key never readable

#### Automated

- [ ] 2.1 R1 test passes: `npm run test:integration -- answer-key`
- [ ] 2.2 Type check + lint pass

#### Manual

- [ ] 2.3 Prove-it-fails: temporary authenticated SELECT policy on `question_options` makes the raw-table assertion fail; revert restores green

### Phase 3: R2 — cross-user IDOR denial

#### Automated

- [ ] 3.1 R2 test passes: `npm run test:integration -- idor`
- [ ] 3.2 Type check + lint pass

#### Manual

- [ ] 3.3 Prove-it-fails: inverting a cross-user read assertion flips red; correct version passes

### Phase 4: R4 — course-access gate

#### Automated

- [ ] 4.1 R4 test passes: `npm run test:integration -- course-access`
- [ ] 4.2 Full integration suite green: `npm run test:integration`
- [ ] 4.3 Type check + lint pass

#### Manual

- [ ] 4.4 Prove-it-fails: enrolling the non-enrolled user flips denials to allowed; un-enrolling restores denial

### Phase 5: Cookbook & close-out

#### Automated

- [ ] 5.1 Full integration suite still green: `npm run test:integration`
- [ ] 5.2 Unit run + lint still green: `npm run test` && `npm run lint`
- [ ] 5.3 `supabase/tests/rls_matrix.sql` removed: `test ! -f supabase/tests/rls_matrix.sql`

#### Manual

- [ ] 5.4 §6 cookbook entry is concrete enough for Phase 2 to reuse without reading test source
- [ ] 5.5 Every former `rls_matrix.sql` cell has a confirmed home in the Vitest suite
