import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedClientFor, type DbClient } from "./setup/clients";
import { createRunFixture, cleanup, type RunFixture } from "./setup/fixtures";

// R5(a) — match_lesson_answers must never return a row from another course,
// even when that course holds a more-similar message; and the threshold /
// exclude filters must hold. Crafted vectors give controlled cosines (course A
// ≈ 0.8, trap ≈ 1.0 to the query), so no Workers AI is needed.

const RUN_ID = "match-isolation";
const NIL = "00000000-0000-0000-0000-000000000000"; // "no exclusion" sentinel (matches no real row)

interface MatchRow {
  message_id: string;
  lesson_id: string;
  similarity: number;
}

describe("R5(a) — answer-match cross-course isolation", () => {
  let fx: RunFixture;
  let learner: DbClient;

  beforeAll(async () => {
    fx = await createRunFixture(RUN_ID);
    learner = await authedClientFor(fx.enrolled.email, fx.enrolled.password);
  });

  afterAll(async () => {
    await cleanup(RUN_ID, [fx.enrolled, fx.outsider]);
  });

  function match(courseId: string, opts?: { threshold?: number; excludeAuthor?: string; excludeMessage?: string }) {
    return learner.rpc("match_lesson_answers", {
      p_course_id: courseId,
      p_query_embedding: fx.matchQueryVec,
      p_exclude_author: opts?.excludeAuthor ?? NIL,
      p_exclude_message_id: opts?.excludeMessage ?? NIL,
      p_match_threshold: opts?.threshold ?? 0.5,
      p_match_count: 5,
    });
  }

  it("returns only the target course's message, never a more-similar one in another course", async () => {
    const res = await match(fx.matchCourseAId);
    expect(res.error).toBeNull();
    const rows = (res.data ?? []) as unknown as MatchRow[];
    expect(rows.length).toBeGreaterThan(0);
    // Every row belongs to course A's lesson; the trap is absent.
    for (const r of rows) {
      expect(r.lesson_id).toBe(fx.matchLessonAId);
    }
    const ids = rows.map((r) => r.message_id);
    expect(ids).toContain(fx.matchMessageAId);
    expect(ids).not.toContain(fx.trapMessageId);
  });

  it("the trap really is more similar (so the fence prevents a higher-ranked leak)", async () => {
    const a = (((await match(fx.matchCourseAId)).data ?? []) as unknown as MatchRow[]).find(
      (r) => r.message_id === fx.matchMessageAId,
    );
    const trap = (((await match(fx.trapCourseId)).data ?? []) as unknown as MatchRow[]).find(
      (r) => r.message_id === fx.trapMessageId,
    );
    expect(a).toBeDefined();
    expect(trap).toBeDefined();
    expect(trap?.similarity ?? 0).toBeGreaterThan(a?.similarity ?? 0);
  });

  it("threshold floor excludes a below-threshold match", async () => {
    // Course A's similarity ≈ 0.8; a 0.95 floor drops it.
    const res = await match(fx.matchCourseAId, { threshold: 0.95 });
    expect(res.error).toBeNull();
    expect(res.data ?? []).toEqual([]);
  });

  it("exclude_message_id drops that message", async () => {
    const res = await match(fx.matchCourseAId, { excludeMessage: fx.matchMessageAId });
    expect(res.error).toBeNull();
    expect(res.data ?? []).toEqual([]);
  });

  it("exclude_author drops that author's messages", async () => {
    const res = await match(fx.matchCourseAId, { excludeAuthor: fx.enrolled.id });
    expect(res.error).toBeNull();
    expect(res.data ?? []).toEqual([]);
  });
});
