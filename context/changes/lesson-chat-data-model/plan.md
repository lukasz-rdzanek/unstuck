# Lesson & Chat Data Model Implementation Plan

## Overview

Establish the persistent foundation (roadmap F-01) for Unstuck's lesson-scoped chat: a
schema for **courses → lessons → messages**, an **operator-seed flag** that partitions
curated threads from peer posts, an **enrollment hook** for the future paid-learner role,
and **row-level security** that makes lesson content and chat reachable only by signed-in
learners with course access. This is a schema-only slice — three migrations, a seed
fixture, and shared TypeScript types. No application UI, no API routes, no realtime
client wiring. Getting the lesson-scoping + seed-flag + RLS shape right once here avoids
reworking the three downstream slices (S-01, S-02, S-03) that all consume it.

## Current State Analysis

- **App data is greenfield.** No `supabase/migrations/` directory and no `src/types.ts`
  exist yet — this slice creates the *first* migration and the shared-types file. Only
  the built-in `auth.users` table is in use (`context/foundation/roadmap.md:41`).
- **Auth substrate is live.** `src/lib/supabase.ts:9` builds an SSR client from the anon
  `SUPABASE_KEY`; `src/middleware.ts:11` resolves `auth.getUser()` and attaches it to
  `context.locals.user`. RLS will key off `auth.uid()` for that same user.
- **Env exposes only the anon key.** `astro.config.mjs` declares `SUPABASE_URL` and
  `SUPABASE_KEY` (anon) as server-only secrets. The service-role key is **not** in app
  env and stays out-of-band — it is the mechanism for operator seeding and FR-007 delete.
- **Conventions are firm.** `AGENTS.md`: RLS mandatory on every new table with granular
  per-operation, per-role policies; migrations named `YYYYMMDDHHmmss_*.sql` in
  `supabase/migrations/`; shared types in `src/types.ts`. Supabase CLI 2.98.2 is available;
  the `supabase` npm dep is `^2.23.4`.
- **No test framework.** Type-checking is `astro check` (`@astrojs/check` ^0.9.8); lint is
  `eslint .` (`npm run lint`); build is `astro build` (`npm run build`). Automated
  verification leans on migration apply + lint + type-check + build, not unit tests.

### Key Discoveries:

- RLS row-level granularity (not column-level) forces the read-boundary split: a publicly
  readable `lessons` row would leak `video_url` + `content_md`, so lessons must be gated
  to honor FR-004. Only `courses` is public (the catalog, FR-003).
- Supabase Realtime delivery **respects RLS** — subscribers receive only rows their SELECT
  policy admits. The messages SELECT policy must therefore be correct before S-02 relies on
  it; this is why the gated read is load-bearing even though no client subscribes yet.
- The PRD describes a paid-learner role but defers the paywall (Non-Goals). Modeling the
  access predicate as `is_free OR enrolled` now (with an empty `enrollments` table) means
  paid courses later just flip a flag and add rows — no RLS rewrite across three slices.

## Desired End State

After this plan: `supabase db reset` applies cleanly from a clean checkout, producing five
RLS-protected tables (`profiles`, `courses`, `lessons`, `enrollments`, `messages`), a
`has_course_access()` helper, a profiles signup trigger, the `messages` table joined to the
`supabase_realtime` publication, and a minimal seed fixture (one free course, one lesson,
one operator-seeded + one peer message). `src/types.ts` exports the domain entity and DTO
types, backed by generated `Database` types wired into the Supabase client, and `astro check`
+ `npm run build` pass. The **production** Supabase project at `rhcioqeawpbuylbmkxnr` has
the same migrations applied (seed-free; only `profiles` is backfilled for existing
`auth.users`), so deployed app code in S-01/S-02 reads/writes the same schema it builds
against locally. Verification: the RLS matrix in Phase 2 (anon reads catalog only;
authenticated reads free lessons/chat; peers insert only their own non-seed messages; seed
+ delete only via service-role) holds when exercised against the local stack, and the
linked-types sanity check in Phase 4 confirms no drift between local and prod.

## What We're NOT Doing

- **No UI** — no lesson page, no chat panel, no catalog page (S-01/S-02).
- **No API routes** — no `src/pages/api/**` endpoints; data access is planned in later slices.
- **No realtime client wiring** — channel subscription and live rendering are S-02. We only
  add the table to the publication so it's *ready*.
