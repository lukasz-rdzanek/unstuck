---
artifact: test-plan
project: Unstuck
created: 2026-06-07
updated: 2026-06-07
test_base_profile: growing
status: rolling-out
---

# Unstuck — Phased Test Rollout

> Blueprint + live status for growing Unstuck's test suite beyond the `testing-baseline` minimum (5 unit tests + 1 e2e). Each phase opens its own `context/changes/<id>/` and runs research → plan → implement. `/10x-test-plan` re-derives state from disk and resumes at the next pending phase. Re-run `/10x-test-plan --status` for a snapshot.

## §1 Strategy & principles

1. **Cost × signal.** Every test must answer: *what is the cheapest test that gives a real signal for this risk?* Prefer integration over e2e when integration catches the regression; prefer a hermetic stub-client unit over integration when no DB behavior is under test. Don't promote to e2e because it "feels safer."
2. **User concerns are evidence.** Risks the team has lived through (the `db reset` that wiped local auth; localhost baked into the prod bundle; the answer-key invariant) carry the same weight as PRD lines.
3. **Risks are scenarios, not code locations.** This plan names *failure scenarios* and cites *evidence* (PRD/archive lines, interview answers, hot-spot directories). It never asserts which file owns a failure — that anchor is `/10x-research`'s output, produced per rollout phase. Treat any `file:line` in this doc as a defect to fix.
4. **Oracle independence.** A test's expected value must come from the requirement/contract/interview — never copied from the implementation under test. The answer-key and grading tests assert *product behavior* ("a learner can never see `is_correct`"; "all-or-nothing scoring"), not the current SQL.

Two pillars for this rollout (user-directed):
- **Integration tests on a local Supabase stack** — exercise RLS policies + `SECURITY DEFINER` functions for real (`has_course_access`, `submit_test_attempt`, `match_lesson_answers`, `set_message_embedding`, `grade_question`).
- **Hermetic tests with a stubbed Supabase client** — services + API routes, no network: validation, error-degradation, operator gating, best-effort posture.

## §2 Risk map

Impact × Likelihood on a coarse High/Med/Low scale. Source column is **evidence, not anchors**.

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence) |
|---|---|---|---|---|
| R1 | A learner reads the quiz answer key (`question_options.is_correct`) via direct REST or a PostgREST embed | High | Med | `context/foundation/lessons.md` (answer-key invariant); archive `2026-06-06-learning-loop` |
| R2 | Cross-user (IDOR): user A reads or writes user B's test attempts, chat messages, SRS state, or completions | High | Med | own-only RLS (archive `learning-loop`, `lesson-completion-tracking`); interview Q2 (security lens = first-class) |
| R3 | Quiz grading wrong — `submit_test_attempt` all-or-nothing / sorted-set equality / single-vs-multi / zero-correct / cross-question ids | High | Med | archive `2026-06-06-learning-loop`; hot-spot `src/lib/services`, `supabase/migrations` (13 commits/30d) |
| R4 | `has_course_access` bypass — gated/paid-course content reachable by a non-enrolled user | High | Low (today: all courses free) / Med (future) | `lessons.md`; roadmap `## Blocked` gated-course cluster |
| R5 | answer-matching leaks across courses, or `set_message_embedding` mutates a message body (immutability breach) | Med | Med | archive `2026-06-07-ai-answer-matching` (impl-review F1/F2) |
| R6 | Service/API contract regressions — zod validation, error-degradation to `{match:null}`, operator gating on the backfill endpoint, best-effort schedule | Med | Med | hot-spot `src/lib/services` (16/30d), `src/pages/api/auth` (13/30d) |
| R7 | Auth open-redirect / session route-gating regression | Med | Low | archive `2026-05-30-signup-email-confirmation`; hot-spot `src/pages/auth`, `src/pages/api/auth` |

### Risk Response Guidance

| # | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| R1 | An authenticated non-operator client gets **zero** `is_correct` from every read path (direct table select, embed/join, the taking RPC) | "no authenticated SELECT policy" stays true — a future migration could add one | the exact RLS posture of `question_options` (enable-not-force, no auth SELECT) + which RPCs return options | integration (local Supabase, authed REST + RPC) | asserting via the definer fn only; must also probe the raw table + embed |
| R2 | A second user's session cannot SELECT/UPDATE another user's rows in `test_attempts`/`attempt_answers`/`messages`/`srs_*`/`lesson_completions` | "logged in" ≠ "owns the row"; FORCE-RLS owner-bypass nuance | the own-only policies + that definer writes are the only write path | integration (two seeded users) | testing only the happy own-row path; must assert the denied cross-user path |
| R3 | Scores match an **independent** truth table (hand-computed expected per answer set), incl. multi-correct, partial, empty, zero-correct, foreign option ids | "final status 200 ⇒ graded right"; set-equality vs subset | grading inputs/outputs of `submit_test_attempt`; attempt + per-question rows written | integration (local Supabase, RPC) | oracle copied from the SQL; happy-path single-correct only |
| R4 | A non-enrolled user on a non-free course gets `[]`/denied from lessons/messages/tests + the match RPC | "all courses are free so it's fine" — must create a gated course fixture | `has_course_access` semantics (free OR enrolled) | integration (gated-course fixture) | only testing the free-course path (which passes for everyone) |
| R5 | A match never returns a row from another course; `set_message_embedding` changes only `embedding`, only when NULL, never `body`/`author_id` | "definer fn = safe"; cross-course join leak | the match RPC's course filter + the writer's null-only/column-scope | integration (local Supabase) | trusting the column scope without an attempt to overwrite body |
| R6 | Routes return the right `{ok}`/`{error}` + status for bad input, unauth, non-operator, and a failing dependency (degrade, never 500 the chat) | "happy path returns 200 ⇒ done"; over-mocking internals | the request/response contract of each route + the stub seam (createClient / env / Workers AI) | hermetic (stubbed client/binding) | mocking so much the test asserts the mock, not the handler |
| R7 | `isSafeNext` rejects `//`, `/\`, absolute URLs (unit ✓); middleware redirects unauth off protected routes; signin maps errors to the right redirect | "form posts work ⇒ gating works" | middleware's protected-route list + redirect contract | unit (done) + hermetic route test | re-testing the regex only; ignoring the middleware gate |

## §3 Phased rollout

> Status vocabulary (parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`. The orchestrator overwrites Status + Change-folder cells; the rest is frozen until `--refresh`.

| # | Phase | Goal (protection proven) | Risks | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Access-control & answer-key integration | A learner can never see the answer key or another user's data; gated courses deny non-enrolled | R1, R2, R4 | integration (local Supabase, multi-user + gated-course fixtures) | complete | context/changes/testing-access-control-rls/ |
| 2 | Grading & SRS integration | Quiz scores match an independent oracle; SRS scheduling + message-embedding immutability hold | R3, R5, R2 (attempts/SRS own-only) | integration (local Supabase, RPC) | complete | context/changes/testing-grading-srs-integration/ |
| 3 | Hermetic service/API tests | Services + API routes honor their contracts (validation, auth/operator gating, graceful degradation) without a network | R6, R7, R5 (match endpoint) | hermetic unit (stubbed Supabase client + Workers AI binding) | complete | context/changes/testing-hermetic-service-api/ |
| 4 | CI integration + Stryker mutation testing | The new tests run in CI; mutation testing grades their quality against a threshold | quality gate over R1–R7 | CI wiring (local Supabase in CI / test DB) + Stryker mutation testing | not started | — |

**Order rationale:** security-critical, lived-incident risks first (R1/R2/R4 — the answer-key lesson); then correctness of money-equivalent grading + immutability (R3/R5); then cheap hermetic coverage of the service/API contracts (R6/R7); finally lock quality with CI integration + Stryker (mutation score proves the tests above actually catch regressions, not just raise coverage).

