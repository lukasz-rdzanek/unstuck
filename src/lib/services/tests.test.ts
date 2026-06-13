import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeSupabase } from "@/test/harness/fake-supabase";
import { getPassedTestIdsForCourse } from "@/lib/services/tests";

// getPassedTestIdsForCourse drives the green completion check on test rows in
// the course nav. It reads own-only `test_attempts` (passed = true) and returns
// a deduped Set of test_id for O(1) lookup.

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("getPassedTestIdsForCourse", () => {
  it("maps passed attempt rows to a deduped Set of test ids", async () => {
    const fake = makeFakeSupabase({
      tables: {
        test_attempts: {
          // multiple passing attempts for the same test must collapse to one id
          read: { data: [{ test_id: "t1" }, { test_id: "t2" }, { test_id: "t1" }], error: null },
        },
      },
    });
    const ids = await getPassedTestIdsForCourse(fake.client, "course-1", "user-1");
    expect(ids).toEqual(new Set(["t1", "t2"]));
  });

  it("returns an empty Set on error (fails closed — no false checks)", async () => {
    const fake = makeFakeSupabase({
      tables: { test_attempts: { read: { data: null, error: { message: "db down" } } } },
    });
    const ids = await getPassedTestIdsForCourse(fake.client, "course-1", "user-1");
    expect(ids.size).toBe(0);
  });
});