- **No operator/admin interface** — seeding and deletion are out-of-band via service-role.
- **No enrollment-creation flow** — the `enrollments` table ships empty; no self-enroll or
  payment path (deferred to v2 per Non-Goals).
- **No message edit/delete for peers** — only peer insert; removal is operator-only, out-of-band.
- **No full operator content** — the seed is a smoke fixture, not the launch's 5–10 messages/lesson.

## Implementation Approach

Three migrations in dependency order, plus a seed fixture and the types layer:

1. **Schema & structure** — all five tables, FKs/constraints/indexes, the
   `has_course_access()` helper, the profiles signup trigger + backfill, the realtime
   publication membership, and RLS **enabled with no policies** (a safe deny-all
   intermediate). After this migration the tables exist but return nothing to learners.
2. **RLS policies** — the granular per-operation, per-role policies that open exactly the
   intended access: public catalog read, gated lesson/chat read, peer-own-non-seed insert,
   profiles read + own-update. This is the security surface; it lands as its own migration
   so the deny-all → grant transition is auditable.
3. **Seed fixture & types** — `supabase/seed.sql` smoke fixture, generated `Database` types,
   curated `src/types.ts` domain/DTO types, and `<Database>`-typed Supabase client.

Splitting schema (1) from policies (2) into separate migrations keeps the
"enabled-but-deny-all then explicitly grant" model legible in version history, and lets
Phase 1's manual check confirm RLS is on *before* any policy widens access.

## Critical Implementation Details

- **RLS-enabled-without-policies is deny-all by design.** After Phase 1, querying
  `lessons`/`messages`/`enrollments` as an authenticated learner returns zero rows. That is
  correct, not a bug — Phase 2 is what grants access. Do not "fix" it by adding policies early.
- **`has_course_access()` must be `SECURITY DEFINER` with a fixed `search_path`.** It is
  called from inside the `lessons` and `messages` policies; defining it security-definer with
  `set search_path = public` (and `stable`) keeps it from tripping RLS recursion on the
  tables it reads and keeps the predicate evaluable in policy context.
- **`messages.author_id` is nullable with `ON DELETE SET NULL`.** Deleting a user must not
  cascade-delete their chat history; seeds reference the operator's own profile id. (Contrast
  with `lesson_id`/`course_id` FKs, which cascade — deleting a course removes its lessons and
  their messages.)
- **The service-role key bypasses RLS.** That is the *only* mechanism for inserting seeded
  messages (`is_seeded = true`) and for FR-007 deletion. No `SUPABASE_SERVICE_ROLE_KEY` is
  added to app env — it is used out-of-band (CLI/dashboard) by the operator.
- **Profiles backfill is required.** The signup trigger fires only for *new* `auth.users`.
  Any existing test accounts (from the auth verification on 2026-05-27) need profile rows
  inserted in the same migration, or later `messages.author_id` FK inserts for them fail.

## Phase 1: Schema & Structure

### Overview

Create all five tables with their relationships, constraints, and indexes; the access
helper; the profiles trigger + backfill; the realtime publication membership; and enable
(force) RLS on every table with no policies yet.

### Changes Required:

#### 1. Schema migration

**File**: `supabase/migrations/<ts>_lesson_chat_schema.sql`

**Intent**: Stand up the full relational shape for courses, lessons, lesson-scoped
messages, author profiles, and the (empty) enrollment hook, then lock every table behind
RLS in a deny-all state so access is opened deliberately in Phase 2.

**Contract**: Five tables —

- `profiles`: `id uuid PK references auth.users(id) on delete cascade`, `display_name text not null`, `created_at timestamptz not null default now()`.
- `courses`: `id uuid PK default gen_random_uuid()`, `slug text not null unique`, `title text not null`, `description text`, `is_free boolean not null default true`, `created_at timestamptz not null default now()`.
- `lessons`: `id uuid PK default gen_random_uuid()`, `course_id uuid not null references courses(id) on delete cascade`, `slug text not null`, `title text not null`, `position integer not null`, `video_url text not null`, `content_md text not null default ''`, `created_at timestamptz not null default now()`; `unique (course_id, slug)`, `unique (course_id, position)`.
- `enrollments`: `id uuid PK default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `course_id uuid not null references courses(id) on delete cascade`, `created_at timestamptz not null default now()`; `unique (user_id, course_id)`.
- `messages`: `id uuid PK default gen_random_uuid()`, `lesson_id uuid not null references lessons(id) on delete cascade`, `author_id uuid references profiles(id) on delete set null`, `body text not null check (char_length(body) between 1 and 4000)`, `is_seeded boolean not null default false`, `created_at timestamptz not null default now()`.

Indexes: `lessons(course_id)`; `messages(lesson_id, is_seeded, created_at)` — supports lesson-scoping plus the seed-pinned-then-chronological read S-02/FR-006 will issue (`order by is_seeded desc, created_at asc`). `enrollments(user_id)`.

Access helper:

```sql
create function public.has_course_access(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from courses c where c.id = p_course_id and c.is_free
  ) or exists (
    select 1 from enrollments e
    where e.course_id = p_course_id and e.user_id = auth.uid()
  );
