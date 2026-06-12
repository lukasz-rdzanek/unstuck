# Artifact 1 — Territory (git history)

Wide-Scan working note. Where the project was actually touched, what moves
together, what is noise. Evidence only — interpretation flows into `repo-map.md`.

**Window:** full project life — 198 commits, 2026-05-27 → 2026-06-12 (~17 days).
This is an MVP, not a year-old legacy, so "last 12 months" = the whole history.
Single human author (Lukasz Rdzanek) + AI co-authors. See
[[artifact-3-contributors]].

## Activity over time

| ISO week | Commits | Note                                        |
| -------- | ------: | ------------------------------------------- |
| 2026-W22 |      71 | scaffold + foundations + first verticals    |
| 2026-W23 |     113 | **peak** — bulk of feature work             |
| 2026-W24 |      14 | tapering — testing/hardening (partial week) |

Trend matches the project phase: build-out peaked in W23, now in a
testing/stabilization tail. No area looks like a "seasonal campaign" — the whole
repo is young and uniformly hot.

## Most-changed files (noise filtered)

Filtered out: lockfiles, `dist/`, `.astro/`, snapshots, `reports/`,
`test-results/`, images.

| Changes | File                                                  | Read                                              |
| ------: | ----------------------------------------------------- | ------------------------------------------------- |
|      24 | `context/foundation/roadmap.md`                       | **process doc**, not product code                 |
|      20 | `src/pages/courses/[slug]/lessons/[lessonSlug].astro` | the lesson page — busiest product file            |
|      13 | `package.json`                                        | deps/scripts churn (expected early)               |
|      12 | `src/styles/global.css`                               | global styling — cross-cutting                    |
|      10 | `src/lib/db/database.types.ts`                        | **generated** (Supabase) — moves on schema change |
|      10 | `src/components/lesson/LessonAside.tsx`               | lesson navigation island                          |
|       9 | `src/middleware.ts`                                   | route protection — touched as routes grew         |
|       8 | `supabase/seed.sql`                                   | demo/seed data                                    |
|       8 | `src/types.ts`                                        | shared DTOs/entities                              |
|       8 | `src/pages/courses/[slug]/index.astro`                | course overview page                              |

## Most-active directories

Depth-2, full history (noise filtered):

```
241  context/changes      ← 10x workflow artifacts (PROCESS, not product)
107  context/archive      ← completed changes (PROCESS)
 99  src/components
 89  src/pages
 60  .claude/skills        ← tooling (PROCESS)
 48  src/lib
 42  context/foundation    ← PROCESS
 20  tests/integration
 13  supabase/migrations
```

The top two rows are the 10x dev-process system-of-record, not the product —
high churn there is expected and is **not** a product hotspot. Real product
activity, drilled into `src/`:

```
39  src/pages/api         ← endpoints (auth, lessons, practice, tests, reviews, embeddings)
33  src/pages/courses     ← course/lesson SSR pages
30  src/components/lesson  ← lesson UI islands
21  src/components/chat    ← lesson-scoped chat (Realtime)
18  src/components/auth    ← auth forms
16  src/lib/services       ← extracted business logic
13  src/pages/auth
10  src/lib/db
```

**Product core (by activity):** the course/lesson learning flow
(`pages/courses` + `components/lesson`), the API surface (`pages/api`), chat,
auth, and the `lib/services` business layer.

## Co-change — what moves together (code only)

Top directory-area pairs in the same commit (`src/` + `supabase/` only):

| Co-changes | Pair                                               | Interpretation                                                                                     |
| ---------: | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
|          9 | `pages:courses` + `comp:lesson`                    | the lesson-rendering vertical — page + its islands move as one                                     |
|          8 | `db:migrations` + `db:types(gen)`                  | **regeneration coupling** — schema change regenerates `database.types.ts` (cheap, not hand-edited) |
|          7 | `comp:*` + `middleware`                            | new gated UI ⇒ new protected-route patterns in middleware                                          |
|          6 | `db:migrations` + `lib:services`                   | schema change ripples into the service layer                                                       |
|          6 | `db:migrations` + `types`                          | schema change ripples into hand-maintained `src/types.ts`                                          |
|          6 | `db:types(gen)` + `lib:services` / `types`         | generated types flow into services & DTOs                                                          |
|          5 | `pages:courses` + `lib:services` / `db:migrations` | the course flow reaches down into services and the DB                                              |

**Key cross-layer corridor:**
`db:migrations → db:types(gen) → lib:services / src/types.ts → pages:courses`.
A DB schema change is the change most likely to ripple through several layers.
Distinguish the two halves: `database.types.ts` updates are **regeneration**
(cheap); `src/types.ts` and service updates are **hand edits** (real cost).

## Common-denominator areas (breadth)

Areas that co-change with the most _distinct_ other areas (load-bearing):

```
15  api            15  lib:other       15  comp:other
14  middleware     14  db:seed/cfg     12  pages:courses
11  db:migrations  11  lib:services
```

`api`, `lib`, `middleware`, and `db` migrations/seed touch nearly everything —
they are the connective tissue. A change there has the widest blast radius.

## Existence check (co-change is history, not "now")

All top-coupled / most-changed files **still exist** in the tree (verified):
`[lessonSlug].astro`, `LessonAside.tsx`, `database.types.ts`, `middleware.ts`,
`types.ts`, `seed.sql`. No analysis is resting on a deleted/moved file.

## Unknowns (carry into structure & Deep Focus)

- Activity ≠ importance: a hot file may be a true center or just where one hard
  thing kept getting fixed. Structure (Artifact 2) must confirm centrality.
- Co-change shows what changed _together_, never what _should_ be synced but
  isn't (e.g. a runtime contract between client and an edge function). Flag in
  Deep Focus.
- `global.css` and `package.json` churn is cross-cutting noise, not a product
  hotspot — excluded from "core".
- The whole window is ~17 days; there is no "stable vs volatile" contrast yet —
  everything is volatile because everything is new.
