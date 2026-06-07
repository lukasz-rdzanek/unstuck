import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeApiContext } from "@/test/harness/api-context";
import { makeFakeSupabase, type WriteCall } from "@/test/harness/fake-supabase";
import type { User } from "@supabase/supabase-js";

// R2/SRS — lesson-review rate. The raw 1–4 rating is passed straight to FSRS (no
// correctness remap), and the upsert binds the session user_id + path lesson_id.
// Oracle = the rating pass-through (spied) + the binding (captured). (Fatal-error
// posture for rate is covered in route-contracts.test.ts.)

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/srs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/srs")>();
  return { ...actual, applyRating: vi.fn(actual.applyRating) };
});

import { POST } from "@/pages/api/reviews/[lessonId]/rate";
import { createClient } from "@/lib/supabase";
import { applyRating } from "@/lib/srs";

const USER = { id: "user-1" } as User;
const LESSON = "l-1";

function fake() {
  const f = makeFakeSupabase({
    tables: { srs_review_state: { read: { data: null, error: null }, write: { data: null, error: null } } },
  });
  vi.mocked(createClient).mockReturnValue(f.client);
  return f;
}
function run(rating: number) {
  return POST(makeApiContext({ user: USER, params: { lessonId: LESSON }, body: { rating } }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("R2/SRS — lesson review rate", () => {
  it.each([1, 2, 3, 4])("passes the raw rating %i through to applyRating unchanged", async (rating) => {
    fake();
    await run(rating);
    expect(vi.mocked(applyRating).mock.calls.some((c) => c[1] === rating)).toBe(true);
  });

  it("upsert binds the session user_id + path lesson_id with onConflict user_id,lesson_id", async () => {
    const f = fake();
    const res = await run(3);
    expect(res.status).toBe(200);
    const w = f.writes.find((write: WriteCall) => write.op === "upsert");
    const row = w?.rows as Record<string, unknown> | undefined;
    expect(row?.user_id).toBe(USER.id);
    expect(row?.lesson_id).toBe(LESSON);
    expect((w?.options as { onConflict?: string } | undefined)?.onConflict).toBe("user_id,lesson_id");
  });
});