$$;
```

Profiles trigger: a `security definer` `handle_new_user()` that inserts a `profiles` row on `auth.users` AFTER INSERT (deriving `display_name` from `raw_user_meta_data->>'display_name'`, falling back to the email local-part); plus a one-time backfill `insert into profiles (id, display_name) select id, ... from auth.users on conflict do nothing`.

RLS: `alter table … enable row level security` on all five tables (no policies — deny-all). Realtime: `alter publication supabase_realtime add table public.messages`.

### Success Criteria:

#### Automated Verification:

- [ ] Pre-flight: local Supabase stack is up — `npx supabase status` reports API and DB running (start with `npx supabase start` if not; requires Docker daemon running)
- [ ] Migration applies cleanly: `npx supabase db reset`
- [ ] SQL lints clean: `npx supabase db lint`
- [ ] All five tables exist with RLS enabled (e.g. `select relname, relrowsecurity from pg_class where relname in ('profiles','courses','lessons','enrollments','messages')` shows `relrowsecurity = true`)

#### Manual Verification:

- [ ] In Studio, the FK graph matches the contract (cascade on lesson/course, set-null on message author)
- [ ] With RLS on and no policies, an authenticated query against `lessons`/`messages` returns zero rows (deny-all confirmed)
- [ ] `messages` appears in the `supabase_realtime` publication (`select * from pg_publication_tables where pubname='supabase_realtime'`)

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the deny-all state and schema shape are as expected before adding policies in Phase 2.

---

## Phase 2: RLS Policies

### Overview

Add the granular per-operation, per-role policies that open exactly the intended access,
moving each table from deny-all to its real security posture. This is the load-bearing
privacy surface (PRD NFR).

### Changes Required:

#### 1. RLS policy migration

**File**: `supabase/migrations/<ts>_lesson_chat_rls.sql`

**Intent**: Grant the minimum read/write each role needs — public catalog browsing, gated
lesson + chat reading, peer self-posting of non-seed messages — while leaving seeding,
deletion, and all course/lesson management to the service-role (out-of-band).

**Contract**: Per-table policies (Postgres `create policy`, one per operation/role) —

- `courses`: `SELECT` to `anon, authenticated` `using (true)` — the public catalog. No write policies.
- `profiles`: `SELECT` to `authenticated` `using (true)` (author display names); `UPDATE` to `authenticated` `using (id = auth.uid()) with check (id = auth.uid())`. No public INSERT (trigger handles it).
- `lessons`: `SELECT` to `authenticated` `using (has_course_access(course_id))`. No write policies.
- `enrollments`: `SELECT` to `authenticated` `using (user_id = auth.uid())`. No write policies (service-role provisions paid access later).
- `messages`:
  - `SELECT` to `authenticated` `using (has_course_access((select course_id from lessons l where l.id = lesson_id)))`.
  - `INSERT` to `authenticated` `with check (author_id = auth.uid() and is_seeded = false and has_course_access((select course_id from lessons l where l.id = lesson_id)))`.
  - No `UPDATE`/`DELETE` policies — seed + delete are service-role only.

#### 2. RLS verification SQL

**File**: `supabase/tests/rls_matrix.sql`

**Intent**: Mechanically verify the load-bearing access matrix so policy drift is caught before S-02 relies on it (Supabase Realtime obeys SELECT policy — a wrong policy silently leaks or hides chat). Manual checks below skim; this file asserts.

**Contract**: A single SQL file exercising four role contexts via `set local role` and `set local request.jwt.claim.sub` against the post-migration fixture (one free course, one lesson, the operator-seeded + peer messages from `seed.sql`). For each cell, a `do $$ begin if … then raise exception '<which assertion failed>' end if; end $$` block:

- **anon**: SELECT on `courses` returns ≥ 1 row; SELECT on `lessons` / `messages` / `enrollments` returns 0 rows.
- **authenticated, free course** (the peer's `auth.users.id`): SELECT on `lessons` and `messages` returns ≥ 1 row; INSERT a non-seed `messages` row authored by `auth.uid()` succeeds; INSERT with `is_seeded = true` raises a policy violation; INSERT with a foreign `author_id` raises a policy violation.
- **authenticated, no access**: SELECT on `lessons` / `messages` for a course where `is_free = false` and the user has no enrollment row returns 0 rows.
- **service_role**: INSERT with `is_seeded = true` succeeds; DELETE of any message succeeds (RLS bypassed).

Runnable as `psql "$(npx supabase status --output=env | grep DB_URL | cut -d= -f2)" -f supabase/tests/rls_matrix.sql`. Exits non-zero on any failed assertion. No new tooling; no test framework required.

### Success Criteria:

#### Automated Verification:

- [ ] Migration applies cleanly: `npx supabase db reset`
- [ ] SQL lints clean: `npx supabase db lint`
- [ ] Expected policy set is present (e.g. `select tablename, policyname, cmd from pg_policies where schemaname='public'` lists the policies above and no others)
- [ ] RLS matrix passes: `psql <local-db-url> -f supabase/tests/rls_matrix.sql` exits 0 (all four role-cells assert)

#### Manual Verification:

- [ ] As `anon`: `courses` readable; `lessons` and `messages` return nothing
- [ ] As an authenticated user on a free course: `lessons` and `messages` readable
- [ ] Authenticated insert of an own, non-seed message succeeds; insert with `is_seeded = true` or a different `author_id` is rejected
- [ ] A `service_role` connection can insert a seeded message and delete any message (RLS bypassed)

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the full RLS matrix behaves as specified before seeding data in Phase 3.

---

## Phase 3: Seed Fixture & Types

### Overview

Ship a minimal smoke fixture that exercises the schema, the seed-flag partition, and the
ordered read end-to-end, then generate and curate the TypeScript types the codebase and
downstream slices will import.

### Changes Required:

#### 1. Seed fixture

**File**: `supabase/seed.sql`

**Intent**: Prove the model with the smallest realistic dataset — one free course, one
lesson with a real external video URL + markdown, and two messages (one operator-seeded,
one peer) so the seed-pinned-then-chronological ordering and the `is_seeded` partition are
demonstrable immediately.

**Contract**: Insert one `courses` row (`is_free = true`), one `lessons` row under it, and
two messages. Messages require author profiles, which require `auth.users` rows: insert two
fixed-UUID `auth.users` rows (one operator, one peer) so the signup trigger creates their
profiles, then insert one `is_seeded = true` message authored by the operator and one
`is_seeded = false` message authored by the peer. Confirm `supabase/config.toml` `[db.seed]`
runs `seed.sql` on reset.

#### 2. Generated database types

**File**: `src/lib/db/database.types.ts`

**Intent**: A type source-of-truth generated from the live schema so app code and DTOs stay
in lockstep with migrations.

**Contract**: Output of `npx supabase gen types typescript --local > src/lib/db/database.types.ts` — exports a `Database` type. Regenerated whenever migrations change (a verification step, below, asserts it is in sync).

#### 3. Shared domain types

**File**: `src/types.ts`

**Intent**: The project's canonical entity + DTO surface (per `AGENTS.md`), aliasing the
generated Row types into friendly domain names and defining the DTOs downstream slices use.

**Contract**: Export `Profile`, `Course`, `Lesson`, `Enrollment`, `Message` as aliases of the
generated `Database['public']['Tables'][...]['Row']` types, plus DTOs — e.g. `NewMessage`
(the peer-insert shape: `lesson_id`, `body`), and a `LessonChatMessage` view type for the
ordered read. Do not hand-redefine column shapes; derive from `Database`.

#### 4. Typed Supabase client

**File**: `src/lib/supabase.ts`

**Intent**: Flow schema types through the SSR client so queries are type-checked.

**Contract**: Parameterize `createServerClient<Database>(...)` with the generated `Database`
type. Signature/behavior otherwise unchanged.

### Success Criteria:

#### Automated Verification:

- [ ] Seed applies on a clean reset: `npx supabase db reset` (loads `seed.sql` without error)
- [ ] Generated types are in sync: re-running `npx supabase gen types typescript --local` produces no diff against `src/lib/db/database.types.ts`
- [ ] Type-check passes: `npx astro check`
- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`

