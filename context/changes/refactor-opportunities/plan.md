# Refactor: single source for the SRS card column list (+ shared UUID refinement) — Implementation Plan

## Overview

Consolidate the duplicated SRS card-column `.select()` string (`CARD_COLUMNS`,
candidate **C1**) into one type-derived source of truth in `src/lib/srs.ts`, so a
column rename/add can no longer silently drift the three routes that read SRS
cards. Fold in the trivial, clustered **C3** (one shared lenient-UUID zod
refinement) as a same-session quick win. Guard-first, fully reversible, no
behavior change.

## Current State Analysis

- `CARD_COLUMNS` is duplicated in three API routes (verified ast-grep ×3 +
  grep): `grade.ts:8` and `rate.ts:24` are byte-identical (9 columns);
  `submit.ts:6` differs — it leads with a 10th `question_id` column because it
  reads `srs_question_state` keyed by `question_id` (`submit.ts:90`), while
  `grade`/`submit` hit `srs_question_state` and `rate` hits `srs_review_state`.
- The type side `SrsCardFields` (`src/lib/srs.ts:22-25`) names the same 9 columns
  (a `Pick` over the generated `SrsReviewState`). `rate.ts:23` already carries a
  comment asserting `== SrsCardFields` — but there is **no compile/runtime link**:
  a typo in a literal is a runtime `.select()` error, not a build break.
- `UUID_RE` (lenient, Postgres-not-strict) is duplicated byte-identical in three
  routes: `grade.ts:22`, `submit.ts:26`, `match-answer.ts:20`.
- `src/lib/srs.ts` is the natural home: it already owns `SrsCardFields` and is a
  pure, Worker-safe module imported by all three SRS routes for
  `applyRating`/`emptyCardFields`.
- Safety net: `grade.test.ts`, `rate.test.ts`, `submit.test.ts`,
  `route-contracts.test.ts`, `srs.test.ts` — all run in CI
  (`vitest run --project unit`, `.github/workflows/ci.yml:37`). **None asserts the
  column list**, so the consolidation needs its own characterization test.
- Full evidence + ranking: [`research.md`](research.md) (this change).

## Desired End State

One exported `SRS_CARD_COLUMNS` (9-column string) in `src/lib/srs.ts`, derived
from an ordered column list that the compiler checks against `keyof SrsCardFields`;
the three routes import it (`submit.ts` composes `` `question_id, ${SRS_CARD_COLUMNS}` ``).
One exported `uuidString` zod refinement imported by the three routes that
validate UUIDs. No route changes behavior; every existing test still passes; a new
test pins the column contract. Verify: `npm run test`, `npm run lint`, `npm run build`
all green; grep shows zero remaining local `const CARD_COLUMNS`/`const UUID_RE`.

### Key Discoveries

- `submit.ts` 10th column `question_id` is load-bearing — do NOT force uniformity (`submit.ts:6-7,90`).
- `SrsCardFields` is a `Pick` over generated types (`srs.ts:22-25`) — keep that anchor; derive the _string_ from its keys, don't replace the type.
- `select(string)` is positional text Supabase does not type-check — the only way to bind string↔type is to derive one from the other.
- **Assumption (F1):** `SrsCardFields` is typed from `srs_review_state`, but the same 9-column string is used against `srs_question_state` too (`grade`/`submit`). This is valid today (both tables carry the identical FSRS card columns — proven by the current literals working in prod) and is the reason one shared constant is correct. If the two tables' card columns ever diverge, the shared source breaks loudly at `.select()` — the Phase-3 smoke covers it; do not "fix" by re-splitting.

## What We're NOT Doing

- **C2 (typed/validated jsonb-RPC returns).** Higher value but a repo-wide,
  forced-convention pattern (4 cast-sites, needs per-RPC SQL archaeology). Separate
  later change, not this slice.
- **C4 (`jsonResponse` helper extraction).** Pure ergonomics, no failure mode —
  optional follow-up.
- No migration of `.select()` from positional columns to anything else; no FSRS
  algorithm change; no DB/RLS/RPC change; no new CI infrastructure.
- Anything suspicious surfaced while swapping literals → a follow-up note, not
  in-scope edits.

## Implementation Approach

