---
title: SRS Card Invariant — aggregate-guardian refactor plan
created: 2026-06-13
type: refactor-plan
---

# SRS Card Invariant: the single enforcement point that does not exist yet

The product of this document is a **PLAN**. No production code is changed here.
Every `file:line` citation was verified by Read / grep on 2026-06-13 against
`git_commit` on `master` (the same tree the prior Deep Focus research used,
`context/changes/practice-srs-grading-analysis/research.md`).

The exercise: discover the domain invariants, classify them, pick the one that is
_simultaneously most core and most weakly enforced_, diagnose where it leaks, and
design an aggregate-guardian that becomes its single enforcement point.

---

## STEP 0 — Context (verified)

**Stack** (`AGENTS.md`, `README.md`): Astro 6 SSR, React 19 islands, Supabase
(auth + Postgres + RLS + RPCs), Cloudflare Workers. Test discipline: vitest with
two projects — `unit` (`src/**/*.test.ts`, hermetic) and `integration`
(`tests/integration/**/*.itest.ts`, real local Supabase via Docker) —
`vitest.config.ts:31-50`. CI runs unit on every push (`/.github/workflows/ci.yml:37`),
integration + e2e PR-triggered (`ci.yml:109,147`).

**Business-logic layers** that carry rules:

- **DB / RLS / RPC** — `supabase/migrations/*.sql`. SECURITY DEFINER functions are
  the existing "authoritative server-side computation" pattern: `submit_test_attempt`
  (`20260606170000_tests_schema.sql:138-191`), `grade_question` /
  `get_due_practice_questions` (`20260607100000_srs_question_state.sql:52-110`),
  `has_course_access` (`20260528122957_lesson_chat_schema.sql:116-130`).
- **Domain helper** — `src/lib/srs.ts` (pure FSRS-6 wrapper; `applyRating`,
  `emptyCardFields`; no DB access).
- **API routes** — `src/pages/api/**`. The three SRS writers each _inline_ the
  scheduling sequence (see STEP 3).
- **Islands** — `PracticeSession.tsx`, `MarkCompleteButton.tsx`: server-authoritative,
  hold no scheduling state (verified — clients send selections/toggles only).

---

## STEP 1 — Business invariants (discovered, each cited)

