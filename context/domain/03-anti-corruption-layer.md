---
title: Anti-Corruption Layer — dependency-leak audit & refactor plan
created: 2026-06-13
type: refactor-plan
---

# Anti-Corruption Layer: which dependency leaks, and what to do about it

Product of this document is a **PLAN**. No production code is changed here.
Every claim is grounded in a `file:line` citation verified by grep / Read on
2026-06-13.

---

## STEP 0 — Stack, dependency manifest, layers

**Stack** (`package.json`): Astro 6 SSR app, React 19 islands, Tailwind 4,
Supabase (auth + Postgres + Realtime), deployed to Cloudflare Workers.

**External runtime dependencies that could leak** (`package.json:20-49`):

| Package                         | Role                                                | Layers it _could_ touch                 |
| ------------------------------- | --------------------------------------------------- | --------------------------------------- |
| `@supabase/supabase-js` (`:30`) | DB/auth/realtime SDK                                | service, API, middleware, island, types |
| `@supabase/ssr` (`:29`)         | cookie-session client factories                     | server wrapper, browser wrapper         |
| `ts-fsrs` (`:46`)               | FSRS-6 spaced-repetition algorithm                  | scheduling only                         |
| `zod` (`:48`)                   | request-input validation                            | API routes                              |
| `astro` (`:35`)                 | framework (`astro:env`, `APIRoute`, `AstroCookies`) | framework-bound code                    |

**Code layers** (per `AGENTS.md`):

- **Domain types**: `src/types.ts` (entity + DTO aliases), `src/lib/db/database.types.ts` (generated).
- **Services / business logic**: `src/lib/services/*`, plus `src/lib/srs.ts`.
- **Infrastructure wrappers**: `src/lib/supabase.ts` (server), `src/lib/supabase-browser.ts` (browser).
- **API routes (wire boundary)**: `src/pages/api/**`.
- **Pages (SSR)**: `src/pages/**/*.astro`.
- **Islands (client bundle)**: `src/components/**`.

**Documented swappability intent found** — the strongest intent-vs-code signal:

- `src/lib/srs.ts:4-8` (doc-comment): _"One pure module wrapping `ts-fsrs` so
  the algorithm version + parameters are pinned in a single place and the rating
  API route stays thin."_
- `context/archive/2026-06-06-spaced-repetition-review/plan.md:72`: _"Intent: One
  pure module wrapping `ts-fsrs` so the API route stays thin and the algorithm
  version is pinned here."_
- No doc anywhere declares Supabase, zod, or astro as swappable. (grep over
  `context/ docs/ README.md AGENTS.md` for "swap/replace/anti-corruption/portab"
  returned only unrelated feature-swap history — no DB/vendor abstraction intent.)

So the **only** dependency the project has _declared_ an isolation intent for is
`ts-fsrs`. The headline question is whether code honors that intent.

---

## STEP 1 — IDENTIFY leaking dependencies (all files that "know" each dep)

### Candidate A — `ts-fsrs` (the prior finding, VERIFIED)

`grep -rn "ts-fsrs" src/` (all extensions) hits **exactly one production file**:

```
src/lib/srs.ts:4   (doc comment)
src/lib/srs.ts:10  (doc comment)
src/lib/srs.ts:12  (doc comment)
src/lib/srs.ts:15  import { createEmptyCard, fsrs, generatorParameters, type Card } from "ts-fsrs";
src/lib/srs.ts:21,31,32,50  (doc comments)
```

Line 15 is the **only** import statement. The `Card` type is referenced only
inside `srs.ts` (`:15,21,31,35,50,51`). It is **never** named in any other `.ts`,
`.tsx`, or `.astro` file. Confirmed independently:

- Not in `src/types.ts` (grep for `Card|Rating|fsrs` → only `SrsReviewState`/`SrsQuestionState` table aliases, no library type).
- Not in `src/lib/db/database.types.ts` (grep `fsrs|createEmptyCard|generatorParameters|ts-fsrs` → **NONE — clean**).
- Not in any React island prop.

What consumers see is the **port surface** `srs.ts` exports — all
project-owned, zero library types:

- `applyRating(current: SrsCardFields, rating: ReviewRating, now?): SrsCardFields` (`srs.ts:71`)
- `emptyCardFields(now?): SrsCardFields` (`srs.ts:66`)
- `type SrsCardFields` = `Pick<SrsReviewState, ...>` (`srs.ts:22-25`) — a slice of the **DB** type, not a library type.
- `type ReviewRating = 1|2|3|4` (`srs.ts:28`) — a domain union, _not_ the ts-fsrs `Rating` enum.

Consumers (all import only the port, never `ts-fsrs`):

- `src/pages/api/reviews/[lessonId]/rate.ts:4` (`applyRating, emptyCardFields, ReviewRating, SrsCardFields`)
- `src/pages/api/practice/[questionId]/grade.ts:4` (`applyRating, emptyCardFields`)
- `src/pages/api/tests/[testId]/submit.ts:4` (`applyRating, emptyCardFields`)
- `src/lib/srs.test.ts:2` (test).

**Verdict: ts-fsrs is already isolated. This is a PASSING result (see STEP 2).**

### Candidate B — `@supabase/*` clients across layers (the real leak)

`@supabase/supabase-js` is imported in **production code across three different
layers** plus a client-bundle island, and the project's _own_ `SupabaseClient`
type alias is **reconstructed four separate ways**:

Production imports of `@supabase/supabase-js`:

- `src/env.d.ts:9` — `import("@supabase/supabase-js").User` on `App.Locals.user`.
- `src/components/chat/useChatMessages.ts:2` — `import { REALTIME_SUBSCRIBE_STATES }` **(value import → client bundle)**.
- `src/lib/services/messages.ts:10` — `type { SupabaseClient }`.
- `src/lib/services/answer-match.ts:10` — `type { SupabaseClient }`.
- `src/pages/api/auth/resend.ts:2` — `type { AuthError }`.

`@supabase/ssr` imports:

- `src/lib/supabase.ts:1` — `createServerClient, parseCookieHeader`.
- `src/lib/supabase-browser.ts:1` — `createBrowserClient`.

**Duplicated reconstruction of the same concept** — the "app Supabase client"
type is defined **six** times, two different ways:

`NonNullable<ReturnType<typeof createClient>>` (derives from the server wrapper — the _good_ pattern):

- `src/lib/services/profiles.ts:14`
- `src/lib/services/course-views.ts:17`
- `src/lib/services/tests.ts:11`
- `src/lib/services/completions.ts:17`
- `src/lib/services/courses.ts:19`

`SupabaseClient<Database>` (imports the SDK type directly — the _leaking_ pattern):

- `src/lib/services/messages.ts:14` (`ChatSupabaseClient`)
- `src/lib/services/answer-match.ts:14` (`AppSupabaseClient`)
- `src/test/harness/fake-supabase.ts:120,147` (test, acceptable).

So two of seven services reach past the `@/lib/supabase` wrapper straight into
the SDK to name the same thing the other five name via the wrapper.

### Candidate C — `zod`

`import { z } from "zod"` appears in **9 API-route files** (`backfill`, `resend`,
`signup`, `verify-otp`, `submit`, `signin`, `match-answer`, `grade`, `rate`).
That is **single-layer** (API only) and is exactly where validation belongs —
zod types never enter `src/types.ts`, service signatures, or islands. **Not a
leak** (a validation library used in the validation layer is correct placement).

### Candidate D — `astro`

`astro` / `astro:*` imports are framework-bound and live only in framework-bound
code (`middleware.ts:1`, `*.astro` pages, API routes' `APIRoute` type,
`supabase.ts:2-3` for `AstroCookies` + `astro:env`). A framework is not an ACL
candidate — you do not "swap Astro" behind a port. **Not a leak.**

---

## STEP 2 — CLASSIFY and pick #1

| Dep              | Layers/files touched | Cost/risk to replace today      | Doc declares swappable? | Intent-vs-code gap                   |
| ---------------- | -------------------- | ------------------------------- | ----------------------- | ------------------------------------ |
| **ts-fsrs**      | 1 file (`srs.ts`)    | Low — only `srs.ts` changes     | **Yes** (`srs.ts:4-8`)  | **None — code honors intent**        |
| **@supabase/\*** | 5 layers, ~30 files  | Very high (the whole data path) | No                      | N/A but **inconsistent containment** |
| zod              | 1 layer (API)        | n/a                             | No                      | None                                 |
| astro            | framework-bound      | n/a (not swappable)             | No                      | None                                 |