#### Manual Verification:

- [ ] Querying the seeded lesson's messages ordered `by is_seeded desc, created_at asc` returns the operator-seeded message first, then the peer message
- [ ] Importing `Message` / `NewMessage` from `src/types.ts` in a scratch file type-checks against a sample query result

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the seeded chat reads in the correct order and the types are usable before considering the foundation complete.

---

## Phase 4: Deploy to Production Supabase

### Overview

Apply the schema and policy migrations (Phases 1 + 2) to the production Supabase project at `rhcioqeawpbuylbmkxnr.supabase.co` so the deployed Worker can read/write the model. The local seed fixture from Phase 3 is **local-only** and does NOT propagate to prod — seeding production with real lesson content is an out-of-band operator task (per the model), not F-01's concern. This phase closes the local↔prod schema gap before S-01 needs it.

### Changes Required:

#### 1. Link + push migrations to production

**Intent**: One-time linkage of the local repo to the production Supabase project, then push the migrations from `supabase/migrations/` to the cloud database. Idempotent on re-run.

**Contract**:

- `npx supabase link --project-ref rhcioqeawpbuylbmkxnr` — one-time setup; authenticates via existing Supabase session and records the link in `supabase/.temp/`. Re-running is a no-op.
- `npx supabase db push` — applies all migrations in timestamp order against the linked remote. Idempotent: re-running shows "Remote database is up to date."
- Migrations are additive (CREATE TABLE / CREATE POLICY / CREATE FUNCTION); no destructive operations against existing remote data (auth.users untouched).
- Production stays seed-free: `supabase db push` does NOT run `seed.sql`. The two test accounts already in prod auth.users (`test@example.com`, `prod-test@example.com`) get profile rows via the trigger + backfill from Phase 1's migration applied here.

