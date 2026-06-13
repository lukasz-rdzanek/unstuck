import { describe, it, expect } from "vitest";
import { emptyCardFields, applyRating, SRS_CARD_COLUMNS, SRS_CARD_COLUMN_ORDER } from "@/lib/srs";

// Characterization (refactor-opportunities / M4L4): pin the SRS card column
// contract BEFORE consolidating the CARD_COLUMNS literals duplicated across the
// grade/rate/submit routes. The persisted card shape IS the 9 FSRS columns.
const EXPECTED_CARD_COLUMNS = [
  "due",
  "stability",
  "difficulty",
  "scheduled_days",
  "learning_steps",
  "reps",
  "lapses",
  "state",
  "last_review",
];

describe("srs card column contract", () => {
  it("emptyCardFields exposes exactly the persisted SRS card columns", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(Object.keys(emptyCardFields(now)).sort()).toEqual([...EXPECTED_CARD_COLUMNS].sort());
  });

  it("SRS_CARD_COLUMNS is the single source, complete and in order", () => {
    expect(SRS_CARD_COLUMNS).toBe(EXPECTED_CARD_COLUMNS.join(", "));
    // the literal must stay in sync with the compile-checked column tuple
    expect(SRS_CARD_COLUMNS).toBe(SRS_CARD_COLUMN_ORDER.join(", "));
    // completeness guard: the select-string covers every persisted card column
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(SRS_CARD_COLUMNS.split(", ").sort()).toEqual(Object.keys(emptyCardFields(now)).sort());
  });
});

describe("srs (FSRS scheduling)", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");

  it("emptyCardFields starts a fresh card due now with no reps/lapses", () => {
    const card = emptyCardFields(now);
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
    expect(card.due).toBe(now.toISOString());
    expect(typeof card.stability).toBe("number");
  });

  it("applyRating increments reps and schedules Easy further out than Again", () => {
    const fresh = emptyCardFields(now);
    const again = applyRating(fresh, 1, now); // 1 = Again
    const easy = applyRating(fresh, 4, now); // 4 = Easy
    expect(again.reps).toBe(1);
    expect(easy.reps).toBe(1);
    // Core FSRS property: a correct/easy answer is scheduled later than a lapse.
    expect(new Date(easy.due).getTime()).toBeGreaterThan(new Date(again.due).getTime());
  });
});