**ts-fsrs = PASSING result.** Doc declares it should be the single knower; code
_proves_ it: one import, library type never leaves the module, consumers see only
project-owned `SrsCardFields`/`ReviewRating`. There is no work to do to _create_
an ACL — it already exists. (Plan: formalize/guard it — STEP 4A.)

**Worst actual leak = `@supabase/*`.** Not because it is "wrong" — a request-scoped
client is the right pattern — but because it is the **only dependency with an
inconsistent boundary**: a single-file wrapper (`src/lib/supabase.ts`) already
exists and five services route through it, yet **two services bypass it**
(`messages.ts:14`, `answer-match.ts:14`) and a value import crosses into the
**client bundle** (`useChatMessages.ts:2`). The cheap, high-value refactor is to
make the existing wrapper the _single_ knower of the SDK _type_, the same way
`srs.ts` is already the single knower of `ts-fsrs`. This is **#1**.

---

## STEP 3 — DIAGNOSE the chosen leak (`@supabase/*`)

### 3.1 Duplication — the "app client" type defined six ways

Five services derive the type from the wrapper (correct, DRY):

```
src/lib/services/courses.ts:19      type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;
src/lib/services/profiles.ts:14     (identical)
src/lib/services/course-views.ts:17 (identical)
src/lib/services/tests.ts:11        (identical)
src/lib/services/completions.ts:17  (identical)
```

Two services reach past the wrapper into the SDK for the _same_ concept:

```
src/lib/services/messages.ts:10,14    import type { SupabaseClient } from "@supabase/supabase-js";
                                       type ChatSupabaseClient = SupabaseClient<Database>;
src/lib/services/answer-match.ts:10,14 import type { SupabaseClient } from "@supabase/supabase-js";
                                       type AppSupabaseClient  = SupabaseClient<Database>;
```

Five files re-declare an identical alias inline (no shared export), and two more
import the SDK type directly. Seven definitions, one concept — a column
rename/SDK bump touches all seven, and the two SDK-typed ones are typed
_differently_ from the wrapper's actual return type (subtle drift risk).

### 3.2 Boundary crossing — SDK value import in the client bundle (the dangerous one)

```
src/components/chat/useChatMessages.ts:2  import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
```

This is a **value** import (an enum object), not a type — it ships into the
React-island client bundle. The island also constructs its client via
`createClientBrowser()` (`useChatMessages.ts:5,97`), which is the _correct_
browser wrapper. So the boundary is _almost_ clean: the client construction is
wrapped, but a raw SDK enum still leaks into the island. A future contributor
who copies that line for a non-realtime value would pull SDK internals
client-side with no port in the way.

`src/lib/supabase-browser.ts:6-13` documents _why_ the browser path must use
`@supabase/ssr`'s `createBrowserClient` (cookie session → Realtime WS handshake →
RLS deliveries) — so the wrapper boundary is load-bearing for security, which
makes the bypass in `useChatMessages.ts:2` worth closing on principle.

### 3.3 What is already good (do not "fix")

- `src/lib/supabase.ts:6` (`createClient`) and `src/lib/supabase-browser.ts:20`
  (`createClientBrowser`) are real wrappers: the _only_ call sites of
  `createServerClient`/`createBrowserClient` in the repo, both pin `<Database>`
  and handle the null-env branch.
- All API routes + pages construct clients via these wrappers (e.g.
  `rate.ts:57`, `courses/index.astro:6`) — **no route or page imports the SDK
  directly to build a client.** The construction boundary holds; only the
  **type alias** and **one enum import** leak.

### 3.4 The ts-fsrs comparison (proof the codebase _can_ do this right)

`srs.ts` is the existence proof of a correct ACL: one import (`:15`), library
`Card` never escapes the module, consumers see `SrsCardFields` (a `Pick` of the
_DB_ type, `:22-25`) and a domain `ReviewRating` union (`:28`) that deliberately
**re-declares** the rating values rather than re-exporting ts-fsrs's `Rating`
enum (`:27` comment notes they are "ts-fsrs Rating values" but the type is
project-owned). That is precisely the discipline the Supabase type alias lacks.

---

## STEP 4 — DESIGN the ACL