### Success Criteria:

#### Automated Verification:

- [ ] `npx supabase db push` exits 0 (or reports "Remote database is up to date" on re-run)
- [ ] `npx supabase gen types typescript --linked` produces output identical to the local-generated `database.types.ts` (no schema drift between local and prod)

#### Manual Verification:

- [ ] In Supabase Studio for the prod project (rhcioqeawpbuylbmkxnr): all five tables exist with RLS enabled
- [ ] Querying prod as `service_role`: `lessons`, `messages`, `enrollments` are empty; `profiles` contains rows for the two existing test users (created by the backfill)
- [ ] The deployed Worker at `https://unstuck.lukasz-rdzanek.workers.dev/auth/signup` still returns 200 (auth.users untouched, trigger fires on the next signup to create a profile)

**Implementation Note**: After this phase, prod schema matches local. F-01 is complete. Seeding prod with real lesson content is the operator's out-of-band task, not part of this slice.

---

## Testing Strategy

No unit-test framework exists in the repo; verification is migration-, type-, and
policy-driven.

### Schema & migration:

- `npx supabase db reset` applies all three migrations + seed from clean, repeatably.
- `npx supabase db lint` reports no errors.

### RLS (the load-bearing surface):

- Exercise the access matrix per Phase 2 manual checks using three connection roles:
  `anon`, an `authenticated` learner (via a signed-in session / `set role`), and
  `service_role`. Confirm each cell of the matrix (catalog public; lessons/chat gated;
  peer own-non-seed insert only; seed + delete service-role only).

### Types:

- `npx supabase gen types` diff-clean against the committed `database.types.ts`.
- `npx astro check` + `npm run build` confirm the types compile and the app still builds.

### Manual Testing Steps:

1. From a clean checkout, run `npx supabase db reset` and confirm all migrations + seed apply.
2. Walk the RLS matrix (Phase 2 manual checks) against the local stack.
3. Run the ordered messages query for the seeded lesson; confirm seed-then-peer ordering.
4. Run `npx astro check && npm run build`.

## Performance Considerations

At MVP scale (`target_scale: small`), no performance concern. The
`messages(lesson_id, is_seeded, created_at)` composite index covers the only hot read
(scoped, seed-pinned, chronological). `has_course_access()` is `stable` so the planner can
cache it within a statement.

## Migration Notes