Guard-first and additive: pin the current contract with a test, introduce the new
single source without consumers, then flip the three consumers, then the UUID
quick win. Each phase is an independent, revertible commit. The compiler enforces
string↔type validity (`satisfies`); the Phase-1 test enforces completeness (no
column silently dropped).

## Phase 1: Characterize the current card-column contract

### Overview

Pin today's behavior before touching anything: assert the current 9-column list
equals the `SrsCardFields` key set, and that `submit` adds exactly `question_id`.

### Changes Required:

#### 1. Card-column characterization test

**File**: `src/lib/srs.test.ts`
**Intent**: Lock the contract that currently lives only in a comment — the 9 card
columns and their identity with `SrsCardFields` — so the Phase-2/3 consolidation
can't silently change the selected column set.
**Contract**: New test(s) asserting (a) the current 9-column string (as in
`grade.ts:8`/`rate.ts:24`) split+trimmed equals `Object.keys` of an
`emptyCardFields()` exemplar (the `SrsCardFields` runtime shape), and (b) order is
the documented order. No production code imported from routes yet — assert against
a local copy of the literal so the test is meaningful before consolidation.

### Success Criteria:

#### Automated Verification:

- `npm run test` passes (new test green against current code)
- `npm run lint` passes

#### Manual Verification:

- The test fails if a column is removed/renamed in the literal (spot-check by temporarily editing locally, then revert)

**Implementation Note**: Pause for human confirmation after automated checks before Phase 2.

---

## Phase 2: Introduce the type-derived single source (additive, no consumers)

### Overview

Add `SRS_CARD_COLUMNS` to `src/lib/srs.ts`, compiler-checked against
`keyof SrsCardFields`. Nothing consumes it yet — lands green.

### Changes Required:

#### 1. Derived column-list export

**File**: `src/lib/srs.ts`
**Intent**: Create one source of truth for the card-column select string, bound to
the type so an invalid/renamed column is a compile error.
**Contract**: Export an ordered column tuple and the joined string. The `satisfies`
clause makes every entry a valid `SrsCardFields` key at compile time; the Phase-1
test guarantees completeness. Snippet (the `satisfies` binding is the non-obvious part):

```ts
const SRS_CARD_COLUMN_ORDER = [
  "due",
  "stability",
  "difficulty",
  "scheduled_days",
  "learning_steps",
  "reps",
  "lapses",
  "state",
  "last_review",
] as const satisfies readonly (keyof SrsCardFields)[];

export const SRS_CARD_COLUMNS = SRS_CARD_COLUMN_ORDER.join(", ");
```

#### 2. Tighten the Phase-1 test onto the export

**File**: `src/lib/srs.test.ts`
**Intent**: Re-point the characterization assertions at the new `SRS_CARD_COLUMNS`
so the guard now protects the real source, and assert completeness (tuple length ==
`SrsCardFields` key count).
**Contract**: Import `SRS_CARD_COLUMNS`; assert it equals the known 9-column string
and that its columns cover every `SrsCardFields` key (catches a silently dropped column).

### Success Criteria:

#### Automated Verification:

- `npm run test` passes
- `npm run build` / typecheck passes (proves the `satisfies` binding compiles)
- `npm run lint` passes

#### Manual Verification:

- Temporarily add a bogus column name to the tuple → build fails (then revert)

**Implementation Note**: Pause for human confirmation before Phase 3.

---

## Phase 3: Switch the three routes to the shared source

### Overview

Replace the three local `CARD_COLUMNS` literals with the import. Behavior-preserving.

### Changes Required:

#### 1. practice grade route

**File**: `src/pages/api/practice/[questionId]/grade.ts`
**Intent**: Consume `SRS_CARD_COLUMNS` instead of the local literal.
**Contract**: Remove `const CARD_COLUMNS` (`:8`); import from `@/lib/srs`; the
`.select(...)` at `:76` uses `SRS_CARD_COLUMNS`. No other change.

#### 2. lesson review rate route

**File**: `src/pages/api/reviews/[lessonId]/rate.ts`
**Intent**: Same swap; drop the now-redundant `== SrsCardFields` comment.
**Contract**: Remove `const CARD_COLUMNS` (`:24`); `.select(...)` at `:66` uses the import.

#### 3. tests submit route (composed variant)