## §4 Stack & test infra

- **Runners:** Vitest (unit/hermetic, `vitest.config.ts` — node env, `@/*` alias, `cloudflare:workers` stub) + Playwright (`playwright.config.ts`, e2e, local-only). Scripts: `test`, `test:watch`, `test:e2e`.
- **Existing tests:** `src/lib/{srs,video-embed,safe-next,embeddings}.test.ts` (13 unit, `npm run test`) + `e2e/test-taking.spec.ts` + the **Phase 1 integration suite** `tests/integration/*.itest.ts` (`npm run test:integration`, local stack required). The old manual `supabase/tests/rls_matrix.sql` probe was ported into the integration suite and removed.
- **Local Supabase:** Docker stack via `npx supabase start` (DB on `:54322`, REST on `:54321`). Integration tests run against it (REST as authenticated via gotrue tokens, or psql via the `supabase_db_*` container). NEVER `supabase db reset` ([[feedback-no-db-reset]]); use `migration up`.
- **CI/CD:** `.github/workflows/ci.yml` runs lint + test + build on push/PR and auto-deploys on merge (`auto-deploy`). Integration tests are NOT in CI yet → Phase 4 wires them (needs a Supabase service/test DB in CI) + adds Stryker.

**Stack grounding tools (current session):**
- Docs: Context7 (HTTP MCP, added this session) — for Vitest/Stryker/Supabase-local testing APIs; checked: 2026-06-07.
- Search: Exa.ai (web_search/web_fetch) — for current Supabase-local-testing + Stryker-for-Vitest guidance; checked: 2026-06-07.
- Runtime/browser: Playwright (installed dep, local) — e2e layer; not an MCP this session.
- Provider/platform: Supabase CLI (local stack) + GitHub (`gh`, for CI) — available; Linear MCP present.

## §5 Test layers & conventions

- **Unit (Vitest, node):** pure logic; no DB/network. Lives next to source as `*.test.ts`.
- **Hermetic (Vitest, node):** services + API route handlers with a **stubbed Supabase client** (and stubbed `cloudflare:workers` `env.AI`). Assert request→response contracts, error degradation, gating. No `:54321`.
- **Integration (Vitest, against local Supabase):** RLS + definer functions for real. Multi-user fixtures (operator + two learners), gated-course fixture. Set up/tear down in a transaction or per-test cleanup; never mutate seed in a way that breaks `npm run dev`.
- **E2E (Playwright, local-only):** one main user flow (take-a-test). Not in CI.
- **Oracle rule:** integration assertions compare against hand-derived truth, not the SQL output.

## §6 Cookbook (filled as phases ship)

- **Integration: multi-user RLS / answer-key probe** — SHIPPED (Phase 1, change `testing-access-control-rls`). Harness lives in `tests/integration/`; run with `npm run test:integration` (local stack must be up: `npx supabase start`). `npm run test` stays unit-only/hermetic. Recipe:
  - **Env**: `tests/integration/setup/supabase-env.ts` shells `npx supabase status -o json` and returns `{ url, anonKey, serviceRoleKey }` (nothing secret committed). `global-setup.ts` fails fast with a readable message if the stack is down.
  - **Clients** (`setup/clients.ts`): `serviceClient()` (service_role — setup/teardown ONLY, bypasses RLS, never the client under assertion), `anonClient()` (anon role), `authedClientFor(email,password)` (real GoTrue password grant → JWT-carrying client = the RLS path under test). Build clients from `@supabase/supabase-js` directly; never import `src/lib/supabase.ts` (it reads `astro:env`).
  - **Fixtures** (`setup/fixtures.ts`): `createRunFixture(runId)` mints two login-capable learners (`auth.admin.createUser({email_confirm:true})`) + a gated (`is_free=false`) course graph + enrolls one. Data-row ids are deterministic per `runId`; user **emails are unique per invocation** because the local GoTrue `admin.listUsers` is broken ("Database error finding users" on the sparse seed accounts) — so cleanup deletes users by captured id, never by lookup. `cleanup(runId, users)` deletes the gated course (FK-cascades its graph) + the users (cascades their own-only rows on any course). **Never `supabase db reset`.**
  - **Oracle**: assert against hand-derived truth (the seed answer key Q1→`f3…001`, Q2→`f3…004/005`; the ownership/enrollment contract) — never re-read `is_correct` through the path under test.
  - **Prove-it-fails**: because the code is already correct, each risk test is shown able to fail — temporarily break the invariant (add an `authenticated` SELECT policy via `docker exec supabase_db_<project> psql`; invert an assertion; or enroll the outsider) → red → revert. Demonstrated for R1/R2/R4.
  - **Files**: `answer-key.itest.ts` (R1), `idor.itest.ts` (R2), `course-access.itest.ts` (R4), `role-matrix.itest.ts` (anon + ported cells), `smoke.itest.ts`. The old `supabase/tests/rls_matrix.sql` (`set role` probe) was ported into these and removed.
