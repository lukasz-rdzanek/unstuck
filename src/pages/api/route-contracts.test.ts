import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeApiContext } from "@/test/harness/api-context";
import { makeFakeSupabase, type FakeSupabaseOptions } from "@/test/harness/fake-supabase";
import type { User } from "@supabase/supabase-js";

// R6 — cross-cutting contract sweep + the swallow-vs-fatal posture for the JSON
// routes not given a dedicated file. The shared invariants (unauth/missing-param/
// invalid_json/supabase-null) plus the asymmetry that submit/grade SWALLOW an SRS
// write failure (still 200) while rate/complete treat DB errors as FATAL (500).
// (The SRS enrol-branch payloads themselves are Phase 4.)

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

import { POST as submit } from "@/pages/api/tests/[testId]/submit";
import { POST as grade } from "@/pages/api/practice/[questionId]/grade";
import { POST as rate } from "@/pages/api/reviews/[lessonId]/rate";
import { POST as completePost, DELETE as completeDelete } from "@/pages/api/lessons/[lessonId]/complete";
import { createClient } from "@/lib/supabase";

const USER = { id: "u-1" } as User;

function body(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}
function setClient(opts: FakeSupabaseOptions = {}) {
  vi.mocked(createClient).mockReturnValue(makeFakeSupabase(opts).client);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  setClient();
});

// route → { param, validBody, missingErr, invalidJsonErr (or null if no body parse) }
const ROUTES = [
  {
    name: "submit",
    fn: submit,
    params: { testId: "t-1" },
    validBody: { answers: {} },
    missingParam: {},
    missingErr: "missing_test_id",
    jsonErr: "invalid_answers",
  },
  {
    name: "grade",
    fn: grade,
    params: { questionId: "q-1" },
    validBody: { selected: [] },
    missingParam: {},
    missingErr: "missing_question_id",
    jsonErr: "invalid_selection",
  },
  {
    name: "rate",
    fn: rate,
    params: { lessonId: "l-1" },
    validBody: { rating: 1 },
    missingParam: {},
    missingErr: "missing_lesson_id",
    jsonErr: "invalid_rating",
  },
] as const;

describe("R6 — cross-cutting JSON route contracts", () => {
  for (const r of ROUTES) {
    describe(r.name, () => {
      it("401 when unauthenticated", async () => {
        const res = await r.fn(makeApiContext({ params: r.params, body: r.validBody }));
        expect(res.status).toBe(401);
        expect((await body(res)).error).toBe("unauthenticated");
      });
      it(`400 ${r.missingErr} when the param is absent`, async () => {
        const res = await r.fn(makeApiContext({ user: USER, params: r.missingParam }));
        expect(res.status).toBe(400);
        expect((await body(res)).error).toBe(r.missingErr);
      });
      it("400 invalid_json on a non-JSON body", async () => {
        const res = await r.fn(makeApiContext({ user: USER, params: r.params, body: "{not json" }));
        expect(res.status).toBe(400);
        expect((await body(res)).error).toBe("invalid_json");
      });
      it("500 supabase_not_configured when the client is null", async () => {
        vi.mocked(createClient).mockReturnValue(null);
        const res = await r.fn(makeApiContext({ user: USER, params: r.params, body: r.validBody }));
        expect(res.status).toBe(500);
        expect((await body(res)).error).toBe("supabase_not_configured");
      });
    });
  }

  it("complete: 401 unauth, 400 missing_lesson_id, 500 supabase_not_configured", async () => {
    expect((await completePost(makeApiContext({}))).status).toBe(401);
    expect((await completePost(makeApiContext({ user: USER }))).status).toBe(400);
    vi.mocked(createClient).mockReturnValue(null);
    expect((await completePost(makeApiContext({ user: USER, params: { lessonId: "l-1" } }))).status).toBe(500);
  });
});

describe("R6 — degradation posture (swallow vs fatal)", () => {
  it("submit SWALLOWS an SRS upsert failure → still 200 with the grading result", async () => {
    setClient({
      rpc: () => ({
        data: {
          score: 0.5,
          passed: true,
          perQuestion: [{ questionId: "q-9", isCorrect: false, correctOptionIds: [] }],
        },
        error: null,
      }),
      tables: {
        srs_question_state: {
          read: { data: [], error: null },
          write: { data: null, error: { message: "upsert boom" } },
        },
      },
    });
    const res = await submit(makeApiContext({ user: USER, params: { testId: "t-1" }, body: { answers: {} } }));
    expect(res.status).toBe(200);
    expect((await body(res)).score).toBe(0.5);
  });

  it("submit returns 500 grade_failed when the grading RPC errors (fatal)", async () => {
    setClient({ rpc: () => ({ data: null, error: { message: "rpc boom" } }) });
    const res = await submit(makeApiContext({ user: USER, params: { testId: "t-1" }, body: { answers: {} } }));
    expect(res.status).toBe(500);
    expect((await body(res)).error).toBe("grade_failed");
  });

  it("grade SWALLOWS a reschedule upsert failure → still 200", async () => {
    setClient({
      rpc: () => ({ data: { isCorrect: true, correctOptionIds: [] }, error: null }),
      tables: {
        srs_question_state: {
          read: { data: null, error: null },
          write: { data: null, error: { message: "upsert boom" } },
        },
      },
    });
    const res = await grade(makeApiContext({ user: USER, params: { questionId: "q-1" }, body: { selected: [] } }));
    expect(res.status).toBe(200);
    expect((await body(res)).isCorrect).toBe(true);
  });

  it("rate is FATAL on a load error → 500 load_failed", async () => {
    setClient({ tables: { srs_review_state: { read: { data: null, error: { message: "load boom" } } } } });
    const res = await rate(makeApiContext({ user: USER, params: { lessonId: "l-1" }, body: { rating: 3 } }));
    expect(res.status).toBe(500);
    expect((await body(res)).error).toBe("load_failed");
  });

  it("rate is FATAL on an upsert error → 500 save_failed", async () => {
    setClient({
      tables: {
        srs_review_state: { read: { data: null, error: null }, write: { data: null, error: { message: "save boom" } } },
      },
    });
    const res = await rate(makeApiContext({ user: USER, params: { lessonId: "l-1" }, body: { rating: 3 } }));
    expect(res.status).toBe(500);
    expect((await body(res)).error).toBe("save_failed");
  });

  it("complete is FATAL on an upsert error → 500 save_failed; happy → 200; DELETE → 200", async () => {
    setClient({ tables: { lesson_completions: { write: { data: null, error: { message: "save boom" } } } } });
    expect((await completePost(makeApiContext({ user: USER, params: { lessonId: "l-1" } }))).status).toBe(500);
    setClient();
    expect((await completePost(makeApiContext({ user: USER, params: { lessonId: "l-1" } }))).status).toBe(200);
    expect((await completeDelete(makeApiContext({ user: USER, params: { lessonId: "l-1" } }))).status).toBe(200);
  });

  it("complete DELETE is FATAL on a delete error → 500 delete_failed", async () => {
    setClient({ tables: { lesson_completions: { write: { data: null, error: { message: "delete boom" } } } } });
    const res = await completeDelete(makeApiContext({ user: USER, params: { lessonId: "l-1" } }));
    expect(res.status).toBe(500);
    expect((await body(res)).error).toBe("delete_failed");
  });
});
