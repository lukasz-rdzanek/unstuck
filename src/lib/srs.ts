/**
 * FSRS-6 scheduling helper (spaced-repetition-review).
 *
 * One pure module wrapping `ts-fsrs` so the algorithm version + parameters are
 * pinned in a single place and the rating API route stays thin. No DB access,
 * no `window`/`document` — safe to import in a Worker API route. v1 uses the
 * default (un-optimized) FSRS-6 parameters; per-user optimization is out of
 * scope (no cron infra yet).
 *
 * Persisted columns mirror the ts-fsrs `Card` interface, minus the deprecated
 * `elapsed_days` (an unused output field FSRS recomputes from `last_review`).
 * The DB stores `timestamptz` as ISO strings; ts-fsrs works in `Date`.
 */

import { createEmptyCard, fsrs, generatorParameters, type Card } from "ts-fsrs";
import type { SrsReviewState } from "@/types";

/** FSRS-6 scheduler with default parameters. */
const scheduler = fsrs(generatorParameters());

/** The subset of srs_review_state that maps to a ts-fsrs Card (no elapsed_days). */
export type SrsCardFields = Pick<
  SrsReviewState,
  "due" | "stability" | "difficulty" | "scheduled_days" | "learning_steps" | "reps" | "lapses" | "state" | "last_review"
>;

/** Learner grade: 1 Again · 2 Hard · 3 Good · 4 Easy (ts-fsrs Rating values). */
export type ReviewRating = 1 | 2 | 3 | 4;

/**
 * DB row (ISO strings) → ts-fsrs Card (Date objects). Spreads an empty card so
 * the deprecated `elapsed_days` field is supplied by ts-fsrs itself (we never
 * name it), then overrides with the persisted state.
 */
function rowToCard(row: SrsCardFields): Card {
  return {
    ...createEmptyCard(new Date(row.due)),
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

/** ts-fsrs Card → persisted row fields (Dates → ISO strings; absent last_review → null). */
function cardToRow(card: Card): SrsCardFields {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

/** Initial card for a freshly enrolled lesson (state New, due now). */
export function emptyCardFields(now: Date = new Date()): SrsCardFields {
  return cardToRow(createEmptyCard(now));
}

/** Apply a grade to the current card and return the next persisted fields. */
export function applyRating(current: SrsCardFields, rating: ReviewRating, now: Date = new Date()): SrsCardFields {
  const { card } = scheduler.next(rowToCard(current), now, rating);
  return cardToRow(card);
}
