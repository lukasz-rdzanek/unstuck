---
date: 2026-06-13T22:20:00+0200
researcher: Claude (10x-research, 3 parallel sub-agents — shape / history / feasibility)
git_commit: fa4f14a
branch: master
repository: unstuck
topic: "Refactor opportunities — rank what to fix from the practice/SRS Deep Focus"
tags: [research, refactor, srs, grading, ranking, m4l4, verified]
status: complete
last_updated: 2026-06-13
last_updated_by: Claude
---

# Refactor opportunities — practice/SRS/grading

Exploration only. Reads [`../practice-srs-grading-analysis/research.md`](../practice-srs-grading-analysis/research.md)
(Deep Focus, M4L3) and [`../../map/repo-map.md`](../../map/repo-map.md) as priors —
their findings are **evidence**, not re-derived. Answers the question M4L3 left
open: **which** problems are worth fixing, in **what target shape**, in **what
order**. No refactor here, no decision — the ranking is a proposal for the
planning session.

## Candidate audit (classify before investigating)

Every problem the prior report recorded, classified **CANDIDATE** (a fix that
changes code _structure_) vs **input** (test/doc/process gap — kept as
feasibility/cost input, not a refactor target).

| From M4L3                    | Problem                                                                             | Class                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1                           | `CARD_COLUMNS` SRS card-column list duplicated across 3 routes                      | **CANDIDATE → C1**                                                              |
| D2                           | `grade_question` (and sibling jsonb RPCs) return consumed via `as` cast over `Json` | **CANDIDATE → C2**                                                              |
| _(new, found in shape scan)_ | `UUID_RE` lenient-UUID regex duplicated byte-identical across 3 routes              | **CANDIDATE → C3**                                                              |
| _(new, found in shape scan)_ | `jsonResponse` + `JsonResponseInit` boilerplate copy-pasted into ~6 routes          | **CANDIDATE → C4**                                                              |
| D3                           | `srs.ts` is a shared FSRS hub (3 routes / 2 tables); coupling hidden by git         | **input** — healthy DI hub, not a structural defect; awareness item, no rebuild |
| D4                           | `grade_failed` (RPC error) branch untested                                          | **input** (test gap)                                                            |
| D5                           | `invalid_selection` / `UUID_RE` branch untested                                     | **input** (test gap)                                                            |
| D6                           | No DB/e2e coverage of the reschedule round-trip                                     | **input** (test gap)                                                            |
| D7                           | FSRS numbers not pinned; `answer-match.ts`/`tests.ts` services untested             | **input** (test gap)                                                            |
| —                            | `database.types.ts` ↔ `types.ts` co-change                                          | **not a problem** — cheap regeneration, explicitly excluded as debt             |
| U2                           | No generated-types drift guard in CI                                                | **input** — a CI guard, not a structural refactor                               |

The test-gap inputs (D4–D7) don't become refactors, but they **raise the change
cost** of any candidate (less safety net) → they argue for characterization
tests before touching, and they shape the feasibility notes below.

## Per-candidate findings

### C1 — `CARD_COLUMNS` SRS card-column list duplicated

- **Current shape (evidence).** `const CARD_COLUMNS = …` lives in three routes:
  `grade.ts:8` and `rate.ts:24` are **byte-identical** (9 columns); `submit.ts:6`
  is **not** — it leads with a 10th column `question_id` (it reads
  `srs_question_state` keyed by `question_id`, used at `submit.ts:90`), while
  `grade`/`submit` hit `srs_question_state` and `rate` hits `srs_review_state`.
  The type side `SrsCardFields` (`srs.ts:22-25`) names the same 9 columns, and
  `rate.ts:23` even carries a comment asserting `== SrsCardFields` — but there is
  **no compile/runtime link**: a typo in a literal is a runtime `.select()`
  error, not a build break.
- **Intentionality (evidence → verdict: ACCIDENTAL).** Introduced incrementally:
  `rate.ts` first (`117ae87`, spaced-repetition-review p2), then `submit.ts` +
  `grade.ts` an hour later in a different change (`5633f4e`, learning-loop p3). No
  ADR/plan chose to duplicate; no past bug from drift. The project's own M4L3
  research already flags it as debt D1. → genuinely consolidatable; no conscious
  constraint protects the duplication. (Caveat: it is _known, documented_ debt.)
