import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serviceClient, authedClientFor, type DbClient } from "./setup/clients";
import { createRunFixture, cleanup, type RunFixture } from "./setup/fixtures";

// R2 — cross-user IDOR. A logged-in user must not read or write another user's
// own-only rows (test_attempts, attempt_answers, srs_review_state,
// srs_question_state, lesson_completions, enrollments). Oracle = the ownership
// contract (user_id = auth.uid()), NOT the SQL. Each denial is paired with an
// own-path control proving the policy is ownership-scoped, not blanket.
//
// The one deliberate exception: messages SELECT is COURSE-gated, not author-
// owned (seeded/peer messages are a shared lesson chat by design). So the
// message IDOR surface is the foreign-author INSERT rejection + immutability,
// and we explicitly assert a peer CAN read a shared message — documenting the
// subtlety so a future change doesn't "fix" it into a false denial.

const RUN_ID = "idor";

// Seed FREE course assets — both users can access them via is_free, so the only
// gate under test is row ownership.
const SEED_TEST_ID = "f1000000-0000-0000-0000-000000000001";
const SEED_LESSON_ID = "b0000000-0000-0000-0000-000000000001";
const SEED_QUESTION_ID = "f2000000-0000-0000-0000-000000000001";
const SEED_SEEDED_MESSAGE_ID = "d0000000-0000-0000-0000-000000000001";

// A's correct answers for a real attempt via the definer write path.
const A_ANSWERS: Record<string, string[]> = {
  "f2000000-0000-0000-0000-000000000001": ["f3000000-0000-0000-0000-000000000001"],
  "f2000000-0000-0000-0000-000000000002": [
    "f3000000-0000-0000-0000-000000000004",
    "f3000000-0000-0000-0000-000000000005",
  ],
};

