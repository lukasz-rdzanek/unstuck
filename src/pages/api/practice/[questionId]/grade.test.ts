import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeApiContext } from "@/test/harness/api-context";
import { makeFakeSupabase, type WriteCall } from "@/test/harness/fake-supabase";
import type { User } from "@supabase/supabase-js";

// R2/SRS — practice grade always reschedules: correct→Good(3), wrong→Again(1).
// Unlike submit, a correct first-timer DOES enrol. Oracle = the rating mapping
// (spied) + the session→user_id binding (captured), not the FSRS numbers.

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/srs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/srs")>();
  return { ...actual, applyRating: vi.fn(actual.applyRating) };
});

import { POST } from "@/pages/api/practice/[questionId]/grade";
import { createClient } from "@/lib/supabase";
import { applyRating } from "@/lib/srs";

const USER = { id: "user-1" } as User;
const QUESTION = "q-1";

function fakeFor(isCorrect: boolean, existing: Record<string, unknown> | null) {
  const fake = makeFakeSupabase({
    rpc: () => ({ data: { isCorrect, correctOptionIds: [] }, error: null }),
    tables: { srs_question_state: { read: { data: existing, error: null }, write: { data: null, error: null } } },
  });
  vi.mocked(createClient).mockReturnValue(fake.client);
  return fake;
}
function upsertRow(writes: WriteCall[]): Record<string, unknown> | undefined {
  return writes.find((w) => w.op === "upsert")?.rows as Record<string, unknown> | undefined;
}
function run() {
  return POST(makeApiContext({ user: USER, params: { questionId: QUESTION }, body: { selected: [] } }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("R2/SRS — practice grade rescheduling", () => {
  it.each([
    { isCorrect: true, rating: 3 },
    { isCorrect: false, rating: 1 },
  ])("maps isCorrect=$isCorrect → rating $rating", async ({ isCorrect, rating }) => {
    fakeFor(isCorrect, null);
    await run();
    expect(vi.mocked(applyRating).mock.calls.some((c) => c[1] === rating)).toBe(true);
  });

  it("enrols a correct first-timer (upsert with the session user_id)", async () => {
    const fake = fakeFor(true, null);
    const res = await run();
    expect(res.status).toBe(200);
    const row = upsertRow(fake.writes);
    expect(row?.user_id).toBe(USER.id);
    expect(row?.question_id).toBe(QUESTION);
  });

  // M3L5 (test-driven bugfixing): the reschedule IS the point of grading a due
  // practice card. If the persisted schedule write fails, the card's `due` never
  // moves and the SAME question keeps coming back — but the handler used to log
  // and return 200, hiding it (a swallowed error, OWASP A10:2025). The reschedule
  // failure must surface, consistent with reviews/rate's `save_failed` → 500.
  it("surfaces a failed reschedule as 500 — never a swallowed 200", async () => {
    const fake = makeFakeSupabase({
      rpc: () => ({ data: { isCorrect: true, correctOptionIds: [] }, error: null }),
      tables: {
        srs_question_state: { read: { data: null, error: null }, write: { data: null, error: { message: "db down" } } },
      },
    });
    vi.mocked(createClient).mockReturnValue(fake.client);
    const res = await run();
    expect(res.status).toBe(500);
    expect((await (res.json() as Promise<{ error: string }>)).error).toBe("reschedule_failed");
  });
});