**File**: `src/pages/api/tests/[testId]/submit.ts`
**Intent**: Same swap, preserving the load-bearing leading `question_id`.
**Contract**: Remove `const CARD_COLUMNS` (`:6`); `.select(...)` at `:87` uses
`` `question_id, ${SRS_CARD_COLUMNS}` ``.

### Success Criteria:

#### Automated Verification:

- `npm run test` passes (all route + contract tests unchanged-green)
- `npm run build` + `npm run lint` pass
- `grep -rn "const CARD_COLUMNS" src` returns nothing

#### Manual Verification:

- Practice grade, lesson review, and test submit still read/write SRS cards correctly (smoke via the running app, one of each)

**Implementation Note**: Pause for human confirmation before Phase 4.

---

## Phase 4: Shared lenient-UUID refinement (C3 quick win)

### Overview

Extract the triplicated `UUID_RE` into one shared zod refinement.

### Changes Required:

#### 1. Shared UUID refinement

**File**: `src/lib/validation.ts` (new — keep separate from `src/lib/utils.ts`, which is Tailwind-only `cn()`)
**Intent**: One definition of the lenient (Postgres-not-strict) UUID string, with
its rationale comment, reused by the routes.
**Contract**: Export e.g. `uuidString` (a `z.string().regex(...)`) carrying the
existing `UUID_RE` pattern + comment.

#### 2. Adopt in the three routes

**Files**: `src/pages/api/practice/[questionId]/grade.ts:22`,
`src/pages/api/tests/[testId]/submit.ts:26`,
`src/pages/api/lessons/[lessonId]/match-answer.ts:20`
**Intent**: Replace each local `UUID_RE` + inline `z.string().regex(...)` with the shared refinement.
**Contract**: Import `uuidString`; use it inside the existing zod schemas. No schema-shape change.

### Success Criteria:

#### Automated Verification:

- `npm run test` passes
- `npm run build` + `npm run lint` pass
- `grep -rn "const UUID_RE" src` returns nothing

#### Manual Verification:

- A malformed UUID still yields the same 400 on each of the three routes

**Implementation Note**: Final phase — confirm all green, then the change is ready to archive.

---

## Testing Strategy

### Unit Tests:

- Card-column contract: `SRS_CARD_COLUMNS` == the 9-column string AND covers every `SrsCardFields` key (Phase 1→2).
- Existing route tests (`grade/rate/submit.test.ts`, `route-contracts.test.ts`) must stay green unchanged — they are the behavior-preservation guard for Phase 3.

### Manual Testing Steps:

1. Run the app; submit a practice answer (grade), rate a lesson review, submit a test — confirm each persists.
2. Send a malformed UUID to each of the 3 routes — confirm 400 unchanged.

## References

- Refactor ranking + evidence: `context/changes/refactor-opportunities/research.md`
- Deep Focus prior: `context/changes/practice-srs-grading-analysis/research.md`
- Home module: `src/lib/srs.ts:22-25` (`SrsCardFields`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Characterize the current card-column contract

#### Automated

- [ ] 1.1 `npm run test` passes (new test green against current code)
- [ ] 1.2 `npm run lint` passes

#### Manual

- [ ] 1.3 Test fails if a column is removed/renamed (spot-check, then revert)

### Phase 2: Introduce the type-derived single source

#### Automated

- [ ] 2.1 `npm run test` passes
- [ ] 2.2 `npm run build` / typecheck passes (satisfies binding compiles)
- [ ] 2.3 `npm run lint` passes

#### Manual

- [ ] 2.4 Bogus column in the tuple → build fails (then revert)

### Phase 3: Switch the three routes to the shared source

#### Automated

- [ ] 3.1 `npm run test` passes
- [ ] 3.2 `npm run build` + `npm run lint` pass
- [ ] 3.3 `grep -rn "const CARD_COLUMNS" src` returns nothing

#### Manual

- [ ] 3.4 Practice grade / lesson review / test submit still read+write SRS cards correctly

### Phase 4: Shared lenient-UUID refinement (C3)

#### Automated

- [ ] 4.1 `npm run test` passes
- [ ] 4.2 `npm run build` + `npm run lint` pass
- [ ] 4.3 `grep -rn "const UUID_RE" src` returns nothing

#### Manual

- [ ] 4.4 Malformed UUID still yields 400 on each of the three routes