describe("R2 — cross-user IDOR is denied", () => {
  let fx: RunFixture;
  let A: DbClient; // owner of the rows
  let B: DbClient; // attacker / peer
  let attemptId: string;

  beforeAll(async () => {
    fx = await createRunFixture(RUN_ID);
    A = await authedClientFor(fx.enrolled.email, fx.enrolled.password);
    B = await authedClientFor(fx.outsider.email, fx.outsider.password);
    const svc = serviceClient();
    const due = new Date().toISOString();

    // A creates a real attempt (+ attempt_answers) through the definer path.
    const submit = await A.rpc("submit_test_attempt", { p_test_id: SEED_TEST_ID, p_answers: A_ANSWERS });
    if (submit.error !== null) {
      throw new Error(`A submit_test_attempt: ${submit.error.message}`);
    }
    const attempt = await A.from("test_attempts").select("id").eq("test_id", SEED_TEST_ID).single();
    if (attempt.error !== null) {
      throw new Error(`read A attempt: ${attempt.error.message}`);
    }
    attemptId = attempt.data.id;

    // A's own SRS + completion rows (service_role setup with user_id = A).
    const seed1 = await svc
      .from("srs_review_state")
      .insert({ user_id: fx.enrolled.id, lesson_id: SEED_LESSON_ID, due });
    if (seed1.error !== null) throw new Error(`seed srs_review_state: ${seed1.error.message}`);
    const seed2 = await svc
      .from("srs_question_state")
      .insert({ user_id: fx.enrolled.id, question_id: SEED_QUESTION_ID, due });
    if (seed2.error !== null) throw new Error(`seed srs_question_state: ${seed2.error.message}`);
    const seed3 = await svc.from("lesson_completions").insert({ user_id: fx.enrolled.id, lesson_id: SEED_LESSON_ID });
    if (seed3.error !== null) throw new Error(`seed lesson_completions: ${seed3.error.message}`);
    // A's enrollment in the gated course already exists from the fixture.
  });

  afterAll(async () => {
    await cleanup(RUN_ID, [fx.enrolled, fx.outsider]);
  });

  // ---- read denial (own-only tables) + own-path control --------------------

  it("test_attempts: B cannot read A's attempt; A can", async () => {
    const asB = await B.from("test_attempts").select("id").eq("id", attemptId);
    expect(asB.error).toBeNull();
    expect(asB.data).toEqual([]);

    const asA = await A.from("test_attempts").select("id").eq("id", attemptId);
    expect(asA.data?.length).toBe(1);
  });

  it("attempt_answers: B cannot read A's answers; A can", async () => {
    const asB = await B.from("attempt_answers").select("question_id").eq("attempt_id", attemptId);
    expect(asB.error).toBeNull();
    expect(asB.data).toEqual([]);

    const asA = await A.from("attempt_answers").select("question_id").eq("attempt_id", attemptId);
    expect(asA.data?.length).toBeGreaterThan(0);
  });

  it("srs_review_state: B cannot read A's card; A can", async () => {
    const asB = await B.from("srs_review_state")
      .select("reps")
      .eq("user_id", fx.enrolled.id)
      .eq("lesson_id", SEED_LESSON_ID);
    expect(asB.data).toEqual([]);

    const asA = await A.from("srs_review_state")
      .select("reps")
      .eq("user_id", fx.enrolled.id)
      .eq("lesson_id", SEED_LESSON_ID);
    expect(asA.data?.length).toBe(1);
  });

  it("srs_question_state: B cannot read A's card; A can", async () => {
    const asB = await B.from("srs_question_state")
      .select("reps")
      .eq("user_id", fx.enrolled.id)
      .eq("question_id", SEED_QUESTION_ID);
    expect(asB.data).toEqual([]);

    const asA = await A.from("srs_question_state")
      .select("reps")
      .eq("user_id", fx.enrolled.id)
      .eq("question_id", SEED_QUESTION_ID);
    expect(asA.data?.length).toBe(1);
  });

  it("lesson_completions: B cannot read A's completion; A can", async () => {
    const asB = await B.from("lesson_completions")
      .select("lesson_id")
      .eq("user_id", fx.enrolled.id)
      .eq("lesson_id", SEED_LESSON_ID);
    expect(asB.data).toEqual([]);

    const asA = await A.from("lesson_completions")
      .select("lesson_id")
      .eq("user_id", fx.enrolled.id)
      .eq("lesson_id", SEED_LESSON_ID);
    expect(asA.data?.length).toBe(1);
  });

  it("enrollments: B cannot read A's enrollment; A can", async () => {
    const asB = await B.from("enrollments").select("id").eq("user_id", fx.enrolled.id);
    expect(asB.data).toEqual([]);

    const asA = await A.from("enrollments").select("id").eq("course_id", fx.gatedCourseId);
    expect(asA.data?.length).toBe(1);
  });

  // ---- write denial --------------------------------------------------------

  it("B cannot insert a lesson_completion with a foreign user_id", async () => {
    const res = await B.from("lesson_completions").insert({ user_id: fx.enrolled.id, lesson_id: SEED_LESSON_ID });
    expect(res.error).not.toBeNull();
  });

  it("B cannot insert into test_attempts at all (definer-only write path)", async () => {
    const res = await B.from("test_attempts").insert({
      user_id: fx.outsider.id, // even B's OWN id is rejected — there is no authenticated INSERT policy
      test_id: SEED_TEST_ID,
      score: 0,
      passed: false,
    });
    expect(res.error).not.toBeNull();
  });

  it("B's UPDATE of A's srs card affects zero rows and changes nothing", async () => {
    const upd = await B.from("srs_review_state")
      .update({ reps: 999 })
      .eq("user_id", fx.enrolled.id)
      .eq("lesson_id", SEED_LESSON_ID)
      .select("reps");
    expect(upd.error).toBeNull();
    expect(upd.data).toEqual([]); // USING clause hides A's row from B

    // Confirm A's row is untouched (read back with the service client).
    const after = await serviceClient()
      .from("srs_review_state")
      .select("reps")
      .eq("user_id", fx.enrolled.id)
      .eq("lesson_id", SEED_LESSON_ID)
      .single();
    expect(after.data?.reps).toBe(0);
  });

  it("A CAN update A's own srs card (control — policy is ownership-scoped, not blanket)", async () => {
    const upd = await A.from("srs_review_state")
      .update({ reps: 1 })
      .eq("user_id", fx.enrolled.id)
      .eq("lesson_id", SEED_LESSON_ID)
      .select("reps");
    expect(upd.error).toBeNull();
    expect(upd.data?.length).toBe(1);
    expect(upd.data?.[0]?.reps).toBe(1);
  });

  // ---- messages: course-gated, not author-owned ----------------------------

  it("B (a peer with course access) CAN read a shared seeded message", async () => {
    // Documents the intentional design: message SELECT is gated by course access,
    // not authorship. The seed course is free, so B has access.
    const res = await B.from("messages").select("id").eq("id", SEED_SEEDED_MESSAGE_ID);
    expect(res.error).toBeNull();
    expect(res.data?.length).toBe(1);
  });

  it("B cannot insert a message as another author", async () => {
    const res = await B.from("messages").insert({
      lesson_id: SEED_LESSON_ID,
      author_id: fx.enrolled.id, // foreign author → WITH CHECK rejects
      body: "spoofed author",
      is_seeded: false,
    });
    expect(res.error).not.toBeNull();
  });

  it("B cannot insert a seeded (operator-curated) message", async () => {
    const res = await B.from("messages").insert({
      lesson_id: SEED_LESSON_ID,
      author_id: fx.outsider.id,
      body: "fake operator post",
      is_seeded: true, // only operator seeding may set this → WITH CHECK rejects
    });
    expect(res.error).not.toBeNull();
  });

  it("B cannot update or delete any message (immutability; FR-007)", async () => {
    const upd = await B.from("messages").update({ body: "hacked" }).eq("id", SEED_SEEDED_MESSAGE_ID).select("id");
    expect(upd.error).toBeNull();
    expect(upd.data).toEqual([]);

    const del = await B.from("messages").delete().eq("id", SEED_SEEDED_MESSAGE_ID).select("id");
    expect(del.error).toBeNull();
    expect(del.data).toEqual([]);

    // The message is untouched.
    const after = await serviceClient().from("messages").select("body").eq("id", SEED_SEEDED_MESSAGE_ID).single();
    expect(after.data?.body).not.toBe("hacked");
  });
});
