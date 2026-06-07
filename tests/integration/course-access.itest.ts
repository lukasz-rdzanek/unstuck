import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedClientFor, type DbClient } from "./setup/clients";
import { createRunFixture, cleanup, type RunFixture } from "./setup/fixtures";

// R4 — has_course_access gating. A non-enrolled user must not reach gated
// (is_free=false) course content via tables OR definer RPCs. Oracle = the access
// contract (free OR enrolled), NOT the SQL. The seed has only a free course, so
// the fixture builds a gated course and enrolls exactly one user — the enrolled
// user is the control proving the gate is the ENROLLMENT, not some unrelated
// denial.

const RUN_ID = "course-access";

// A 768-dim zero vector for match_lesson_answers. The gated message has no
// embedding, so this RPC returns [] regardless of access — we use it only to
// confirm the non-enrolled path returns [] (no leak / no throw), not as an
// enrolled-vs-outsider distinction.
const ZERO_VEC = `[${new Array(768).fill(0).join(",")}]`;

describe("R4 — non-enrolled user is denied gated-course content", () => {
  let fx: RunFixture;
  let enrolled: DbClient;
  let outsider: DbClient;

  beforeAll(async () => {
    fx = await createRunFixture(RUN_ID);
    enrolled = await authedClientFor(fx.enrolled.email, fx.enrolled.password);
    outsider = await authedClientFor(fx.outsider.email, fx.outsider.password);
  });

  afterAll(async () => {
    await cleanup(RUN_ID, [fx.enrolled, fx.outsider]);
  });

  // ---- table SELECT gating + enrolled control ------------------------------

  it("lessons: outsider denied, enrolled allowed", async () => {
    const out = await outsider.from("lessons").select("id").eq("course_id", fx.gatedCourseId);
    expect(out.data).toEqual([]);
    const inn = await enrolled.from("lessons").select("id").eq("course_id", fx.gatedCourseId);
    expect(inn.data?.length).toBe(1);
  });

  it("messages: outsider denied, enrolled allowed", async () => {
    const out = await outsider.from("messages").select("id").eq("lesson_id", fx.lessonId);
    expect(out.data).toEqual([]);
    const inn = await enrolled.from("messages").select("id").eq("lesson_id", fx.lessonId);
    expect(inn.data?.length).toBe(1);
  });

  it("tests: outsider denied, enrolled allowed", async () => {
    const out = await outsider.from("tests").select("id").eq("course_id", fx.gatedCourseId);
    expect(out.data).toEqual([]);
    const inn = await enrolled.from("tests").select("id").eq("course_id", fx.gatedCourseId);
    expect(inn.data?.length).toBe(1);
  });

  it("questions: outsider denied, enrolled allowed", async () => {
    const out = await outsider.from("questions").select("id").eq("test_id", fx.testId);
    expect(out.data).toEqual([]);
    const inn = await enrolled.from("questions").select("id").eq("test_id", fx.testId);
    expect(inn.data?.length).toBe(1);
  });

  // ---- definer RPC gating --------------------------------------------------

  it("get_test_questions: outsider gets [], enrolled gets the question", async () => {
    const out = await outsider.rpc("get_test_questions", { p_test_id: fx.testId });
    expect(out.error).toBeNull();
    expect(out.data as unknown as unknown[]).toEqual([]);

    const inn = await enrolled.rpc("get_test_questions", { p_test_id: fx.testId });
    expect(inn.error).toBeNull();
    expect((inn.data as unknown as unknown[]).length).toBe(1);
  });

  it("submit_test_attempt: outsider gets no_access, enrolled succeeds", async () => {
    const answers: Record<string, string[]> = { [fx.questionId]: [fx.correctOptionId] };

    const out = await outsider.rpc("submit_test_attempt", { p_test_id: fx.testId, p_answers: answers });
    expect(out.error).not.toBeNull();
    expect(out.error?.message).toContain("no_access");

    const inn = await enrolled.rpc("submit_test_attempt", { p_test_id: fx.testId, p_answers: answers });
    expect(inn.error).toBeNull();
    expect(inn.data).not.toBeNull(); // the RPC actually graded + returned a result
  });

  it("grade_question: outsider gets no_access, enrolled succeeds", async () => {
    const out = await outsider.rpc("grade_question", {
      p_question_id: fx.questionId,
      p_selected: [fx.correctOptionId],
    });
    expect(out.error).not.toBeNull();
    expect(out.error?.message).toContain("no_access");

    const inn = await enrolled.rpc("grade_question", {
      p_question_id: fx.questionId,
      p_selected: [fx.correctOptionId],
    });
    expect(inn.error).toBeNull();
    expect(inn.data).not.toBeNull(); // the RPC actually graded + returned a verdict
  });

  it("get_due_practice_questions: outsider gets [] (no access)", async () => {
    const out = await outsider.rpc("get_due_practice_questions", { p_course_id: fx.gatedCourseId });
    expect(out.error).toBeNull();
    expect(out.data as unknown as unknown[]).toEqual([]);
  });

  it("match_lesson_answers: outsider gets [] (no access)", async () => {
    const out = await outsider.rpc("match_lesson_answers", {
      p_course_id: fx.gatedCourseId,
      p_query_embedding: ZERO_VEC,
      // The generated rpc types mark these non-nullable; pass harmless dummy
      // uuids (the access gate denies before they matter).
      p_exclude_author: fx.outsider.id,
      p_exclude_message_id: fx.seededMessageId,
      p_match_threshold: 0,
      p_match_count: 5,
    });
    expect(out.error).toBeNull();
    expect(out.data ?? []).toEqual([]);
  });
});