- This is the project's first migration set; it creates `supabase/migrations/` and
  `supabase/seed.sql`.
- **Schema rollback is a separate Supabase concern** from Worker rollback (see
  `context/foundation/infrastructure.md` — `wrangler rollback` does not revert migrations).
  Each migration is additive; to revert, write a down-migration or `db reset` against a
  prior state.
- Backfill in Phase 1 must run before any `messages` insert references an existing test user.

## References

- Roadmap item: `context/foundation/roadmap.md` → F-01 (`context/foundation/roadmap.md:48`)
- PRD privacy NFR + FR-006 + Business Logic + Access Control: `context/foundation/prd.md:84`, `context/foundation/prd.md:95`, `context/foundation/prd.md:108`
- Auth substrate RLS keys off: `src/lib/supabase.ts:9`, `src/middleware.ts:11`
- Conventions (RLS, migrations, types): `AGENTS.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema & Structure

#### Automated

- [x] 1.1 Pre-flight: `npx supabase status` reports API + DB running (Docker daemon up; `supabase start` if needed) — ad8301d
- [x] 1.2 Migration applies cleanly: `npx supabase db reset` — ad8301d
- [x] 1.3 SQL lints clean: `npx supabase db lint` — ad8301d
- [x] 1.4 All five tables exist with RLS enabled — ad8301d

#### Manual

- [x] 1.5 FK graph matches contract (cascade on lesson/course, set-null on message author) — ad8301d
- [x] 1.6 Deny-all confirmed — authenticated query on lessons/messages returns zero rows — ad8301d
- [x] 1.7 `messages` present in `supabase_realtime` publication — ad8301d

### Phase 2: RLS Policies

#### Automated

- [x] 2.1 Migration applies cleanly: `npx supabase db reset` — c9e25df
- [x] 2.2 SQL lints clean: `npx supabase db lint` — c9e25df
- [x] 2.3 Expected policy set present (and no others) in `pg_policies` — c9e25df
- [x] 2.4 RLS matrix passes: `psql <local-db-url> -f supabase/tests/rls_matrix.sql` exits 0 — c9e25df

#### Manual

- [x] 2.5 As anon: courses readable; lessons + messages return nothing — covered by rls_matrix `[anon]` cell, c9e25df
- [x] 2.6 As authenticated on a free course: lessons + messages readable — covered by rls_matrix `[auth-free]` cell, c9e25df
- [x] 2.7 Peer own non-seed insert succeeds; `is_seeded=true` or foreign `author_id` rejected — covered by rls_matrix `[auth-free]` INSERT cells, c9e25df
- [x] 2.8 service_role can insert a seeded message and delete any message — covered by rls_matrix `[service_role]` cell, c9e25df

### Phase 3: Seed Fixture & Types

#### Automated

- [x] 3.1 Seed applies on clean reset: `npx supabase db reset` — 9b4960e
- [x] 3.2 Generated types in sync (re-run `gen types` produces no diff) — 9b4960e (CLI 2.98.2 quirk: strip "Connecting to db" stdout line via `grep -v` before writing)
- [x] 3.3 Type-check passes: `npx astro check` — 9b4960e (0 errors, 0 warnings)
- [x] 3.4 Lint passes: `npm run lint` — 9b4960e (database.types.ts ignored in eslint.config.js + .prettierignore)
- [x] 3.5 Build passes: `npm run build` — 9b4960e

#### Manual

- [x] 3.6 Seeded lesson messages ordered `is_seeded desc, created_at asc` → operator first, peer second — 9b4960e (SQL probe confirmed via docker exec psql)
- [x] 3.7 `Message` / `NewMessage` from `src/types.ts` type-check against a sample query — 9b4960e (scratch file with Message/NewMessage/LessonChatMessage shapes passed `astro check`)

### Phase 4: Deploy to Production Supabase

#### Automated

- [ ] 4.1 `npx supabase db push` exits 0 (or "Remote database is up to date")
- [ ] 4.2 `npx supabase gen types typescript --linked` matches local `database.types.ts` (no drift)

#### Manual

- [ ] 4.3 Prod Studio (rhcioqeawpbuylbmkxnr): all 5 tables exist with RLS enabled
- [ ] 4.4 As service_role on prod: lessons/messages/enrollments empty; profiles has 2 rows (test@/prod-test@ from backfill)
- [ ] 4.5 Deployed Worker `/auth/signup` still returns 200 (auth.users untouched)
