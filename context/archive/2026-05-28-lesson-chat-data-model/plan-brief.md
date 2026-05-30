# Lesson & Chat Data Model — Plan Brief

> Full plan: `context/changes/lesson-chat-data-model/plan.md`

## What & Why

The persistence + security foundation (roadmap F-01) for Unstuck's lesson-scoped chat: a
schema for courses, lessons, and lesson-scoped messages, with an operator-seed flag
partitioning curated threads from peer posts, and row-level security enforcing that lesson
content and chat are reachable only by signed-in learners with course access. Sequenced
first because all three downstream chat slices (S-01, S-02, S-03) consume it — getting the
shape right once avoids reworking three slices.

## Starting Point

App data is greenfield: no `supabase/migrations/` directory and no `src/types.ts` exist —
only the built-in `auth.users` table. Auth is live (SSR client + middleware attach the user
to `context.locals.user`), and RLS will key off that same `auth.uid()`.

## Desired End State

`supabase db reset` applies cleanly, producing five RLS-protected tables (`profiles`,
`courses`, `lessons`, `enrollments`, `messages`), a `has_course_access()` helper, a profiles
signup trigger, the `messages` table joined to the realtime publication, and a minimal seed
fixture. `src/types.ts` exports the domain/DTO types backed by generated `Database` types, and
`astro check` + `npm run build` pass. No UI, no API, no realtime client wiring.

## Key Decisions Made

| Decision                  | Choice                                          | Why (1 sentence)                                                                 | Source |
| ------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| Chat-read access model    | `is_free OR enrolled` predicate + empty `enrollments` table | Locks in the final RLS predicate now; paid courses later flip a flag, no rewrite. | Plan   |
| Operator-seed / identity  | `is_seeded` boolean; no DB operator role        | Matches FR-006 partition + "no admin infra"; service-role key handles seed/delete. | Plan   |
| Author identity           | `public.profiles` table (signup trigger)        | Clean author display without exposing auth.users/email; home for future role flags. | Plan   |
| Read-access boundaries    | Courses public; lessons + messages gated        | Row-level RLS means a public lesson row leaks video/markdown — only the catalog is public. | Plan   |
| Write policies            | Peers INSERT own non-seed only; rest service-role | Minimal policy set exactly matching the PRD; operator power stays out-of-band.    | Plan   |
| Realtime publication      | Enable on `messages` now; client wiring in S-02 | Publication membership is a schema attribute; avoids the "realtime silently delivers nothing" miss. | Plan   |
| Seed data                 | Minimal smoke fixture (1 course/1 lesson/2 msgs) | Validates schema + RLS + ordering now; full content authoring is an out-of-band operator task. | Plan   |

## Scope

**In scope:** Five tables + FKs/indexes; `has_course_access()` helper; profiles signup
trigger + backfill; granular RLS policies; `messages` realtime publication membership; smoke
seed fixture; generated `Database` types + curated `src/types.ts` + typed Supabase client.

**Out of scope:** UI (lesson page, chat panel, catalog), API routes, realtime client wiring,
operator/admin interface, enrollment-creation/payment flow, peer edit/delete, full operator
seed content.

## Architecture / Approach

`courses → lessons → messages` (cascade deletes), with `profiles` (author display, FK→auth.users)
and an empty `enrollments` join table (the paid-path hook). A single `SECURITY DEFINER`
`has_course_access(course_id)` function — `is_free OR exists(enrollment for auth.uid())` —
is the access predicate, reused by both the `lessons` and `messages` SELECT policies so the
rule is defined once. Three migrations: schema (RLS enabled, deny-all) → policies (grant) →
then seed + types. Service-role bypasses RLS for operator seeding/deletion; it is never added
to app env.

## Phases at a Glance

| Phase                    | What it delivers                                                        | Key risk                                                                 |
| ------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1. Schema & Structure    | Five tables, helper, trigger+backfill, realtime pub, RLS-on (deny-all)  | Forgetting the profiles backfill → later message FK inserts fail         |
| 2. RLS Policies          | Granular per-op/per-role policies; the access matrix                    | A wrong SELECT predicate silently leaks or hides chat (and realtime obeys it) |
| 3. Seed Fixture & Types  | Smoke fixture + generated `Database` types + `src/types.ts` + typed client | Seed needs auth.users rows for message authors — fiddly to seed          |

**Prerequisites:** Local Supabase stack (Docker) running for `supabase db reset`; auth +
Supabase already present per the roadmap baseline.
**Estimated effort:** ~1 session across 3 phases (small schema, no UI).

## Open Risks & Assumptions

- RLS row-level granularity means lesson content privacy depends on lessons being gated
  (not column-level) — assumed acceptable that the public catalog shows course-level info only.
- Seeding messages requires inserting `auth.users` rows in `seed.sql` so the trigger creates
  profiles; if the trigger approach is awkward in seed, profiles may be inserted directly
  (still requires the auth.users rows for the FK).
- Realtime publication is enabled here but delivery correctness is only proven once S-02
  subscribes — the gated SELECT policy is the contract S-02 inherits.

## Success Criteria (Summary)

- `supabase db reset` applies all three migrations + seed cleanly from a clean checkout.
- The RLS matrix holds: anon reads only the catalog; authenticated learners read free
  lessons/chat; peers insert only their own non-seed messages; seed + delete are service-role only.
- `src/types.ts` (backed by generated `Database` types) compiles; `astro check` + `npm run build` pass.