- **Feasibility (evidence/inference).** Natural home exists: `srs.ts` already owns
  `SrsCardFields`. Smallest reversible path: define the 9-column list once
  (derive both the string and the type from one ordered source via `satisfies`/
  `Record<keyof SrsCardFields, true>` so they can't drift), export `SRS_CARD_COLUMNS`,
  and have `submit.ts` compose `` `question_id, ${SRS_CARD_COLUMNS}` ``. Blast
  radius: exactly 3 `.select()` call-sites (`grade.ts:76`, `rate.ts:66`,
  `submit.ts:87`); all server routes (`prerender = false`), no client-bundling
  risk; `srs.ts` stays pure (Worker-safe). Safety net: `grade/rate/submit.test.ts`
  - `route-contracts.test.ts` + `srs.test.ts`, all in CI — but **none asserts the
    column list**. First prerequisite: a characterization test in `srs.test.ts`
    pinning the current 9-column string against the `SrsCardFields` keys.

### C2 — jsonb-RPC returns consumed via `as` cast over `Json`

- **Current shape (evidence).** `grade.ts:65` casts `data as {isCorrect, correctOptionIds}`
  over `Returns: Json` (`database.types.ts:617-620`). Same pattern in `submit.ts:74`
  (`submit_test_attempt`), `tests.ts:53,66` (`get_test_questions`,
  `get_due_practice_questions`). **4 cast-sites across 3 files.** Exception:
  `match_lesson_answers` (`answer-match.ts:43`) is consumed with no cast — its SQL
  uses `RETURNS TABLE`, so codegen types it. No RPC return is zod-validated anywhere.
- **Intentionality (evidence → verdict: CONSCIOUS / FORCED CONVENTION).** The `Json`
  opacity is a **Supabase codegen artifact**: a function `RETURNS jsonb` → codegen
  emits opaque `Json` → casting is the only available pattern short of manual
  validation, and it is applied **uniformly** by every jsonb-RPC consumer. The
  bespoke `jsonb` shapes are themselves deliberate (the grading functions keep the
  answer key server-side; see `context/foundation/lessons.md`). So this is _not_
  accidental copy-paste and _not_ a grade.ts-only oversight — it's an accepted
  convention with a known, documented cost (M4L3 debt D2).
- **Feasibility (evidence/inference/unknown).** zod is already used for _request_
  validation in these routes, so a `gradeResultSchema.parse(data)` at the boundary
  is a familiar, additive, one-revert move per site. But honest scope is **repo-wide**
  (4 sites, 4 distinct shapes); a correct schema needs each RPC's true JSON shape
  from its SQL migration (**partly unknown** until read), and an over-strict schema
  could turn a working path into a 500. Don't single out `grade.ts` — fixing one
  cast leaves the convention inconsistent.

### C3 — `UUID_RE` lenient-UUID regex duplicated

- **Current shape (evidence).** The identical regex `^[0-9a-fA-F]{8}-…-[0-9a-fA-F]{12}$`
  (+ its "Postgres-lenient, not strict `z.uuid()`" rationale comment) appears
  byte-identical in `grade.ts:22`, `submit.ts:26`, `match-answer.ts:20`, each
  inside a zod schema. **Verdict: ACCIDENTAL** copy-paste (separate from C1).
- **Feasibility.** Trivial: one shared `uuidString` zod refinement / regex const in
  `src/lib/`, imported by the 3 routes. Additive, one revert. Clustered with C1 in
  the same SRS routes.

### C4 — `jsonResponse` boilerplate duplicated

- **Current shape (evidence).** Identical `interface JsonResponseInit { status }`
  - `function jsonResponse(body, {status})` copy-pasted into ~6 API routes
    (`grade.ts:14`, `rate.ts:12`, `submit.ts:15`, `match-answer.ts:13`,
    `complete.ts:10`, `embeddings/backfill.ts:13`). **Verdict: ACCIDENTAL.**
- **Feasibility.** Trivial: one shared helper in `src/lib/`. Pure ergonomics,
  lowest risk, no behavior change. Lowest priority (no failure mode, just churn).

## Refactor opportunities (ranked)

Ranked by **right-sizing**: guard-first, debt-cost × change-cost, reversibility.
The history pass changed the picture — see "How history moved the ranking" below.

### #1 — C1: type-derived single source for the SRS card column list

- **Current → target.** Three hand-maintained `.select()` strings → one
  `SRS_CARD_COLUMNS` in `srs.ts`, derived from the `SrsCardFields` field set so the
  string and type cannot drift; `submit.ts` composes `question_id, ${…}`.
- **Why #1.** Cheapest genuine _structural_ win: accidental drift (not a
  conscious constraint), natural home already exists, compile-time sync removes
  the silent-failure class entirely. Debt cost is moderate (drift mostly fails
  loud), but change cost is near-zero and fully reversible → best return.
- **Blast radius.** 3 `.select()` call-sites, all server routes; `srs.ts` stays pure.
- **Incremental path.** (1) characterization test pinning the 9-column list ↔
  `SrsCardFields` keys; (2) add derived `SRS_CARD_COLUMNS` export; (3) swap the 3
  literals for imports (submit composes the +`question_id` variant).
- **First prerequisite.** Characterization test in `src/lib/srs.test.ts`.

### #2 — C2: validate jsonb-RPC returns at the boundary (higher value, larger scope)

- **Current → target.** `as`-cast over `Json` → a zod schema `.parse(data)` (or a
  small typed-RPC wrapper) at each jsonb-RPC boundary, failing loud on mismatch.
- **Why #2.** Highest-value debt — the `as` cast is the genuinely _silent_
  failure mode (SQL return drifts → `undefined` at runtime, no compile error).
  But it ranks below C1 because it's a **forced, repo-wide convention** (4 sites,
  4 shapes), needs per-RPC SQL archaeology, and risks over-strict schemas → 500s.
  A guard at a single site is cheap; full adoption leans "structural".