- **Integration: definer-fn grading oracle + crafted-vector matching** — SHIPPED (Phase 2, change `testing-grading-srs-integration`). Reuses the Phase 1 harness; the fixture builder (`setup/fixtures.ts`) gained Phase-2 data (a zero-correct test, two embedded-message courses, NULL + pre-set embedding messages, a `vec768()` helper). Recipes:
  - **Grading truth table (R3)**: call `rpc('submit_test_attempt', { p_test_id, p_answers })` where `p_answers` is `{ [questionId]: optionId[] }`. Oracle = a hand-computed table on the seed quiz `f1…001` (threshold 0.50): both-correct→1.0, partial/superset/foreign-id/single→0.5, empty→0.0. Assert the RPC return AND the persisted rows (`test_attempts.score/passed`, `attempt_answers.is_correct/selected_option_ids` — read back as the learner; RLS own-only). Cover the **zero-correct guard** with a question whose options are all `is_correct=false` (never correct). Selected ids are filtered to the question and compared as **sorted sets** (order-independent). See `grading.itest.ts`.
  - **Crafted vectors (R5, no Workers AI)**: `match_lesson_answers`/`set_message_embedding` take a `vector(768)` arg, so build a literal `"[f0,…,f767]"` (the `vec768(...components)` helper) instead of calling Workers AI. `match_lesson_answers` similarity = cosine, so near-axis vectors give controlled cosines (`[1,0,…]` vs `[1,0.75,0,…]` → 0.8). **Fixture footgun:** an embedded message `body` must be ≥ 40 chars or the match RPC silently drops it. Pass a nil uuid (`00000000-…0`) for `p_exclude_author`/`p_exclude_message_id` to mean "no exclusion" (matches no real row). See `match-isolation.itest.ts`.
  - **Cross-course fence (R5a)**: put a more-similar "trap" message in a *different* course; `match(courseA)` must return courseA's message only, never the trap (the fence runs before ranking). Pair with a same-call premise check (`trapSim > courseASim`) so the test proves the fence prevents a real higher-ranked leak.
  - **Embedding immutability (R5b)**: snapshot the message row before/after `set_message_embedding`; assert only `embedding` changed, only from NULL (no overwrite), only the target row. **F1 boundary:** assert ONLY the SQL guarantee — do NOT assert cross-course write-denial (no per-call access gate exists today). Drive the RPC as a plain authenticated user (the grant allows it). See `embedding-immutability.itest.ts`.
  - **SRS scheduling is NOT here** — `grade_question` is read-only; FSRS scheduling lives in Astro handlers, so the write-path is deferred to Phase 3 (hermetic). FSRS math is unit-tested (`src/lib/srs.test.ts`); `srs_*` own-only RLS is covered by Phase 1's `idor.itest.ts`.
