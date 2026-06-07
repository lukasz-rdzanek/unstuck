import { describe, it, expect } from "vitest";
import { emptyCardFields, applyRating } from "@/lib/srs";

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
