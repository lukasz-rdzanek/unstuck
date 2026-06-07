---
date: 2026-06-07T15:27:38+02:00
researcher: Lukasz Rdzanek
git_commit: 9c63a2183879a5d196c201b5b21e9fe53b840836
branch: master
repository: Unstuck
topic: "Access-control & answer-key integration tests (test-plan Phase 1): R1/R2/R4 oracle + Vitest↔local-Supabase harness"
tags: [research, codebase, rls, security-definer, answer-key, integration-tests, vitest, supabase-local]
status: complete
last_updated: 2026-06-07
last_updated_by: Lukasz Rdzanek
---

# Research: Access-control & answer-key integration tests (test-plan Phase 1)

**Date**: 2026-06-07T15:27:38+02:00
**Researcher**: Lukasz Rdzanek
**Git Commit**: 9c63a2183879a5d196c201b5b21e9fe53b840836
**Branch**: master
**Repository**: Unstuck

## Research Question

Ground rollout **Phase 1** of `context/foundation/test-plan.md` (change `testing-access-control-rls`). Establish the **oracle** (what the code *should* do, from product behavior — not the SQL) for three risks, and the **integration-test harness** to prove them:

- **R1** — a learner reads the quiz answer key (`question_options.is_correct`) via direct REST or a PostgREST embed.
- **R2** — cross-user (IDOR): user A reads/writes user B's `test_attempts` / `attempt_answers` / `messages` / `srs_*` / `lesson_completions`.
- **R4** — `has_course_access` bypass: gated/paid-course content reachable by a non-enrolled user.

## Summary

The access-control architecture is **multi-layered and load-bearing**, and all three risks are testable today against the local Supabase stack via the real GoTrue→PostgREST JWT path:

1. **R1 (answer key)** is protected by a deliberate, non-obvious invariant: `question_options` has RLS **ENABLE (not FORCE)** with **no authenticated/anon SELECT policy**. `postgres`-owned `SECURITY DEFINER` functions read `is_correct` server-side and build JSON payloads that **omit** it; learners hitting the raw table get **0 rows**. The oracle: an authenticated non-operator must get **zero** `is_correct` from (a) raw table SELECT, (b) any PostgREST embed, (c) every read RPC. This invariant is one line from breaking — a future migration adding a SELECT policy or flipping `question_options` to FORCE would not fail any existing test. That is exactly what Phase 1 must pin.

2. **R2 (IDOR)** is protected by own-only RLS (`user_id = auth.uid()`) with **FORCE** on every owner table, and writes routed exclusively through definer functions (no authenticated INSERT/UPDATE/DELETE policies on attempts/answers). The oracle: a second user's session SELECT/UPDATE of another user's row returns **0 rows** (silent USING denial) or is rejected (WITH CHECK). Note `messages` SELECT is **course-gated, not author-owned** — seeded messages are intentionally visible to all enrolled users; the IDOR assertion for messages is the **INSERT-with-foreign-author** rejection, not a SELECT denial.

3. **R4 (course gate)** is protected by `has_course_access(course_id)` (`is_free OR enrolled-via-auth.uid()`) in RLS SELECT policies (lessons/messages/tests/questions) and as an explicit gate inside every definer fn. The seed has **only a free course**, so R4 requires a **gated-course fixture** (`is_free=false`, no enrollment for the test user). The oracle: a non-enrolled user gets `[]`/0 rows from lessons/messages/tests and `[]` from the read RPCs, and `no_access` from the write RPCs.

**Harness recommendation:** a separate Vitest **project** (not a second config file) under `tests/integration/**/*.itest.ts`, keyed off `npx supabase status -o json` for URL + anon + service_role keys; service_role client for setup/teardown (`auth.admin.createUser({email_confirm:true})` to mint login-capable users) and the real anon-key + `signInWithPassword` client for the assertion path. Per-run unique-id fixtures + FK-ordered service_role cleanup — **never** `supabase db reset`. `npm run test` stays unit-only (CI-safe, no Docker); add `test:integration`.

