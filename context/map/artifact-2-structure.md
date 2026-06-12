# Artifact 2 — Structure (dependency graph)

Wide-Scan working note. What really depends on what: hubs, entry points,
boundaries, cycles. Evidence only — interpretation flows into `repo-map.md`.

## Method & a tooling limitation worth recording

- Tried **dependency-cruiser** (`npx`, no install) first. It ran but **could not
  resolve the `@/*` path alias** (`couldNotResolve: true` for every `@/…`
  import), even with `--ts-config`/`baseUrl` set — so its graph came back
  effectively edgeless (and therefore "no cycles / no hubs", which would have
  been a false negative). It also cannot parse `.astro` files at all.
- Fell back to a **deterministic custom import scan** (node): walk `src/**`
  `.ts/.tsx/.astro`, extract import specifiers, resolve `@/` → `src/` and
  relative paths, build forward + reverse edges, detect cycles by DFS. This
  **includes `.astro`** — the real SSR entry points dependency-cruiser misses.
- **Caveat:** the scan counts `import type` as an edge. Some coupling below is
  **type-only** (erased at compile time) and is cheaper than it looks — called
  out where it matters.
- Coverage: 76 source files, 130 intra-`src` edges. Excludes `.test.ts`.

## Top observations

1. **`src/lib/supabase.ts` is the single load-bearing hub** (afferent **22**).
   The SSR Supabase client factory — pages, middleware, API routes and services
   all reach it. Highest blast radius in the repo by far. (Part of the 22 is
   type-only `import type { createClient }`, but it is also a real value import
   in pages/middleware/API.)
2. **The graph is acyclic — zero import cycles.** Confirmed by DFS over the full
   graph (the dependency-cruiser "no cycles" was unreliable; this one isn't).
3. **Services use dependency injection, not module-level server clients.** Every
   `lib/services/*.ts` takes `supabase: SupabaseClient` as a **parameter**
   (`import type { createClient }` only). This keeps layers clean and makes
   services trivially testable (mock the param) — and explains the dense `.test`
   coverage next to them.
4. **The "components → services" edge is type-only and benign.**
   `components/test/PracticeSession.tsx` and `TestQuiz.tsx` import from
   `services/tests.ts` — but **only types** (`import type { PracticeQuestion }`,
   `TakingQuestion`). No server code is bundled into the client island. A naive
   graph flags this as a layer breach; interpretation clears it.
5. **`.astro` pages are the composition roots.**
   `pages/courses/[slug]/lessons/[lessonSlug].astro` has the highest **efferent
   (13)** — it wires together services, layouts and islands. It is the busiest
   product file in git history too (Artifact 1) → the real center of the app.

## Hubs — load-bearing modules (afferent coupling)

| Imported by | Module                         | Role / read                                              |
| ----------: | ------------------------------ | -------------------------------------------------------- |
|          22 | `src/lib/supabase.ts`          | SSR client factory — **the** core dependency             |
|          12 | `src/lib/utils.ts`             | `cn()` + helpers — cross-cutting UI util                 |
|           9 | `src/types.ts`                 | shared DTOs/entities (hand-maintained)                   |
|           7 | `src/lib/db/database.types.ts` | **generated** Supabase types — moves by regeneration     |
|           6 | `src/lib/services/tests.ts`    | tests/practice domain service                            |
|           6 | `src/layouts/AppLayout.astro`  | app shell layout                                         |
|           5 | `src/lib/services/courses.ts`  | course/lesson domain service                             |
|           5 | `src/layouts/Layout.astro`     | base layout                                              |
|           3 | `src/lib/srs.ts`               | **spaced-repetition** logic — the business-logic feature |

## Composition roots — thick entry points (efferent coupling)

| Imports | Module                                            | Read                          |
| ------: | ------------------------------------------------- | ----------------------------- |
|      13 | `pages/courses/[slug]/lessons/[lessonSlug].astro` | the lesson page — app center  |
|       6 | `pages/courses/[slug]/tests/[testSlug].astro`     | test-taking page              |
|       5 | `components/chat/ChatPanel.tsx`                   | lesson chat island (Realtime) |
|       5 | `components/lesson/LessonAside.tsx`               | lesson nav island             |
|       5 | `pages/courses/[slug]/index.astro`                | course overview               |
|       5 | `pages/courses/[slug]/practice.astro`             | practice/SRS page             |

## Entry points (what the runtime actually calls)

- **SSR pages:** `src/pages/**/*.astro` (course/lesson/test/practice/auth).
- **API routes:** `src/pages/api/**/*.ts` — auth (signin/signup/signout/verify-otp/
  resend), `lessons/[id]/complete`, `practice/[id]/grade`, `tests/[id]/submit`,
  `reviews/[id]/rate`, `lessons/[id]/match-answer`, `embeddings/backfill`. Each
  must `export const prerender = false` (project rule).
- **Edge middleware:** `src/middleware.ts` — resolves user, gates protected
  routes. Afferent on `supabase.ts`; touched whenever routes grow.

## Layers — direction is clean (top → down)

```
pages/*.astro  +  components/*.tsx        (UI / islands)
        │ import (values + types)
        ▼
lib/services/*.ts                          (business logic; supabase via DI)
        │ import type
        ▼
lib/supabase.ts  ·  lib/db/database.types.ts  ·  types.ts   (data + contracts)
```

No inverted imports found (services never import pages/components). The only
upward-looking edge (components → services) is **type-only**.

## Test risk (from the graph)

| Risk                            | Where                                                             | Recommended test level                                          |
| ------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Low — pure DI                   | `lib/services/*`, `lib/srs.ts`, `lib/answer-match`                | unit (mock the `supabase` param) — already covered              |
| Medium — request/response + zod | `pages/api/**`                                                    | integration (already has `*.test.ts` siblings)                  |
| High — heavy composition        | `[lessonSlug].astro` (efferent 13), `practice.astro`, chat island | **e2e** (Playwright) — too many wires to unit-test meaningfully |

## Unknowns (carry into Deep Focus / repo-map)

- **`.astro` import edges are my scan's, not a validated tool's.** Regex-based
  extraction can miss dynamic/conditional imports. Medium confidence on `.astro`
  edges, high on `.ts/.tsx`.
- **Runtime coupling is invisible here:** Supabase **Realtime** subscriptions
  (chat island ↔ `postgres_changes`), RLS policies, RPC functions
  (`get_test_questions`, `get_due_practice_questions`, `match-answer`), and edge
  env config are _not_ import edges. The DB contract (migrations ↔ `database.types.ts`
  ↔ services) is a real coupling that the import graph cannot show.
- **`database.types.ts` coupling is regeneration**, not hand-editing — cheap
  (see Artifact 1 co-change). `src/types.ts` coupling is hand-maintained — real.
- No second dependency-graph tool corroborated this; single-method evidence.