### 4A — ts-fsrs: formalize / guard the boundary that already passes

Nothing structural to build. To _keep_ the boundary from eroding and make the
intent enforceable:

1. **Name the port explicitly** in `srs.ts` so the contract is a declared
   interface, not just a set of loose exports:

   ```ts
   // src/lib/srs.ts — the SINGLE knower of ts-fsrs. Nothing else imports "ts-fsrs".
   export interface SrsScheduler {
     emptyCardFields(now?: Date): SrsCardFields;
     applyRating(current: SrsCardFields, rating: ReviewRating, now?: Date): SrsCardFields;
   }
   // existing free functions become the default adapter:
   export const fsrsScheduler: SrsScheduler = { emptyCardFields, applyRating };
   ```

   Consumers may keep importing the free functions; the named interface
   documents the swap surface and lets a future alternate algorithm implement
   `SrsScheduler` without touching routes.

2. **Own `ReviewRating` where it belongs.** It already is project-owned
   (`srs.ts:28`) — keep it that way; do **not** re-export ts-fsrs `Rating`. The
   `as ReviewRating` cast in `rate.ts:55` after zod `gte(1).lte(4)` validation
   (`rate.ts:19-21`) is the correct narrowing point; leave it.

3. **Guard against future leak** — a lint rule / CI grep:
   `grep -rn "ts-fsrs" src/ | grep -v "src/lib/srs"` must be empty. Add as a
   one-line check (mirrors the existing column-sync discipline in
   `context/changes/refactor-opportunities/`).

### 4B — `@supabase/*`: the port + single-knower for the SDK type (the real work)

**Goal:** the `@supabase/supabase-js` _type_ surface is known in exactly one
place, the way the wrapper already knows the _construction_ surface.

1. **One exported app-client type, derived from the wrapper** — add to
   `src/lib/supabase.ts` (the existing server wrapper, already the type's natural
   home):

   ```ts
   // src/lib/supabase.ts
   import type { Database } from "@/lib/db/database.types";
   // The one app-facing Supabase client type. Derived from the wrapper's return,
   // so a wrapper/SDK change propagates from a single edit.
   export type AppSupabaseClient = NonNullable<ReturnType<typeof createClient>>;
   ```

   Then every service imports it instead of re-declaring:

   ```ts
   import type { AppSupabaseClient } from "@/lib/supabase";
   export async function listCourses(supabase: AppSupabaseClient): Promise<Course[]> { ... }
   ```

   Replaces the five inline `NonNullable<ReturnType<…>>` aliases
   (`courses.ts:19`, `profiles.ts:14`, `course-views.ts:17`, `tests.ts:11`,
   `completions.ts:17`) **and** the two SDK-typed aliases
   (`messages.ts:14`, `answer-match.ts:14`) — so `messages.ts:10` and
   `answer-match.ts:10` drop their `@supabase/supabase-js` import entirely.

2. **Close the client-bundle enum leak.** In `useChatMessages.ts:2`, re-export
   the one needed value through the browser wrapper so the island never names
   the SDK:

   ```ts
   // src/lib/supabase-browser.ts
   export { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
   ```

   ```ts
   // useChatMessages.ts
   import { createClientBrowser, REALTIME_SUBSCRIBE_STATES } from "@/lib/supabase-browser";
   ```

   Now the _only_ file in the client/realtime path that names the SDK is the
   wrapper.

3. **`User` / `AuthError` types** (`env.d.ts:9`, `resend.ts:2`) — these are auth
   _value objects_, not the client. Re-export them from `src/lib/supabase.ts`
   too (`export type { User, AuthError } from "@supabase/supabase-js";`) and
   point the two call sites at the wrapper, so even the auth-type surface has a
   single knower. Low effort, completes the boundary.

**Port shape (conceptual):** `src/lib/supabase.ts` + `src/lib/supabase-browser.ts`
together become the **adapter package** — the only modules that import
`@supabase/*`. They export: the two `createClient*` factories, the
`AppSupabaseClient` type, and the few re-exported value/auth-type symbols. The
rest of the codebase knows only `@/lib/supabase` and `@/lib/supabase-browser`.