- **Hermetic: stubbed Supabase client + route handlers** — SHIPPED (Phase 3, change `testing-hermetic-service-api`). Co-located `src/pages/api/**/*.test.ts` + `src/middleware.test.ts`, running in the **unit** project (`npm run test`, CI-safe, no Docker/network). Recipes:
  - **The seam**: `vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }))`. Every route gets its client via `createClient(...)`, so mocking that module both supplies a fake client AND prevents the real module's `astro:env/client` import from loading — no `astro:env` alias needed (the unit-config tripwire stays intact for non-route tests). For routes importing `astro:env/server` directly (backfill), add `vi.mock("astro:env/server", () => holder)` — verified to register on the bare virtual specifier; use a `vi.hoisted` holder (with a return-type annotation, e.g. `(): { OPERATOR_USER_ID: string \| undefined } =>`, so auto-format doesn't strip it) to vary it per test. Mock `@/lib/embeddings` (or set the stubbed `cloudflare:workers` `env.AI`) for the embedding routes; `vi.mock("astro:middleware", () => ({ defineMiddleware: (fn) => fn }))` to import middleware.
  - **Harness** (`src/test/harness/`): `makeApiContext({ method, url, body|formData, headers, user, params })` builds the thin `APIContext` slice handlers read (`request`, `locals.user`, `params`, `url`, `cookies`, a `redirect` that returns a `Response` with a `Location` header) cast `as unknown as APIContext`. `makeFakeSupabase({ auth, rpc, tables })` returns `{ client, writes, rpcCalls }` — a chainable/thenable fake that captures `.upsert/.insert/.delete` payloads (for "capture-the-upsert-payload" assertions) and routes `.rpc(name,args)` by name. Construct one fake per test, set `vi.mocked(createClient).mockReturnValue(fake.client)`, then assert `fake.writes`.
  - **Oracle = the contract, not the mock**: assert status + body shape + redirect `Location` + which branch ran. Cross-cutting `it.each` over JSON routes: no user→401, missing param→`missing_*`/400, bad body→`invalid_json`/400, `createClient`→null→`supabase_not_configured`/500. **Posture asymmetry** is the real R6 surface: match-answer/submit/grade SWALLOW dependency failures (still 200), rate/backfill-list/grade-RPC are FATAL (500) — pin which way each fails.
  - **R7 = wiring, not the regex**: `isSafeNext` is already unit-covered (`safe-next.test.ts`) — don't duplicate. Test the signin open-redirect SINK (`next=//evil`→`/`, the mutation-survivable line) and the middleware gate (unauth+protected→redirect with `next`). `isProtectedRoute` is exported for a pure boundary test.
  - **SRS hermetic = branch + binding, not FSRS math** (math is in `srs.test.ts`): `vi.mock("@/lib/srs", async (orig) => ({ ...(await orig()), applyRating: vi.fn((await orig()).applyRating) }))` to spy the rating; capture the upsert payload to assert the enrol branch (submit: correct-first-timer → no upsert) + session→user_id binding.
  - **Files**: `match-answer.test.ts`, `backfill.test.ts`, `resend.test.ts`, `route-contracts.test.ts`, `signin.test.ts`, `middleware.test.ts`, `submit/grade/rate.test.ts`, `src/test/harness/*`.
- **CI integration + Stryker** — TBD (Phase 4): running integration tests in CI + the mutation-score config/threshold.

## §7 Negative space (explicitly NOT tested)

- **Visual/snapshot of marketing/landing + cosmic UI** (theme, particles, scrollbars) — brittle, low signal (user-directed).
- **Generated DB types** (`src/lib/db/database.types.ts`) + operator **seed scripts** — the generator/operator is the test.
- **10x skill prompts + `context/` docs** — not app behavior.
- **Realtime websocket latency** (sub-2s delivery as a timed assertion) — flaky; cover the insert→read **data path** instead, not the timing.