| #      | Invariant (MUST always hold)                                                                                                                                                                                                                                         | Source                                                                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I1** | **The answer key (`question_options.is_correct`) never reaches a learner.**                                                                                                                                                                                          | `tests_schema.sql:9-16,51,90-94`; `lessons.md` (recorded RLS invariant); `get_*`/`grade`/`submit` RPCs omit/hold the key.                         |
| **I2** | **A test attempt passes iff `score >= pass_threshold`**, where `score = correct/total` rounded, computed server-side.                                                                                                                                                | `tests_schema.sql:185-187`; threshold check `:27`.                                                                                                |
| **I3** | **Grading is all-or-nothing per question**: a question is correct iff the _selected set exactly equals_ the correct set, and a question with no correct options is never correct.                                                                                    | `tests_schema.sql:177-178`; `srs_question_state.sql:107`.                                                                                         |
| **I4** | **An SRS card's schedule (`due` + FSRS fields) advances only through a graded review, computed from the card's prior state by FSRS-6** — and the advance must **persist or fail loud** (a swallowed write leaves `due` unmoved and re-serves the same card forever). | `srs.ts:71-73`; `grade.ts:67-94`; `rate.ts:75-87`; `submit.ts:80-121`; advance contract spelled out in `grade.ts:67-71`.                          |
| **I5** | **A learner may only read/grade/schedule within a course they have access to** (`is_free` OR enrolled).                                                                                                                                                              | `has_course_access` (`lesson_chat_schema.sql:116-130`); enforced inside the definer RPCs and own-only RLS.                                        |
| **I6** | **SRS state rows are own-only**: `user_id = auth.uid()` for every read and write.                                                                                                                                                                                    | RLS `srs_question_state_*_own` (`srs_question_state.sql:39-48`, FORCE'd `:37`); `srs_review_state_*_own` (`20260606140000_srs_review_state.sql`). |

---

## STEP 2 — Classify and pick #1

Three axes: **(a) core to product**, **(b) smeared across layers**, **(c) enforced
vs declared vs violable**.

| Inv                                                          | (a) Core                                                                                                                                  | (b) Smear                                                                                                                                      | (c) Enforcement reality                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I1 answer-key secrecy                                        | High                                                                                                                                      | Concentrated (RLS + 4 definer fns)                                                                                                             | **Strongly enforced** by DB ownership + ENABLE-not-FORCE; one recorded lesson guards it. Not weak.                                                                                                                                                                                               |
| I2 pass = score≥threshold                                    | High                                                                                                                                      | Concentrated                                                                                                                                   | **Enforced atomically** inside one `volatile` SECURITY DEFINER fn (`submit_test_attempt`) — score, attempt row, answers all in one transaction. Strong.                                                                                                                                          |
| I3 all-or-nothing match                                      | High                                                                                                                                      | Two SQL fns                                                                                                                                    | Enforced server-side in SQL, duplicated but both correct. Moderate, not the weakest.                                                                                                                                                                                                             |
| **I4 card advances only via graded review; persist-or-fail** | **Highest — this IS the learning loop the product is built on (spaced re-quizzing + lesson review); without it the "due queue" is a lie** | **Most smeared: 3 routes × `srs.ts` × 2 tables, the load→compute→save sequence re-implemented inline 3× with 3 _different_ failure contracts** | **Weakest of the core ones.** No single guardian. The "advance" is a route-layer **read-modify-write** under caller RLS — _not_ one transaction — so it has a lost-update race and is enforced _inconsistently_: `rate` fatal, `grade` fatal (since M3L5), `submit` **best-effort / swallowed**. |
| I5 course access                                             | High                                                                                                                                      | RPC + RLS                                                                                                                                      | Enforced in definers + RLS. Strong.                                                                                                                                                                                                                                                              |
| I6 own-only                                                  | High                                                                                                                                      | RLS (FORCE'd)                                                                                                                                  | Strongly enforced by FORCE'd RLS. Strong.                                                                                                                                                                                                                                                        |

**Pick: I4 — "an SRS card's schedule advances only through a graded review, and
that advance must persist atomically or fail loud."**

**Justification.** I4 is the most core (it is the entire spaced-repetition value
loop — practice re-quizzing _and_ lesson review), and simultaneously the most
weakly enforced of the core invariants. Unlike I1/I2/I5/I6, which each live behind
a single DB construct (FORCE'd RLS, one definer transaction), I4 has **no single
owner**. It is reconstructed by hand in three API routes, riding on `srs.ts` for the
math but doing the _persistence_ itself, under caller RLS, as a non-atomic
read-modify-write, with three divergent failure postures. The M3L5 fix
(`c6f9209`) repaired _one symptom on one route_ (`grade` no longer swallows) — it
did **not** unify enforcement, and `submit` still swallows (`submit.ts:115-120`;
asserted as the live contract in `route-contracts.test.ts:101-122`). So per the
brief's caveat, the already-solved fail-loud case is _not_ what we pick: we pick the
**structural** weakness the fix left behind — three guardians where there should be
one, and no atomicity.

**Load-bearing distinction (kept, not flattened):** the asymmetry is partly
_intentional_ — `submit`'s requiz enrolment is a **secondary** effect of a test
attempt (the attempt is the contract), whereas in `grade` the reschedule **is** the
operation (`route-contracts.test.ts:131-135`). The guardian must therefore make the
posture an **explicit, named policy per call site**, not erase it.

---

## STEP 3 — Diagnose I4 (where it lives, where it leaks)

### Where the rule lives today (across layers)

| Layer                 | Site                                      | What it does for I4                                                                                                                                                                                                            |
| --------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Domain math           | `srs.ts:66-73`                            | `emptyCardFields`, `applyRating` — the _only_ shared piece. Pure; correct.                                                                                                                                                     |
| Route (practice)      | `grade.ts:72-94`                          | load card (`maybeSingle`) → `applyRating(card ?? empty, isCorrect?3:1)` → upsert. **Fatal** on upsert/throw (`:87-94`).                                                                                                        |
| Route (lesson review) | `rate.ts:62-89`                           | load (`maybeSingle`) → `applyRating(card ?? empty, rating 1-4)` → upsert. **Fatal** on load (`:70-73`) and upsert (`:84-87`).                                                                                                  |
| Route (test submit)   | `submit.ts:83-121`                        | batch load (`.in(...)`) → per-question branch (wrong→Again(1), correct-with-card→Good(3), correct-first-timer→**skip**) → batch upsert. **Best-effort / swallowed** (`:115-120` logs and continues; outer `catch` `:119-121`). |
| DB                    | `srs_question_state` / `srs_review_state` | own-only RLS, `(user_id, question_id                                                                                                                                                                                           | lesson_id)`PK,`due` index. **No RPC writes either table** — all writes are route-issued upserts under caller RLS. |

### The specific leaks

1. **No single enforcement point.** The load→`applyRating`→upsert sequence is
   inline in **three** routes (`grade.ts:74-86`, `rate.ts:64-83`, `submit.ts:85-114`).
   The `CARD_COLUMNS` select list is a byte-identical string literal duplicated
   across all three (`grade.ts:8`, `rate.ts:24`, `submit.ts:6-7`) — confirmed by the
   prior research as debt **D1** (5-place lockstep, no compiler guard).
2. **The advance is not atomic.** Each route does a separate `SELECT` then `UPSERT`
   under caller RLS (`grade.ts:74-86`, `rate.ts:64-83`, `submit.ts:85-114`). Two
   concurrent graded reviews of the same card (e.g. a double-submit, or practice in
   two tabs) **read the same prior state and last-writer-wins** — a lost FSRS update.
   I4 says the next state is a _function of the prior state_; a read-modify-write
   across two round-trips cannot guarantee that. This is the deepest weakness and it
   is invisible to every current test (the fakes ignore concurrency and RLS —
   research **D6**, `fake-supabase.ts`).
3. **Inconsistent failure contract.** `rate` and `grade` are fatal; `submit`
   swallows (`submit.ts:115-120`). The posture is decided _by which file you are in_,
   not by an explicit policy — so the next SRS writer inherits whichever pattern its
   author copied. The M3L5 fix had to be applied **per route** for exactly this reason.
4. **Client is not a guardian (good) but the route is the only one (bad).** Islands
   are server-authoritative (verified) — so the rule is not leaked to the client.
   But the server-side guardian is _the route handler itself_, which also does HTTP
   parsing, auth, and response mapping. The invariant has no home of its own.
5. **Return shape unchecked** (`grade.ts:65`, `submit.ts:74-78` — `as` cast over
   `Json`, research **D2**): a renamed RPC field silently yields `undefined`, feeding
   garbage into the advance.

---

## STEP 4 — Design: the SRS-card aggregate-guardian

### The aggregate

The aggregate **root is the SRS card** — one learner's scheduling state for one
_reviewable_ (a question, or a lesson). Its identity is `(userId, reviewableId,
deck)` where `deck ∈ {question, lesson}` selects the table. The card's FSRS fields
are its internal state; the **only** legal way to change them is to apply a graded
review. That is the single precondition the root enforces.

New load-bearing names:

- `SrsCard` — the aggregate root (a domain object, not a DB row).
- `Deck` — `"question" | "lesson"` (which table / id column the card belongs to).
- `ReviewOutcome` — the rating to apply: for lessons a `ReviewRating` (1-4); for
  questions a correctness mapped to `Good(3) | Again(1)` (the practice mapping,
  today inline at `grade.ts:80`).
- `SchedulePolicy` — `"required" | "best-effort"`: the **explicit** per-call posture
  that replaces the implicit by-which-file-you're-in asymmetry.
- `SrsRescheduleError` — the **named domain error** thrown when a `required` advance
  cannot persist (replaces the three different inline 500s).
- `SrsCardRepository` — loads / advances the aggregate atomically.
- `advance_srs_card(...)` — the new SECURITY DEFINER RPC that makes the advance one
  transaction (mirrors the existing definer pattern; see below).

### Domain root (signatures + pseudocode)

`src/lib/domain/srs-card.ts` (pure, no DB — importable in a Worker):

```ts
export type Deck = "question" | "lesson";

export class SrsCard {
  private constructor(
    readonly id: { userId: string; reviewableId: string; deck: Deck },
    private fields: SrsCardFields, // reuse src/lib/srs.ts SrsCardFields
  ) {}

  /** Load an existing card, or seed a New one (state New, due now). */
  static load(id: SrsCard["id"], row: SrsCardFields | null, now = new Date()): SrsCard {
    return new SrsCard(id, row ?? emptyCardFields(now));
  }

  /**
   * The ONLY mutator. Precondition: a review actually happened (the caller
   * supplies the outcome). Advances FSRS state from the *current* fields.
   * Pure: returns the next fields; persistence is the repository's job.
   */
  applyReview(outcome: ReviewOutcome, now = new Date()): SrsCardFields {
    const rating =
      outcome.kind === "lesson"
        ? outcome.rating // 1-4, validated upstream
        : outcome.isCorrect
          ? 3
          : 1; // practice mapping (was grade.ts:80)
    this.fields = applyRating(this.fields, rating, now); // src/lib/srs.ts
    return this.fields;
  }
}
```

There is no setter that bypasses `applyReview`; an illegal "advance the due date
without a review" is _unrepresentable_ — that is how the root enforces I4 in the
domain layer.

### Repository (atomicity → one transaction → SECURITY DEFINER RPC)

Per the project's Postgres/Supabase reality, "one transaction" means a SECURITY
DEFINER RPC (matching `submit_test_attempt`'s shape; honoring `lessons.md`: keep the
key server-side, own-only). The repository wraps the RPC so the route never touches
SQL:

```ts
// src/lib/services/srs-card-repository.ts
export interface SrsCardRepository {
  /**
   * Atomically: read current card under own-only RLS, apply the review in-DB,
   * upsert. The whole read-modify-write is one statement → no lost update.
   * Throws SrsRescheduleError on a failed write when policy === "required".
   */
  advance(input: {
    deck: Deck;
    userId: string;
    reviewableId: string;
    outcome: ReviewOutcome;
    policy: SchedulePolicy;
    now?: Date;
  }): Promise<{ due: string }>;
}
```

The new RPC `advance_srs_card(p_deck text, p_reviewable_id uuid, p_rating int)`:

```sql
-- SECURITY DEFINER, volatile, set search_path = public.
-- auth.uid() is the user (never trust a client-passed user_id) → enforces I6.
-- Reads + writes the row in ONE statement so the advance is atomic (fixes the
-- read-modify-write race). FSRS math stays in TS (src/lib/srs.ts) — so the RPC
-- takes the already-computed next fields, OR (preferred) the rating, and the
-- next-state is computed by a single UPSERT ... SELECT against the current row.
```

Decision to record in the plan, not pre-judge: FSRS-6 math lives in `ts-fsrs`
(TypeScript). Two atomicity options —
**(A)** keep `applyRating` in TS, send the next fields, and gate the upsert on the
row version / `last_review` you read (optimistic concurrency: `update ... where
user_id=auth.uid() and reviewable_id=$ and last_review is not distinct from $read`);
or
**(B)** move the read-modify-write into one definer statement and call `applyRating`
via a TS-in-Postgres boundary you do not have.
**Recommend (A)** — it keeps the single source of FSRS math (`srs.ts`, avoids
reimplementing FSRS in PL/pgSQL), turns the two round-trips into a _guarded_ single
upsert, and the guard makes the advance atomic enough to kill last-writer-wins. The
guardian (repository) owns the guard; routes never see it.

### Thin route (parse → aggregate method → map domain error)

```ts
// grade.ts after refactor — illustrative
const { selected } = parse(body); // zod
const { isCorrect, correctOptionIds } = await gradeQuestion(supabase, questionId, selected); // existing definer RPC
try {
  await srsCards.advance({
    deck: "question",
    userId,
    reviewableId: questionId,
    outcome: { kind: "question", isCorrect },
    policy: "required",
  });
} catch (e) {
  if (e instanceof SrsRescheduleError) return json({ error: "reschedule_failed" }, 500);
  throw e;
}
return json({ isCorrect, correctOptionIds }, 200);
```

`submit.ts` calls the _same_ `srsCards.advance(...)` per missed question with
`policy: "best-effort"` — the swallow is now an **explicit, named** choice, not an
inline `catch`. `rate.ts` calls it with `deck: "lesson", policy: "required"`.

---

## STEP 5 — Before/after, phased plan, tests

### Before → after, per current site

| Site                                        | Before                                         | After                                                                                                    |
| ------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `grade.ts:8`, `rate.ts:24`, `submit.ts:6-7` | `CARD_COLUMNS` literal ×3                      | gone — column list owned once by the repository (kills D1)                                               |
| `grade.ts:72-94`                            | inline load→applyRating→upsert, fatal          | `srsCards.advance({deck:"question", policy:"required"})`; maps `SrsRescheduleError`→500                  |
| `rate.ts:62-89`                             | inline load (fatal)→applyRating→upsert (fatal) | `srsCards.advance({deck:"lesson", policy:"required"})`                                                   |
| `submit.ts:83-121`                          | inline batch, swallowed                        | loop `srsCards.advance({deck:"question", policy:"best-effort"})`; the swallow is the policy, logged once |
| `grade.ts:80` (correct?3:1)                 | inline mapping                                 | moved into `SrsCard.applyReview`                                                                         |
| `grade.ts:65`, `submit.ts:74-78`            | `as` cast over `Json` (D2)                     | typed RPC-return parse at the repository boundary (zod or a checked decoder)                             |
| 2 round-trips, no atomicity                 | lost-update race                               | one guarded upsert in `advance_srs_card` (or optimistic guard)                                           |

### Phased refactor (test-first marked)

- **Phase 0 — characterization (TEST-FIRST).** _Before any code moves_, pin current
  behavior so the refactor is provably behavior-preserving: extend
  `route-contracts.test.ts` and add the missing cases the prior research flagged —
  `grade` RPC-error path (D4), `grade` `invalid_selection`/UUID regex (D5). Also add
  an **integration** test (real Supabase) for a `grade → upsert` round-trip and an
  `srs_review_state` rate round-trip — the round-trip is _currently uncovered_ (D6).
  These are the safety net; they must pass unchanged after every later phase.
- **Phase 1 — extract the root (TEST-FIRST).** Add `src/lib/domain/srs-card.ts`
  (`SrsCard`, `applyReview`, `Deck`, `ReviewOutcome`). Unit-test in isolation; no
  route touches it yet.
- **Phase 2 — repository over the _existing_ writes (TEST-FIRST for the contract).**
  Add `SrsCardRepository` that initially wraps the current select+upsert (no new RPC
  yet) and owns `CARD_COLUMNS` and the typed RPC-return decode (D2). Route the three
  handlers through it with explicit `policy`. After this phase the three routes are
  thin and the three failure postures are _named_, but persistence is still the old
  two round-trips. CI unit + integration must stay green.
- **Phase 3 — atomicity (TEST-FIRST, integration).** Add `advance_srs_card`
  SECURITY DEFINER RPC (own-only via `auth.uid()`, single guarded upsert) per
  `migration up` discipline (never `db reset` — `feedback-no-db-reset`). Point the
  repository at it. New integration tests assert the lost-update race is closed
  (two concurrent advances of one card → exactly one FSRS step, not last-writer-wins).
- **Phase 4 — cleanup.** Delete the dead `CARD_COLUMNS` literals; confirm no route
  imports `srs.ts` persistence concerns directly.

### Test cases (legal + illegal transitions)

Legal:

- New card + correct practice → advances Good(3), `due` moves forward, `reps≥1`
  (today `grade.test.ts:89-93` analogue).
- New card + wrong practice → enrols Again(1) (today `submit.test.ts:78-87`).
- Existing card + lesson rating 1-4 → advances per FSRS, `due` returned
  (`rate.test.ts`).
- `submit` correct-first-timer → **no** card written (the load-bearing skip,
  `submit.test.ts:71-76`).

Illegal / failure:

- `required` advance whose write fails → throws `SrsRescheduleError` → route 500
  (replaces `grade`/`rate` inline 500s; `route-contracts.test.ts:136-167`).
- `best-effort` advance whose write fails → no throw, 200, logged once
  (`submit`'s posture, `route-contracts.test.ts:101-122`).
- Two concurrent `required` advances of one card → one FSRS step persisted, not two
  reads racing (Phase 3, integration; currently untestable).
- Forged `user_id` cannot touch another user's card — own-only via `auth.uid()`
  inside the RPC (I6 regression guard; analogue `idor.itest.ts`).

### New load-bearing names (summary)

`SrsCard`, `Deck`, `ReviewOutcome`, `SchedulePolicy` (`"required" | "best-effort"`),
`SrsRescheduleError`, `SrsCardRepository.advance(...)`, the `advance_srs_card`
SECURITY DEFINER RPC. The first home of the SRS scheduling invariant:
`src/lib/domain/srs-card.ts` + `src/lib/services/srs-card-repository.ts`.

---

## Constraints honored

- **Fail-fast:** the only swallow is the _explicitly named_ `best-effort` policy
  (today's intentional `submit` posture); every `required` advance throws a named
  domain error that stops the operation. No silent state writes.
- **Cited only verified `file:line`.** No production code changed.
- **Postgres atomicity** via SECURITY DEFINER RPC + own-only RLS — matches the
  existing `submit_test_attempt` pattern and the `lessons.md` answer-key rule; uses
  `migration up`, never `db reset` (`feedback-no-db-reset`).
