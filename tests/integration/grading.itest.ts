import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedClientFor, type DbClient } from "./setup/clients";
import { createRunFixture, cleanup, type RunFixture } from "./setup/fixtures";

// R3 — quiz grading (submit_test_attempt). Oracle = the source-stated rule
// (all-or-nothing exact-set match, no partial credit; score = correct/total;
// passed = score >= threshold), NOT the SQL. We assert an independent truth
// table against the seed quiz AND the persisted rows, plus the zero-correct
// guard via a fixture test whose only question has no correct option.

const RUN_ID = "grading";

// Seed FREE course quiz (any authed user has access via is_free).
const SEED_TEST_ID = "f1000000-0000-0000-0000-000000000001"; // threshold 0.50, 2 questions
const Q1 = "f2000000-0000-0000-0000-000000000001"; // single
const Q1_CORRECT = "f3000000-0000-0000-0000-000000000001";
const Q2 = "f2000000-0000-0000-0000-000000000002"; // multi
const Q2_CORRECT_A = "f3000000-0000-0000-0000-000000000004";
const Q2_CORRECT_B = "f3000000-0000-0000-0000-000000000005";
const Q2_WRONG = "f3000000-0000-0000-0000-000000000006";

type Answers = Record<string, string[]>;
interface GradeResult {
  score: number;
  passed: boolean;
  perQuestion: { questionId: string; isCorrect: boolean; correctOptionIds: string[] }[];
}

// Independent truth table (threshold 0.50, 2 questions → score = correct/2).
const CASES: { name: string; answers: Answers; score: number; passed: boolean; q1: boolean; q2: boolean }[] = [
  {
    name: "both correct",
    answers: { [Q1]: [Q1_CORRECT], [Q2]: [Q2_CORRECT_A, Q2_CORRECT_B] },
    score: 1,
    passed: true,
    q1: true,
    q2: true,
  },
  {
    name: "Q2 partial (one of two)",
    answers: { [Q1]: [Q1_CORRECT], [Q2]: [Q2_CORRECT_A] },
    score: 0.5,
    passed: true,
    q1: true,
    q2: false,
  },
  {
    name: "Q2 superset (all three)",
    answers: { [Q1]: [Q1_CORRECT], [Q2]: [Q2_CORRECT_A, Q2_CORRECT_B, Q2_WRONG] },
    score: 0.5,
    passed: true,
    q1: true,
    q2: false,
  },
  { name: "empty answers", answers: {}, score: 0, passed: false, q1: false, q2: false },
  {
    name: "foreign id for Q1 (a Q2 option)",
    answers: { [Q1]: [Q2_CORRECT_A], [Q2]: [Q2_CORRECT_A, Q2_CORRECT_B] },
    score: 0.5,
    passed: true,
    q1: false,
    q2: true,
  },
  { name: "only Q1", answers: { [Q1]: [Q1_CORRECT] }, score: 0.5, passed: true, q1: true, q2: false },
];

describe("R3 — quiz grading matches an independent oracle", () => {
  let fx: RunFixture;
  let learner: DbClient;

  beforeAll(async () => {
    fx = await createRunFixture(RUN_ID);
    learner = await authedClientFor(fx.enrolled.email, fx.enrolled.password);
  });

  afterAll(async () => {
    await cleanup(RUN_ID, [fx.enrolled, fx.outsider]);
  });

  async function submit(answers: Answers): Promise<GradeResult> {
    const { data, error } = await learner.rpc("submit_test_attempt", { p_test_id: SEED_TEST_ID, p_answers: answers });
    expect(error).toBeNull();
    return data as unknown as GradeResult;
  }

  it.each(CASES)("$name → score $score, passed $passed", async (c) => {
    const r = await submit(c.answers);
    expect(r.score).toBe(c.score);
    expect(r.passed).toBe(c.passed);
    const q1 = r.perQuestion.find((p) => p.questionId === Q1);
    const q2 = r.perQuestion.find((p) => p.questionId === Q2);
    expect(q1?.isCorrect).toBe(c.q1);
    expect(q2?.isCorrect).toBe(c.q2);
  });

  it("grades by set equality (option order is irrelevant)", async () => {
    const r = await submit({ [Q1]: [Q1_CORRECT], [Q2]: [Q2_CORRECT_B, Q2_CORRECT_A] }); // reversed
    expect(r.score).toBe(1);
    expect(r.perQuestion.find((p) => p.questionId === Q2)?.isCorrect).toBe(true);
  });

  it("persists the attempt + per-question rows (not just the RPC return)", async () => {
    await submit({ [Q1]: [Q1_CORRECT], [Q2]: [Q2_CORRECT_A, Q2_CORRECT_B] }); // both correct

    // Newest attempt for this user+test (RLS scopes to the learner's own rows).
    const attempt = await learner
      .from("test_attempts")
      .select("id, score, passed")
      .eq("test_id", SEED_TEST_ID)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }) // deterministic tiebreaker if two attempts share created_at
      .limit(1)
      .maybeSingle();
    expect(attempt.error).toBeNull();
    expect(attempt.data?.score).toBe(1);
    expect(attempt.data?.passed).toBe(true);

    const answers = await learner
      .from("attempt_answers")
      .select("question_id, is_correct, selected_option_ids")
      .eq("attempt_id", attempt.data?.id ?? "");
    expect(answers.error).toBeNull();
    expect(answers.data?.length).toBe(2);
    const a1 = answers.data?.find((a) => a.question_id === Q1);
    const a2 = answers.data?.find((a) => a.question_id === Q2);
    expect(a1?.is_correct).toBe(true);
    expect(a1?.selected_option_ids).toEqual([Q1_CORRECT]);
    expect(a2?.is_correct).toBe(true);
    expect([...(a2?.selected_option_ids ?? [])].sort()).toEqual([Q2_CORRECT_A, Q2_CORRECT_B].sort());
  });

  it("a zero-correct question is never correct (empty or non-empty selection)", async () => {
    const empty = await learner.rpc("submit_test_attempt", { p_test_id: fx.zeroCorrectTestId, p_answers: {} });
    expect(empty.error).toBeNull();
    const er = empty.data as unknown as GradeResult;
    expect(er.score).toBe(0);
    expect(er.passed).toBe(false);
    expect(er.perQuestion[0]?.isCorrect).toBe(false);

    const picked = await learner.rpc("submit_test_attempt", {
      p_test_id: fx.zeroCorrectTestId,
      p_answers: { [fx.zeroCorrectQuestionId]: [fx.zeroCorrectOpt1Id] },
    });
    expect(picked.error).toBeNull();
    const pr = picked.data as unknown as GradeResult;
    expect(pr.score).toBe(0);
    expect(pr.perQuestion[0]?.isCorrect).toBe(false);
  });
});
