import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedClientFor } from "./setup/clients";
import { createRunFixture, cleanup, type RunFixture } from "./setup/fixtures";

// R1 — the quiz answer key (question_options.is_correct) must NEVER reach a
// learner. This invariant is an ABSENCE of policy (question_options has RLS
// ENABLE-not-FORCE + no authenticated SELECT policy), so we probe every read
// path a future migration could open: the raw table, a PostgREST embed, and the
// taking RPC. Oracle = the seed answer key, derived independently of the SQL:
//   Q1 (f2…001) correct = f3…001;  Q2 (f2…002) correct = f3…004, f3…005.
// We assert a learner can see the OPTIONS (to take the test) but can never tell
// which are correct.

const RUN_ID = "answer-key";

// Seeded free course → any authenticated user has access via is_free, so the
// only thing standing between a learner and is_correct is the question_options
// RLS posture. That's exactly what R1 pins.
const SEED_TEST_ID = "f1000000-0000-0000-0000-000000000001";
const SEED_Q1_CORRECT = "f3000000-0000-0000-0000-000000000001";
const SEED_Q2_CORRECT_A = "f3000000-0000-0000-0000-000000000004";
const SEED_Q2_CORRECT_B = "f3000000-0000-0000-0000-000000000005";

interface TakingOption {
  id: string;
  body: string;
  position: number;
}
interface TakingQuestion {
  id: string;
  options: TakingOption[];
}

describe("R1 — answer key is never readable by a learner", () => {
  let fx: RunFixture;

  beforeAll(async () => {
    fx = await createRunFixture(RUN_ID);
  });

  afterAll(async () => {
    await cleanup(RUN_ID, [fx.enrolled, fx.outsider]);
  });

  it("raw question_options SELECT returns zero rows (RLS denial)", async () => {
    const learner = await authedClientFor(fx.enrolled.email, fx.enrolled.password);

    const all = await learner.from("question_options").select("*");
    expect(all.error).toBeNull();
    expect(all.data).toEqual([]);

    // Even narrowing to the sensitive column leaks nothing.
    const keyed = await learner.from("question_options").select("id, is_correct");
    expect(keyed.error).toBeNull();
    expect(keyed.data).toEqual([]);
  });

  it("a PostgREST embed from questions cannot reach option correctness", async () => {
    const learner = await authedClientFor(fx.enrolled.email, fx.enrolled.password);

    const res = await learner.from("questions").select("id, prompt, question_options(*)").eq("test_id", SEED_TEST_ID);

    // Tolerant per research: PostgREST may reject the embed (error) OR return
    // questions with empty embedded option arrays (RLS denies the child rows).
    // Either way, no is_correct must appear anywhere in the payload.
    if (res.error === null) {
      for (const row of res.data) {
        expect(row.question_options).toEqual([]);
      }
    }
    expect(JSON.stringify(res.data ?? [])).not.toContain("is_correct");
  });

  it("get_test_questions returns real options but omits is_correct", async () => {
    const learner = await authedClientFor(fx.enrolled.email, fx.enrolled.password);

    const { data, error } = await learner.rpc("get_test_questions", { p_test_id: SEED_TEST_ID });
    expect(error).toBeNull();

    const questions = data as unknown as TakingQuestion[];
    expect(questions.length).toBeGreaterThan(0);

    const allOptions = questions.flatMap((q) => q.options);
    // It's a real payload — the seed options are present (so this isn't a vacuous
    // empty-array pass)...
    const optionIds = allOptions.map((o) => o.id);
    expect(optionIds).toContain(SEED_Q1_CORRECT);
    expect(optionIds).toContain(SEED_Q2_CORRECT_A);
    expect(optionIds).toContain(SEED_Q2_CORRECT_B);

    // ...yet no option object carries is_correct, so the learner cannot tell
    // which options are the answers.
    for (const option of allOptions) {
      expect(Object.prototype.hasOwnProperty.call(option, "is_correct")).toBe(false);
    }
    expect(JSON.stringify(questions)).not.toContain("is_correct");
  });
});
