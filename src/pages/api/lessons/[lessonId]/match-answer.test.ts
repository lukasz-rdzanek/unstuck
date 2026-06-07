import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeApiContext } from "@/test/harness/api-context";
import { makeFakeSupabase } from "@/test/harness/fake-supabase";
import type { User } from "@supabase/supabase-js";

// R6/R5 — match-answer endpoint contract. The headline is the DEGRADE posture:
// any dependency failure must return { ok:true, match:null }/200, never 500 —
// the chat must not break over a missing suggestion. Oracle = that contract.

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/embeddings", () => ({ embedText: vi.fn(), toVectorLiteral: vi.fn(() => "[0]") }));
vi.mock("@/lib/services/answer-match", () => ({ getCourseIdForLesson: vi.fn(), matchAnswer: vi.fn() }));

import { POST } from "@/pages/api/lessons/[lessonId]/match-answer";
import { createClient } from "@/lib/supabase";
import { embedText } from "@/lib/embeddings";
import { getCourseIdForLesson, matchAnswer } from "@/lib/services/answer-match";

const USER = { id: "u-1" } as User;
const LESSON = "11111111-1111-1111-1111-111111111111";

function body(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockReturnValue(makeFakeSupabase().client);
  vi.mocked(getCourseIdForLesson).mockResolvedValue("course-1");
  vi.mocked(embedText).mockResolvedValue([0, 1, 2]);
  vi.mocked(matchAnswer).mockResolvedValue({ messageId: "m-9" } as never);
});

describe("R6 — match-answer endpoint contract", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(makeApiContext({ params: { lessonId: LESSON }, body: { question: "hi there friend" } }));
    expect(res.status).toBe(401);
    expect((await body(res)).error).toBe("unauthenticated");
  });

  it("400 missing_lesson_id when the param is absent", async () => {
    const res = await POST(makeApiContext({ user: USER, body: { question: "hi there friend" } }));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("missing_lesson_id");
  });

  it("400 invalid_json on a non-JSON body", async () => {
    const res = await POST(makeApiContext({ user: USER, params: { lessonId: LESSON }, body: "{not json" }));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("invalid_json");
  });

  it("400 invalid_request when the question fails the schema", async () => {
    const res = await POST(makeApiContext({ user: USER, params: { lessonId: LESSON }, body: { question: "" } }));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("invalid_request");
  });

  it("500 supabase_not_configured when the client is null", async () => {
    vi.mocked(createClient).mockReturnValue(null);
    const res = await POST(
      makeApiContext({ user: USER, params: { lessonId: LESSON }, body: { question: "hi there friend" } }),
    );
    expect(res.status).toBe(500);
    expect((await body(res)).error).toBe("supabase_not_configured");
  });

  it("returns { match:null }/200 when the lesson has no course", async () => {
    vi.mocked(getCourseIdForLesson).mockResolvedValue(null);
    const res = await POST(
      makeApiContext({ user: USER, params: { lessonId: LESSON }, body: { question: "hi there friend" } }),
    );
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.ok).toBe(true);
    expect(b.match).toBeNull();
  });

  it("returns the match on the happy path", async () => {
    const res = await POST(
      makeApiContext({ user: USER, params: { lessonId: LESSON }, body: { question: "how does streaming work" } }),
    );
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.ok).toBe(true);
    expect(b.match).toEqual({ messageId: "m-9" });
  });

  it("DEGRADES to { match:null }/200 when a dependency throws (never 500s the chat)", async () => {
    vi.mocked(embedText).mockRejectedValue(new Error("workers AI down"));
    const res = await POST(
      makeApiContext({ user: USER, params: { lessonId: LESSON }, body: { question: "how does streaming work" } }),
    );
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.ok).toBe(true);
    expect(b.match).toBeNull();
  });
});