## Detailed Findings

### R1 — Answer-key (`question_options.is_correct`) exposure surface

**The invariant** — [`supabase/migrations/20260606170000_tests_schema.sql:90-93`](supabase/migrations/20260606170000_tests_schema.sql#L90-L93):

```sql
-- question_options: ENABLE only (NOT force) + no authenticated policy → learners
-- denied; the definer functions (owned by postgres = table owner) bypass RLS to
-- read is_correct. FORCE would block the owner too, breaking grading.
alter table public.question_options enable row level security;
```

- The column is annotated as the answer key at [`tests_schema.sql:51`](supabase/migrations/20260606170000_tests_schema.sql#L51): `is_correct boolean not null default false, -- SENSITIVE: answer key, never exposed to learners`.
- **No SELECT policy** exists for `question_options` for `authenticated` or `anon` in any migration (grep across all migrations confirms `question_options` appears only in `20260606170000_tests_schema.sql` and `20260607100000_srs_question_state.sql`, and neither adds a SELECT policy).
- `tests` and `questions` are FORCE + course-gated but expose no correctness — [`tests_schema.sql:77-88`](supabase/migrations/20260606170000_tests_schema.sql#L77-L88).

**Read RPCs all omit `is_correct`:**
- `get_test_questions` — builds options as `jsonb_build_object('id', o.id, 'body', o.body, 'position', o.position)` ([`tests_schema.sql:125`](supabase/migrations/20260606170000_tests_schema.sql#L125)). Gated: returns `'[]'::jsonb` when `not has_course_access`.
- `submit_test_attempt` — reads `is_correct` server-side (`where o.is_correct`, [`tests_schema.sql:170-171`](supabase/migrations/20260606170000_tests_schema.sql#L170-L171)) but returns only `{score, passed, perQuestion:[{questionId, isCorrect, correctOptionIds}]}` ([`tests_schema.sql:182-189`](supabase/migrations/20260606170000_tests_schema.sql#L182-L189)). `correctOptionIds` is post-submission feedback (the IDs of correct options), never the raw boolean column.
- `get_due_practice_questions` — same omit pattern ([`20260607100000_srs_question_state.sql:66`](supabase/migrations/20260607100000_srs_question_state.sql#L66)).
- `grade_question` — returns `{isCorrect, correctOptionIds}` only ([`20260607100000_srs_question_state.sql:108`](supabase/migrations/20260607100000_srs_question_state.sql#L108)).

**Grants** — all four RPCs `revoke execute … from public; grant execute … to authenticated` ([`tests_schema.sql:193-196`](supabase/migrations/20260606170000_tests_schema.sql#L193-L196), [`20260607100000_srs_question_state.sql:112-115`](supabase/migrations/20260607100000_srs_question_state.sql#L112-L115)).

**Client never touches the table** — `src/lib/services/tests.ts` reads tests via `.from("tests").select("*")` (no `is_correct` column), takes questions via `.rpc("get_test_questions")` ([`src/lib/services/tests.ts:51-59`](src/lib/services/tests.ts#L51-L59)), practice via `.rpc("get_due_practice_questions")`. API routes `src/pages/api/tests/[testId]/submit.ts` and `src/pages/api/practice/[questionId]/grade.ts` call only the definer RPCs.

**R1 oracle (what a test must prove), independent of the SQL:**
1. Authenticated non-operator: `from('question_options').select('*')` → **0 rows** (RLS denial).
2. Authenticated non-operator: a PostgREST embed that tries to reach options (e.g. `from('questions').select('*, question_options(*)')`) → either errors or returns questions with **no** option rows / no `is_correct` field.
3. `rpc('get_test_questions', {p_test_id})` → every returned option object has **no `is_correct` key** (assert the key is absent, not just falsy).
4. `submit_test_attempt` response contains `correctOptionIds` for feedback but **no raw `is_correct`** — and the IDs match the hand-derived answer key from the seed.

### R2 — Own-only RLS / cross-user IDOR

All owner tables are **ENABLE + FORCE** with `user_id = auth.uid()` predicates. Writes to attempts/answers are definer-only (no authenticated write policy):

| Table | Policies (role=authenticated) | Predicate | File |
|---|---|---|---|
| `test_attempts` | SELECT only (`attempts_select_own`) | `user_id = (select auth.uid())` | [`tests_schema.sql:96-99`](supabase/migrations/20260606170000_tests_schema.sql#L96-L99) |
| `attempt_answers` | SELECT only (`attempt_answers_select_own`) | EXISTS parent attempt owned by `auth.uid()` | [`tests_schema.sql:101-105`](supabase/migrations/20260606170000_tests_schema.sql#L101-L105) |
| `messages` | SELECT (course-gated), INSERT (own+non-seed+gated) | see note below | [`20260528140054_lesson_chat_rls.sql:99-127`](supabase/migrations/20260528140054_lesson_chat_rls.sql#L99-L127) |
| `srs_review_state` | SELECT/INSERT/UPDATE own | `user_id = (select auth.uid())` | [`20260606140000_srs_review_state.sql:40-62`](supabase/migrations/20260606140000_srs_review_state.sql#L40-L62) |
| `srs_question_state` | SELECT/INSERT/UPDATE own | `user_id = (select auth.uid())` | [`20260607100000_srs_question_state.sql:36-48`](supabase/migrations/20260607100000_srs_question_state.sql#L36-L48) |
| `lesson_completions` | SELECT/INSERT/DELETE own | `user_id = auth.uid()` | [`20260530220000_lesson_completions.sql:39-66`](supabase/migrations/20260530220000_lesson_completions.sql#L39-L66) |
| `enrollments` | SELECT own (writes service_role) | `user_id = auth.uid()` | [`20260528140054_lesson_chat_rls.sql:88-95`](supabase/migrations/20260528140054_lesson_chat_rls.sql#L88-L95) |
| `profiles` | SELECT all (`true`), UPDATE own | `id = auth.uid()` (update) | [`20260528140054_lesson_chat_rls.sql:48-59`](supabase/migrations/20260528140054_lesson_chat_rls.sql#L48-L59) |

**`messages` is the IDOR exception worth calling out:** SELECT is gated by `has_course_access`, **not** authorship — seeded + peer messages are visible to all enrolled users by design (that's the product: a shared lesson chat). So the R2 assertion for messages is **not** "user B can't read user A's message"; it's:
- `messages_insert_peer_own_non_seed` ([`20260528140054_lesson_chat_rls.sql:117-127`](supabase/migrations/20260528140054_lesson_chat_rls.sql#L117-L127)) → user B inserting with `author_id = <user A>` or `is_seeded = true` is **WITH CHECK rejected**.
- No UPDATE/DELETE policy → user B (or anyone authenticated) updating/deleting any message is denied (FR-007 immutability — see archive `learning-loop`).

**R2 oracle (per table), from product behavior:**
- **Read denial**: user B `from(<table>).select().eq('id', <A's row>)` → **0 rows** for the own-only tables (attempts, answers, srs_*, completions, enrollments). This is silent USING-clause denial, not an error.
- **Write denial**: user B INSERT/UPDATE with a foreign `user_id`/`author_id` → rejected (RLS WITH CHECK or USING). For attempts/answers there is no authenticated write path at all — only `submit_test_attempt`.
- **Own path passes**: the same operations on user B's *own* rows succeed (proves the policy isn't just globally denying).

### R4 — `has_course_access` gate

Definition — [`20260528122957_lesson_chat_schema.sql:116-130`](supabase/migrations/20260528122957_lesson_chat_schema.sql#L116-L130):

```sql
create function public.has_course_access(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.courses c where c.id = p_course_id and c.is_free)
      or exists (select 1 from public.enrollments e where e.course_id = p_course_id and e.user_id = auth.uid());
$$;
```

Callers (RLS): `lessons_select_gated`, `messages_select_gated`, `messages_insert_peer_own_non_seed`, `tests_select_access`, `questions_select_access`. Callers (definer fns, each gates explicitly): `get_test_questions`, `submit_test_attempt` (raises `no_access`), `get_due_practice_questions`, `grade_question` (raises `no_access`), `match_lesson_answers` (`when not has_course_access then '[]'`).

`courses.is_free boolean not null default true` ([`20260528122957_lesson_chat_schema.sql:36-46`](supabase/migrations/20260528122957_lesson_chat_schema.sql#L36-L46)); `enrollments` is `(id, user_id, course_id, created_at)` with `unique(user_id, course_id)` ([`20260528122957_lesson_chat_schema.sql:74-86`](supabase/migrations/20260528122957_lesson_chat_schema.sql#L74-L86)).

**R4 oracle** — a gated-course fixture (`is_free=false` course + chapter + lesson + test/question/options + a seeded message, **no enrollment** for the test user) must yield, for the non-enrolled user:
- `from('lessons'|'messages'|'tests'|'questions')` filtered to the gated course → **0 rows**.
- `rpc('get_test_questions')` / `rpc('get_due_practice_questions')` / `rpc('match_lesson_answers')` for the gated course → `[]`.
- `rpc('submit_test_attempt')` / `rpc('grade_question')` for the gated test → **`no_access`** error.
- **Control**: enroll the user (service_role inserts the enrollment row) and the same calls now succeed — proves the gate is the enrollment, not some unrelated denial.

### Integration harness — Vitest ↔ local Supabase

**Ports/auth** — REST + GoTrue on `:54321`, DB on `:54322` ([`supabase/config.toml:10,29`](supabase/config.toml#L10)); `[auth.email] enable_confirmations=true` ([`supabase/config.toml:209`](supabase/config.toml#L209)) — so a plain `signUp` can't get a password token until confirmed; mint users with the admin API + `email_confirm:true` instead.

**Seed fixtures** ([`supabase/seed.sql`](supabase/seed.sql)) — stable ids a test can rely on for read-only assertions:
- Users: operator `c0000000-0000-0000-0000-000000000001`, peer `…0002` — **both have empty `encrypted_password` → un-loginable**. Do NOT try to log in as seed users; create fresh login-capable users in the harness.
- Course `a0000000-…0001` (`react-architecture-deep-dive`, **`is_free=true`**) — no gated course in seed (R4 must create one).
- Test `f1000000-…0001` (`pass_threshold=0.50`); questions `f2000000-…0001` (single), `…0002` (multi); options `f3000000-…0001..006` — **correct: `…001` (Q1), `…004` & `…005` (Q2)** → the answer-key oracle for R1.

**Existing manual probe** — [`supabase/tests/rls_matrix.sql`](supabase/tests/rls_matrix.sql) asserts a 6-cell role matrix using `set local role` + `set local request.jwt.claims` (Postgres impersonation), self-contained in a `begin … rollback`, **not wired to any npm script or CI**. It's a strong **oracle reference to port from**, but it does NOT exercise the real GoTrue→PostgREST JWT path R1 needs (raw table SELECT / embed via PostgREST). Recommendation: port its cells into the Vitest integration tests via the real authenticated client, then mark `rls_matrix.sql` superseded once Phase 1 covers it (change.md already says "fold/replace where it overlaps").

**Client seam** — `src/lib/supabase.ts` and `src/lib/supabase-browser.ts` both read `astro:env/client` ([`src/lib/supabase.ts:3`](src/lib/supabase.ts#L3)) → **not usable in Vitest** (virtual module). Integration tests must construct clients directly from `@supabase/supabase-js` (`^2.99.1`, present in `package.json`). `@supabase/ssr` (`^0.10.3`) is also present; `pg` is **not** installed.

**Auth seam (recommended two-tier):**
- **service_role** client (`createClient(url, serviceRoleKey, {auth:{persistSession:false}})`) for setup/teardown: `auth.admin.createUser({email, password, email_confirm:true})` to mint login-capable users; insert the gated-course fixture; FK-ordered cleanup.
- **authenticated** client (the real JWT path the risks need): `signInWithPassword` on an anon-key client, or POST `:54321/auth/v1/token?grant_type=password`, then `createClient(url, anonKey, {global:{headers:{Authorization:'Bearer '+token}}})`.
- Keys: anon = `SUPABASE_KEY` in `.dev.vars`; **service_role is NOT in the repo** (AGENTS.md — lives in Studio). Read all three at runtime from `npx supabase status -o json` in a global setup so nothing secret is committed and the harness is zero-config when the stack is up.

**State isolation without `db reset`** ([[feedback-no-db-reset]]): no `pg` dep, so a true BEGIN/ROLLBACK wrapper would need a new dependency + a `:54322` connection. Recommended (simplest, reliable, no new deps): **per-run unique-id fixtures + explicit FK-ordered service_role cleanup** in `afterAll` (children before parents; `auth.admin.deleteUser` the created users). Read-only assertions (the seed answer key, the free course) reuse stable seed ids without mutation. Revisit `pg`-transaction isolation only if Phase 2's grading mutations need stricter isolation.

**Separation from the unit run** — `vitest.config.ts` currently `include: ["src/**/*.test.ts"]` with `@`→`./src` and a `cloudflare:workers` stub ([`vitest.config.ts:16,19-22`](vitest.config.ts#L16-L22)); `npm run test` = `vitest run` and **CI runs exactly this** ([`.github/workflows/ci.yml:36`](.github/workflows/ci.yml#L36)). Convert to Vitest **projects** in the one config: `unit` (`src/**/*.test.ts`, exclude `*.itest.ts`) and `integration` (`tests/integration/**/*.itest.ts` + a `globalSetup` that fails fast if the stack is down). Hoist the shared `resolve.alias` so both inherit the `@` alias and the `cloudflare:workers` stub (integration tests transitively load `src/lib/embeddings.ts`, which imports `cloudflare:workers`). Scripts: keep `test` = `vitest run --project unit` (CI unchanged, hermetic, no Docker); add `test:integration` = `vitest run --project integration`. Do NOT import `src/lib/supabase.ts` from tests (pulls `astro:env`).

**Prereq** — the local stack must be UP (`:54321` + `:54322`). Mirror the Playwright precedent ([`playwright.config.ts`](playwright.config.ts) webServer + `e2e/test-taking.spec.ts:8-9`): a guarded global-setup that fails with a readable message if `:54321/auth/v1/health` is unreachable, so a dev without Docker gets a clear error, not a timeout. Keep it OUT of CI — Phase 4 wires CI + a test DB.

## Code References

- `supabase/migrations/20260606170000_tests_schema.sql:51` — `is_correct` annotated SENSITIVE (the answer key).
- `supabase/migrations/20260606170000_tests_schema.sql:90-93` — `question_options` ENABLE-not-FORCE, no auth policy (the R1 invariant).
- `supabase/migrations/20260606170000_tests_schema.sql:109-196` — `get_test_questions` / `submit_test_attempt` definer fns + grants.
- `supabase/migrations/20260607100000_srs_question_state.sql:52-115` — `get_due_practice_questions` / `grade_question` + grants.
- `supabase/migrations/20260528122957_lesson_chat_schema.sql:116-130` — `has_course_access` definition.
- `supabase/migrations/20260528140054_lesson_chat_rls.sql:88-127` — enrollments/messages RLS (course-gated SELECT, foreign-author INSERT rejection).
- `supabase/migrations/20260606140000_srs_review_state.sql:40-62`, `…/20260607100000_srs_question_state.sql:36-48`, `…/20260530220000_lesson_completions.sql:39-66` — own-only RLS for R2.
- `src/lib/services/tests.ts:27-92` — client read paths (table + RPCs; never reads options directly).
- `src/pages/api/tests/[testId]/submit.ts`, `src/pages/api/practice/[questionId]/grade.ts` — API routes call only definer RPCs.
- `supabase/seed.sql` — fixture ids (users, free course, test/questions/options answer key).
- `supabase/tests/rls_matrix.sql` — manual RLS probe (oracle reference to port from / supersede).
- `supabase/config.toml:10,29,209` — ports + email confirmations.
- `vitest.config.ts:16,19-22`, `package.json` (`test` script, `@supabase/supabase-js`), `.github/workflows/ci.yml:36` — harness separation points.
- `playwright.config.ts`, `e2e/test-taking.spec.ts:8-12` — local-stack-prereq precedent to mirror.

## Architecture Insights

- **Three distinct protection mechanisms, three distinct test shapes.** R1 = absence-of-policy invariant (probe the raw table + embed, not just the safe RPC). R2 = own-only USING/WITH-CHECK (probe the *denied cross-user* path, and a passing own path as control). R4 = a function-gated boolean that needs a *non-free fixture* to exercise at all (the free seed passes for everyone and proves nothing).
- **ENABLE-vs-FORCE is the load-bearing subtlety.** `question_options` is ENABLE-only *on purpose* so the `postgres`-owned definer fns can read `is_correct`; FORCE would block the owner and break grading. Every other table is FORCE for defense-in-depth. A test that asserts "raw `question_options` SELECT returns 0 rows for a learner" pins the invariant that a careless future migration could silently undo.
- **`messages` SELECT is course-scoped, not author-scoped** — the one place where "logged in ≠ owns the row" does NOT apply to reads. Getting this wrong in a test would produce a false assertion. The real message IDOR surface is INSERT (foreign author / seeded flag) and the absence of UPDATE/DELETE.
- **Definer fns gate twice**: they bypass RLS as owner but re-check `has_course_access` in their body. That dual gate is intentional and is itself worth a test (non-enrolled → `[]`/`no_access`).
- **Oracle independence**: the seed answer key (Q1→`…001`, Q2→`…004`+`…005`) is the hand-derived truth for R1/grading; never assert by re-reading `is_correct` through the same path under test.

## Historical Context (from prior changes)

- `context/archive/2026-06-06-learning-loop/` — introduced the tests schema, the ENABLE-not-FORCE answer-key invariant, and own-only attempt RLS. Source of R1/R2.
- `context/archive/2026-06-07-ai-answer-matching/` — `match_lesson_answers` course filter + `set_message_embedding` immutability (R5, Phase 2 — noted here only as the next gate that also calls `has_course_access`).
- `context/foundation/lessons.md` — the answer-key protection rule (enable-not-force + definer-owned fns) and [[feedback-no-db-reset]].

## Related Research

- `context/foundation/test-plan.md` §2 (risk map R1–R7), §3 (Phase 1), §5 (test layers) — this research grounds Phase 1.

## Open Questions

- **Cleanup robustness**: per-run unique-id fixtures + FK-ordered service_role delete is the recommended isolation. If a run aborts mid-way, cleanup must be idempotent (delete-by-prefix). Acceptable for Phase 1 (read-denial assertions mutate little); revisit `pg`-transaction isolation in Phase 2 (grading writes).
- **Embed probe shape**: the exact PostgREST embed string to attempt for R1(b) (e.g. `questions` → `question_options`) should be finalized in the plan — confirm whether PostgREST exposes the reverse relationship at all, since that determines whether the assertion is "errors" vs "returns no option rows".
- **rls_matrix.sql disposition**: port-then-delete vs port-then-keep-as-SQL-probe — decide in the plan (change.md leans "fold/replace where it overlaps").
