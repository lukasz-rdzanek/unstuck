import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeApiContext } from "@/test/harness/api-context";
import { makeFakeSupabase, type FakeSupabaseOptions, type WriteCall } from "@/test/harness/fake-supabase";
import type { User } from "@supabase/supabase-js";

// R2/SRS (deferred from Phase 2) — submit's 3-way enrol branch. Oracle = the
// branch decision + session→user_id binding, captured from the upsert payload —
// NOT the FSRS numbers (those are unit-covered in srs.test.ts). applyRating runs
// for real (spied) so we can also assert the rating each branch applies.

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/srs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/srs")>();
  return { ...actual, applyRating: vi.fn(actual.applyRating) };
});

import { POST } from "@/pages/api/tests/[testId]/submit";
import { createClient } from "@/lib/supabase";
import { applyRating } from "@/lib/srs";

const USER = { id: "user-1" } as User;
const Q1 = "q-1";
const Q2 = "q-2";
const Q3 = "q-3";

interface PerQuestion {
  questionId: string;
  isCorrect: boolean;
  correctOptionIds: string[];
}
/** An existing srs_question_state card row (Review state). */
function card(questionId: string) {
  return {
    question_id: questionId,
    due: new Date().toISOString(),
    stability: 2,
    difficulty: 5,
    scheduled_days: 1,
    learning_steps: 0,
    reps: 3,
    lapses: 0,
    state: 2,
    last_review: null,
  };
}

/** Build the fake: submit_test_attempt → perQuestion; existing cards for the read. */
function fakeFor(perQuestion: PerQuestion[], existing: ReturnType<typeof card>[]) {
  const opts: FakeSupabaseOptions = {
    rpc: () => ({ data: { score: 0, passed: false, perQuestion }, error: null }),
    tables: { srs_question_state: { read: { data: existing, error: null }, write: { data: null, error: null } } },
  };
  const fake = makeFakeSupabase(opts);
  vi.mocked(createClient).mockReturnValue(fake.client);
  return fake;
}
function upsertRows(writes: WriteCall[]): Record<string, unknown>[] {
  const u = writes.find((w) => w.op === "upsert" && w.table === "srs_question_state");
  return (u?.rows as Record<string, unknown>[] | undefined) ?? [];
}
function run() {
  return POST(makeApiContext({ user: USER, params: { testId: "t-1" }, body: { answers: {} } }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("R2/SRS — submit enrol branches", () => {
  it("a correct first-timer is NOT enrolled (no upsert row)", async () => {
    const fake = fakeFor([{ questionId: Q1, isCorrect: true, correctOptionIds: [] }], []);
    const res = await run();
    expect(res.status).toBe(200);
    expect(fake.writes).toHaveLength(0); // the load-bearing skip — no enrolment
  });

  it("a wrong answer enrols with Again(1), binding the session user_id", async () => {
    const fake = fakeFor([{ questionId: Q1, isCorrect: false, correctOptionIds: [] }], []);
    await run();
    const rows = upsertRows(fake.writes);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(USER.id);
    expect(rows[0].question_id).toBe(Q1);
    expect(rows[0].reps as number).toBeGreaterThanOrEqual(1);
    expect(vi.mocked(applyRating).mock.calls.some((c) => c[1] === 1)).toBe(true);
  });

  it("a correct answer WITH an existing card advances it with Good(3)", async () => {
    fakeFor([{ questionId: Q2, isCorrect: true, correctOptionIds: [] }], [card(Q2)]);
    await run();
    expect(vi.mocked(applyRating).mock.calls.some((c) => c[1] === 3)).toBe(true);
  });

  it("a mixed batch upserts exactly the wrong + correct-with-card rows (first-timer-correct absent)", async () => {
    const fake = fakeFor(
      [
        { questionId: Q1, isCorrect: false, correctOptionIds: [] }, // wrong → enrol
        { questionId: Q2, isCorrect: true, correctOptionIds: [] }, // correct + card → advance
        { questionId: Q3, isCorrect: true, correctOptionIds: [] }, // correct first-timer → skip
      ],
      [card(Q2)],
    );
    await run();
    const rows = upsertRows(fake.writes);
    expect(rows.map((r) => r.question_id).sort()).toEqual([Q1, Q2]);
    expect(rows.every((r) => r.user_id === USER.id)).toBe(true);
  });
});