(Note: this is a _type/boundary_ ACL, not a "swap Postgres for X" ACL. We are
not introducing a repository-pattern abstraction over PostgREST — no doc asks
for it, the cost is repo-wide, and `context/changes/refactor-opportunities/`
explicitly deferred RPC-return abstraction as "repo-wide forced convention." The
proposal stops at making the SDK _type_ surface single-sourced, matching the
discipline `srs.ts` already demonstrates.)

---

## STEP 5 — Isolation proof + before/after + phased plan

### Success criterion (grep)

**ts-fsrs (already passes):**

```
$ grep -rn "ts-fsrs" src/ --include=*.ts --include=*.tsx --include=*.astro | grep -v "src/lib/srs"
(empty)   ✅ PASSES TODAY
```

**@supabase/\* (target after 4B):**

```
$ grep -rln "@supabase/supabase-js\|@supabase/ssr" src/ --include=*.ts --include=*.tsx --include=*.astro \
    | grep -v -E "src/lib/supabase(\.ts|-browser\.ts)$" | grep -v "\.test\.\|/test/"
(empty)   ← target
```

### Before / after — who knows `@supabase/*`

| File                                                                    | Today                                      | After                                       |
| ----------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------- |
| `src/lib/supabase.ts`                                                   | `@supabase/ssr` (`:1`)                     | knows it (adapter) ✅                       |
| `src/lib/supabase-browser.ts`                                           | `@supabase/ssr` (`:1`)                     | knows it (adapter) ✅                       |
| `src/lib/services/messages.ts`                                          | `@supabase/supabase-js` (`:10`)            | imports `AppSupabaseClient` from wrapper    |
| `src/lib/services/answer-match.ts`                                      | `@supabase/supabase-js` (`:10`)            | imports `AppSupabaseClient` from wrapper    |
| `src/lib/services/{courses,profiles,course-views,tests,completions}.ts` | inline `NonNullable<ReturnType<…>>`        | import `AppSupabaseClient`                  |
| `src/components/chat/useChatMessages.ts`                                | `@supabase/supabase-js` value (`:2`)       | imports enum re-export from browser wrapper |
| `src/env.d.ts`                                                          | `@supabase/supabase-js` `User` (`:9`)      | `User` re-exported from wrapper             |
| `src/pages/api/auth/resend.ts`                                          | `@supabase/supabase-js` `AuthError` (`:2`) | `AuthError` re-exported from wrapper        |
| `src/test/harness/*`                                                    | SDK types                                  | unchanged (test code, allowed)              |

After: the only **production** files importing `@supabase/*` are the two
wrapper modules.

### Phased plan (additive, guard-first, per project convention)

- **Phase 0 — Guard.** Add the two grep checks above to CI (ts-fsrs one passes
  immediately and locks the win; the Supabase one is the failing target).
- **Phase 1 — ts-fsrs formalize (4A).** Add `SrsScheduler` interface +
  `fsrsScheduler` const in `srs.ts`; no consumer change. Zero behavior change;
  `srs.test.ts` stays green.
- **Phase 2 — Single app-client type (4B.1).** Add `AppSupabaseClient` to
  `src/lib/supabase.ts`; flip the seven services one file at a time (each a
  separate revert), drop the two SDK imports. Type-only change; route + service
  tests are the behavior net.
- **Phase 3 — Auth-type + enum re-exports (4B.2, 4B.3).** Re-export
  `REALTIME_SUBSCRIBE_STATES`, `User`, `AuthError` from the wrappers; repoint
  `useChatMessages.ts`, `env.d.ts`, `resend.ts`.
- **Phase 4 — Flip the Supabase grep guard to required.** Boundary proven by CI.

Each phase is type-only or additive, reversible, and verified by the existing
unit/route/contract test net (`src/pages/api/**/*.test.ts`, `src/middleware.test.ts`)
plus the new grep guards. No DB, RLS, RPC, or runtime-path changes.

### Open questions resolved

- _Does ts-fsrs `Rating`/`Card` need to be a port type?_ No — `srs.ts:22-28`
  already substitutes project-owned `SrsCardFields` (a DB-type `Pick`) and a
  hand-rolled `ReviewRating` union; the library enum is intentionally not
  re-exported. Keep it.
- _Should we abstract PostgREST behind a repository?_ No — out of scope; no doc
  intent, repo-wide cost, and the sibling refactor brief already deferred the
  related RPC-typing convention.