- **Blast radius.** 4 cast-sites / 3 files (grade, submit, tests×2); `match_lesson_answers` already typed.
- **Incremental path.** Confirm `grade_question`'s SQL return shape → add a parsed
  schema at `grade.ts:65` behind a logged 500 fallback → repeat per RPC.
- **First prerequisite.** Read the RPC's SQL `RETURNS` body to author an exact schema.

### #3 — C3: shared lenient-UUID zod refinement

- **Current → target.** Three byte-identical `UUID_RE` literals → one shared
  `uuidString` refinement in `src/lib/`.
- **Why #3.** Trivial, accidental, clustered with C1 — a natural same-session
  add-on. Low debt cost (drift would fail loud), near-zero change cost.
- **Blast radius.** 3 zod schemas (grade, submit, match-answer). **Prerequisite:** none beyond a unit assertion.

## Considered & rejected (with reasons)

- **C4 (`jsonResponse` boilerplate).** Real accidental duplication but pure
  ergonomics — no failure mode, just churn across 6 files. Worth a cheap
  follow-up, not a ranked refactor.
- **D3 (`srs.ts` hub).** Not a defect — dependency injection is the right shape;
  the "debt" was reviewer-awareness (git under-reports the coupling), not
  structure. No rebuild.
- **D4–D7 (test gaps).** Not structural refactors. They are the safety-net inputs
  that make "characterize before touching" mandatory for C1/C2.
- **U2 (types-drift CI guard).** A process/CI addition, not a code-structure change.
- **The two-table SRS split / submit-vs-grade failure asymmetry.** Deliberate and
  documented (different domains; fail-loud vs best-effort by design) — not debt.
- **Anything touching the FSRS algorithm or business meaning of "practice vs
  review".** Out of scope — that's domain modelling (M4L5), per the contract's
  business-concepts boundary.

## How history moved the ranking (the M4L4 point)

- The **premise was corrected**: C1 is _not_ a clean triplication — `submit.ts`
  carries a load-bearing 10th `question_id` column. A naive "one identical
  constant" would have been wrong; the target respects the table asymmetry.
- **C2 was downgraded** from "obvious quick fix" to "high-value but larger,
  forced-convention pattern": history showed the `as` cast is codegen-mandated and
  uniform, not a grade.ts slip — so the right fix is repo-wide, not a one-liner.
- **History surfaced cheaper wins** the M4L3 debt map under-labelled (C3 `UUID_RE`,
  C4 `jsonResponse`) — accidental dups clustered in the same SRS routes, ideal
  guard-first companions to C1.

## Weryfikacja twierdzeń (ast-grep)

Verified at `git_commit fa4f14a`. Method: `ast-grep -p '<pattern>' -l ts src`
(AST-precise); per the M4L3/M4L4 rule, **every zero is confirmed with `grep`** so a
bad pattern can't masquerade as "no occurrences". Ranking order and intentionality
verdicts unchanged — this only sharpens the numbers.

| Claim                                                                           | Verdict                  | Evidence (`file:line`)                                                              | Method                                                                                                    |
| ------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| C1 — `CARD_COLUMNS` defined in **3** routes                                     | **CONFIRMED**            | `grade.ts:8`, `rate.ts:24`, `submit.ts:6`                                           | `const CARD_COLUMNS = $A` → 3                                                                             |
| C1 — `grade`/`rate` 9-col identical; `submit` differs (+`question_id`, 10 cols) | **CONFIRMED**            | `submit.ts:6-7` = `"question_id, due, …"`; `grade.ts:8`==`rate.ts:24` (9 cols)      | grep of the literal values                                                                                |
| C2 — jsonb-RPC return via `as` cast at **4** sites / 3 files                    | **CONFIRMED**            | `grade.ts:65`, `submit.ts:74`, `tests.ts:58`, `tests.ts:71`                         | grep `data as {` / `as …Question[]`                                                                       |
| C2 — `match_lesson_answers` consumed **without** cast (typed `RETURNS TABLE`)   | **CONFIRMED**            | `answer-match.ts:43,55-57` (`row.message_id` direct)                                | grep                                                                                                      |
| C3 — `UUID_RE` defined in **3** routes, byte-identical                          | **CONFIRMED**            | `grade.ts:22`, `submit.ts:26`, `match-answer.ts:20`                                 | `const UUID_RE = $A` → 3                                                                                  |
| C4 — `jsonResponse` boilerplate in **6** routes                                 | **CONFIRMED (via grep)** | `grade.ts`, `rate.ts`, `submit.ts`, `match-answer.ts`, `complete.ts`, `backfill.ts` | ast-grep `function jsonResponse(...){...}` → **0** (bad pattern) → `grep "function jsonResponse"` → **6** |

**Note (the lesson's rule in action):** the C4 ast-grep pattern returned **0** —
which, taken at face value, would have read as "no duplication". The mandatory
`grep` cross-check refuted that: the helper is duplicated in **6** files. The zero
was a pattern artifact (function-with-body matching), not absence. No ranking
position moved; C4 stays a rejected/low-priority follow-up regardless.
