import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, authedClientFor, serviceClient, type DbClient } from "./setup/clients";
import { createRunFixture, cleanup, type RunFixture } from "./setup/fixtures";

// Role-matrix coverage ported from the retired supabase/tests/rls_matrix.sql
// probe (which asserted the same cells at the Postgres `set role` layer). These
// re-assert the cells NOT already covered by answer-key / idor / course-access,
// but through the real JWT path:
//   - Cell 1: anon — catalog readable; lessons/messages/enrollments denied.
//   - Cell 3: a no-enrollment authenticated user still sees a FREE-course lesson
//             (is_free trumps enrollment).
//   - Cell 2: a learner CAN post their own non-seed message (positive control).
//   - Cell 6: cross-user DELETE of a completion affects zero rows.

const RUN_ID = "role-matrix";
const SEED_FREE_COURSE_ID = "a0000000-0000-0000-0000-000000000001";
const SEED_LESSON_ID = "b0000000-0000-0000-0000-000000000001";

describe("RLS role matrix (ported from rls_matrix.sql)", () => {
  let fx: RunFixture;
  let learner: DbClient;
  let peer: DbClient;

  beforeAll(async () => {
    fx = await createRunFixture(RUN_ID);
    learner = await authedClientFor(fx.enrolled.email, fx.enrolled.password);
    peer = await authedClientFor(fx.outsider.email, fx.outsider.password);
  });

  afterAll(async () => {
    await cleanup(RUN_ID, [fx.enrolled, fx.outsider]);
  });

  it("Cell 1 — anon: catalog readable, gated tables denied", async () => {
    const anon = anonClient();

    const courses = await anon.from("courses").select("id");
    expect(courses.error).toBeNull();
    expect((courses.data ?? []).length).toBeGreaterThan(0);

    const chapters = await anon.from("chapters").select("id");
    expect((chapters.data ?? []).length).toBeGreaterThan(0);

    const lessons = await anon.from("lessons").select("id");
    expect(lessons.data).toEqual([]);

    const messages = await anon.from("messages").select("id");
    expect(messages.data).toEqual([]);

    const enrollments = await anon.from("enrollments").select("id");
    expect(enrollments.data).toEqual([]);
  });

  it("Cell 3 — a no-enrollment user still sees a free-course lesson (is_free trumps)", async () => {
    // `peer` is not enrolled in the gated course, but the seed course is free.
    const res = await peer.from("lessons").select("id").eq("course_id", SEED_FREE_COURSE_ID);
    expect(res.error).toBeNull();
    expect((res.data ?? []).length).toBeGreaterThan(0);
  });

  it("Cell 2 — a learner can post their own non-seed message (positive control)", async () => {
    const ins = await learner
      .from("messages")
      .insert({
        lesson_id: SEED_LESSON_ID,
        author_id: fx.enrolled.id,
        body: "peer post (role-matrix)",
        is_seeded: false,
      })
      .select("id")
      .single();
    // The message is on the SHARED seed lesson and messages.author_id is
    // ON DELETE SET NULL (not cascade), so user-teardown won't remove it —
    // clean it up in a finally so a failed assertion can't leak an orphan.
    try {
      expect(ins.error).toBeNull();
      expect(ins.data?.id).toBeTruthy();
    } finally {
      if (ins.data !== null) {
        await serviceClient().from("messages").delete().eq("id", ins.data.id);
      }
    }
  });

  it("Cell 6 — cross-user DELETE of a completion affects zero rows", async () => {
    const svc = serviceClient();
    // `learner` owns a completion on the seed lesson.
    const seeded = await svc.from("lesson_completions").insert({ user_id: fx.enrolled.id, lesson_id: SEED_LESSON_ID });
    expect(seeded.error).toBeNull();

    // `peer` tries to delete it → silent RLS denial (0 rows).
    const del = await peer
      .from("lesson_completions")
      .delete()
      .eq("user_id", fx.enrolled.id)
      .eq("lesson_id", SEED_LESSON_ID)
      .select("lesson_id");
    expect(del.error).toBeNull();
    expect(del.data).toEqual([]);

    // The row still exists.
    const after = await svc
      .from("lesson_completions")
      .select("lesson_id")
      .eq("user_id", fx.enrolled.id)
      .eq("lesson_id", SEED_LESSON_ID);
    expect(after.data?.length).toBe(1);
  });
});
