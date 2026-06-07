import { createHash, randomUUID } from "node:crypto";
import { serviceClient } from "./clients";

// Per-run fixtures for the access-control integration tests. Each test file
// passes its own constant `runId` (e.g. "answer-key", "idor", "course-access")
// so files get independent fixture namespaces and never stomp each other. All
// ids are DETERMINISTIC functions of the runId, so a crashed run self-heals:
// createRunFixture() cleans up its namespace before re-creating it.
//
// Isolation strategy (per plan): per-run unique-id fixtures + FK-ordered
// service_role cleanup. NEVER `supabase db reset` (it wipes local auth users).
// Most teardown rides ON DELETE CASCADE — deleting the gated course cascades its
// chapters/lessons/messages/tests/questions/options/enrollments/attempts, and
// deleting a user cascades that user's profile + own-only rows (attempts, SRS,
// completions) on ANY course. CAVEAT: messages.author_id → profiles is
// ON DELETE SET NULL, NOT cascade — a message a fixture user posts on a
// NON-fixture lesson (e.g. the shared seed lesson) survives user-teardown with
// author_id = NULL. Tests that post to a shared lesson must delete that message
// themselves (see role-matrix Cell 2's finally block).
//
// Data-row ids are DETERMINISTIC per runId so the start-cleanup removes a prior
// run's rows by id (via the course cascade). User EMAILS are unique per
// invocation (randomUUID) — the local GoTrue `listUsers` admin call is broken in
// this stack ("Database error finding users" on the sparse seed accounts), so we
// can't look up orphans by email; unique emails mean `createUser` never collides
// even after a crashed run, and teardown deletes the two users by captured id.

const PASSWORD = "itest-password-123";

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

export interface RunFixture {
  runId: string;
  /** A gated (is_free=false) course with no enrollment for `outsider`. */
  gatedCourseId: string;
  chapterId: string;
  lessonId: string;
  testId: string;
  questionId: string;
  /** The single-correct question's options; `correct` is the answer key. */
  correctOptionId: string;
  wrongOptionId: string;
  seededMessageId: string;
  /** Enrolled in the gated course. */
  enrolled: TestUser;
  /** NOT enrolled in the gated course (the R4 denial subject). */
  outsider: TestUser;

  // ---- Phase 2 (grading & answer-matching) extensions ----------------------
  /**
   * R3: a course-level test (on the free embed course, NOT the gated test that
   * course-access counts) whose single question has options ALL is_correct=false,
   * to exercise the zero-correct grading guard (never correct, even on empty
   * submission).
   */
  zeroCorrectTestId: string;
  zeroCorrectQuestionId: string;
  zeroCorrectOpt1Id: string;
  zeroCorrectOpt2Id: string;

  // R5(a) cross-course match isolation. Two FREE courses (any authed user has
  // access via is_free), each with one embedded message authored by `enrolled`.
  // The "trap" message is MORE similar to `matchQueryVec` than the courseA
  // message, so a broken course fence would surface it.
  matchQueryVec: string; // the query embedding literal (cosine 1.0 with the trap, 0.8 with courseA)
  matchCourseAId: string;
  matchLessonAId: string;
  matchMessageAId: string; // cosine ≈ 0.8 to matchQueryVec
  trapCourseId: string;
  trapLessonId: string;
  trapMessageId: string; // cosine ≈ 1.0 to matchQueryVec (the higher-ranked trap in another course)

  // R5(b) embedding immutability. A FREE course/lesson holding one message with
  // embedding NULL (to set) and one already embedded (to prove no-overwrite).
  embedCourseId: string;
  embedLessonId: string;
  unembeddedMessageId: string; // embedding is NULL
  embeddedMessageId: string; // embedding already set
}

/** Deterministic UUID-shaped id from (runId, key). Postgres `uuid` accepts any hex. */
function uid(runId: string, key: string): string {
  const h = createHash("md5").update(`itest:${runId}:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function uniqueEmail(runId: string, who: string): string {
  return `itest-${runId}-${who}-${randomUUID()}@unstuck.test`;
}

/**
 * A 768-dim pgvector literal with the given leading components; the rest are
 * zero-filled. `match_lesson_answers` computes similarity = 1 - (e <=> q) = the
 * cosine similarity, so near-axis vectors give controlled, easy-to-reason cosines
 * (e.g. q=[1,0,…] vs [1,0.75,0,…] → cosine 1/√1.5625 = 0.8). No Workers AI needed.
 */
export function vec768(...components: number[]): string {
  const arr = new Array<number>(768).fill(0);
  components.forEach((v, i) => {
    if (i < 768) arr[i] = v;
  });
  return `[${arr.join(",")}]`;
}

function check(res: { error: { message: string } | null }, context: string): void {
  if (res.error !== null) {
    throw new Error(`${context}: ${res.error.message}`);
  }
}

/** Create (or recreate) the fixture namespace for `runId`. Idempotent. */
export async function createRunFixture(runId: string): Promise<RunFixture> {
  await cleanup(runId);
  const svc = serviceClient();

  const enrolledEmail = uniqueEmail(runId, "a");
  const outsiderEmail = uniqueEmail(runId, "b");

  const enrolledRes = await svc.auth.admin.createUser({
    email: enrolledEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  check(enrolledRes, "create enrolled user");
  const outsiderRes = await svc.auth.admin.createUser({
    email: outsiderEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  check(outsiderRes, "create outsider user");

  const enrolledId = enrolledRes.data.user?.id;
  const outsiderId = outsiderRes.data.user?.id;
  if (enrolledId === undefined || outsiderId === undefined) {
    throw new Error("admin.createUser returned no user id");
  }

  const fx: RunFixture = {
    runId,
    gatedCourseId: uid(runId, "course"),
    chapterId: uid(runId, "chapter"),
    lessonId: uid(runId, "lesson"),
    testId: uid(runId, "test"),
    questionId: uid(runId, "question"),
    correctOptionId: uid(runId, "opt-correct"),
    wrongOptionId: uid(runId, "opt-wrong"),
    seededMessageId: uid(runId, "message"),
    enrolled: { id: enrolledId, email: enrolledEmail, password: PASSWORD },
    outsider: { id: outsiderId, email: outsiderEmail, password: PASSWORD },

    zeroCorrectTestId: uid(runId, "test-zero"),
    zeroCorrectQuestionId: uid(runId, "q-zero"),
    zeroCorrectOpt1Id: uid(runId, "q-zero-opt1"),
    zeroCorrectOpt2Id: uid(runId, "q-zero-opt2"),

    matchQueryVec: vec768(1),
    matchCourseAId: uid(runId, "match-course-a"),
    matchLessonAId: uid(runId, "match-lesson-a"),
    matchMessageAId: uid(runId, "match-msg-a"),
    trapCourseId: uid(runId, "trap-course"),
    trapLessonId: uid(runId, "trap-lesson"),
    trapMessageId: uid(runId, "trap-msg"),

    embedCourseId: uid(runId, "embed-course"),
    embedLessonId: uid(runId, "embed-lesson"),
    unembeddedMessageId: uid(runId, "embed-msg-null"),
    embeddedMessageId: uid(runId, "embed-msg-set"),
  };

  check(
    await svc.from("courses").insert({
      id: fx.gatedCourseId,
      slug: `itest-gated-${runId}`,
      title: `Integration gated course (${runId})`,
      description: "Gated (is_free=false) fixture for course-access integration tests.",
      is_free: false,
    }),
    "insert gated course",
  );
  check(
    await svc.from("chapters").insert({
      id: fx.chapterId,
      course_id: fx.gatedCourseId,
      slug: "intro",
      title: "Introduction",
      position: 1,
    }),
    "insert chapter",
  );
  check(
    await svc.from("lessons").insert({
      id: fx.lessonId,
      course_id: fx.gatedCourseId,
      chapter_id: fx.chapterId,
      slug: "gated-lesson",
      title: "Gated lesson",
      position: 1,
      content_md: "Gated lesson body for integration tests.",
    }),
    "insert lesson",
  );
  check(
    await svc.from("tests").insert({
      id: fx.testId,
      course_id: fx.gatedCourseId,
      chapter_id: fx.chapterId,
      slug: "gated-test",
      title: "Gated test",
      pass_threshold: 0.5,
    }),
    "insert test",
  );
  check(
    await svc.from("questions").insert({
      id: fx.questionId,
      test_id: fx.testId,
      prompt: "Gated question?",
      multi: false,
      position: 1,
    }),
    "insert question",
  );
  check(
    await svc.from("question_options").insert([
      { id: fx.correctOptionId, question_id: fx.questionId, body: "Correct answer", is_correct: true, position: 1 },
      { id: fx.wrongOptionId, question_id: fx.questionId, body: "Wrong answer", is_correct: false, position: 2 },
    ]),
    "insert question options",
  );
  check(
    await svc.from("messages").insert({
      id: fx.seededMessageId,
      lesson_id: fx.lessonId,
      author_id: fx.enrolled.id,
      body: "Seeded message in the gated course (integration fixture).",
      is_seeded: true,
    }),
    "insert seeded message",
  );
  check(
    await svc.from("enrollments").insert({
      user_id: fx.enrolled.id,
      course_id: fx.gatedCourseId,
    }),
    "insert enrollment",
  );

  // ---- R5(a): two free courses with embedded messages ----------------------
  // courseA message: cosine ≈ 0.8 to the query. trap message (other course):
  // cosine 1.0 — higher-ranked, must never leak into a courseA match.
  // NOTE: every embedded `body` here MUST be ≥ 40 chars — match_lesson_answers
  // filters on `char_length(m.body) >= 40` and silently drops shorter messages.
  await insertFreeCourseWithMessage(svc, runId, {
    courseId: fx.matchCourseAId,
    lessonId: fx.matchLessonAId,
    messageId: fx.matchMessageAId,
    authorId: fx.enrolled.id,
    label: "match-a",
    body: "Course A candidate answer about streaming, Suspense boundaries, and where to place them.",
    embedding: vec768(1, 0.75), // cosine 0.8 with vec768(1)
  });
  await insertFreeCourseWithMessage(svc, runId, {
    courseId: fx.trapCourseId,
    lessonId: fx.trapLessonId,
    messageId: fx.trapMessageId,
    authorId: fx.enrolled.id,
    label: "trap",
    body: "Trap answer in another course, nearly identical to the query embedding vector.",
    embedding: vec768(1), // cosine 1.0 with the query — the higher-ranked trap
  });

  // ---- R5(b): a free course holding a NULL-embedding + a pre-set message ----
  check(
    await svc
      .from("courses")
      .insert({ id: fx.embedCourseId, slug: `itest-embed-${runId}`, title: `Embed course (${runId})`, is_free: true }),
    "insert embed course",
  );
  const embedChapterId = uid(runId, "embed-chapter");
  check(
    await svc
      .from("chapters")
      .insert({ id: embedChapterId, course_id: fx.embedCourseId, slug: "intro", title: "Introduction", position: 1 }),
    "insert embed chapter",
  );
  check(
    await svc.from("lessons").insert({
      id: fx.embedLessonId,
      course_id: fx.embedCourseId,
      chapter_id: embedChapterId,
      slug: "embed-lesson",
      title: "Embed lesson",
      position: 1,
      content_md: "Lesson for embedding-immutability integration tests.",
    }),
    "insert embed lesson",
  );
  check(
    await svc.from("messages").insert([
      {
        id: fx.unembeddedMessageId,
        lesson_id: fx.embedLessonId,
        author_id: fx.enrolled.id,
        body: "Message with a NULL embedding, used to verify set_message_embedding sets it once.",
        is_seeded: false,
        // embedding omitted → NULL
      },
      {
        id: fx.embeddedMessageId,
        lesson_id: fx.embedLessonId,
        author_id: fx.enrolled.id,
        body: "Message that already has an embedding, used to verify it is never overwritten.",
        is_seeded: false,
        embedding: vec768(1),
      },
    ]),
    "insert embed messages",
  );

  // ---- R3: zero-correct test (course-level test on the free embed course) ---
  check(
    await svc.from("tests").insert({
      id: fx.zeroCorrectTestId,
      course_id: fx.embedCourseId,
      chapter_id: null,
      slug: "zero-correct-test",
      title: "Zero-correct test",
      pass_threshold: 0.5,
    }),
    "insert zero-correct test",
  );
  check(
    await svc.from("questions").insert({
      id: fx.zeroCorrectQuestionId,
      test_id: fx.zeroCorrectTestId,
      prompt: "Zero-correct question (no option is correct)?",
      multi: false,
      position: 1,
    }),
    "insert zero-correct question",
  );
  check(
    await svc.from("question_options").insert([
      {
        id: fx.zeroCorrectOpt1Id,
        question_id: fx.zeroCorrectQuestionId,
        body: "Not correct A",
        is_correct: false,
        position: 1,
      },
      {
        id: fx.zeroCorrectOpt2Id,
        question_id: fx.zeroCorrectQuestionId,
        body: "Not correct B",
        is_correct: false,
        position: 2,
      },
    ]),
    "insert zero-correct options",
  );

  return fx;
}

/** Insert a free course + chapter + lesson + one embedded message (R5 fixtures). */
async function insertFreeCourseWithMessage(
  svc: ReturnType<typeof serviceClient>,
  runId: string,
  opts: {
    courseId: string;
    lessonId: string;
    messageId: string;
    authorId: string;
    label: string;
    body: string;
    embedding: string;
  },
): Promise<void> {
  const chapterId = uid(runId, `${opts.label}-chapter`);
  check(
    await svc.from("courses").insert({
      id: opts.courseId,
      slug: `itest-${opts.label}-${runId}`,
      title: `Match course ${opts.label} (${runId})`,
      is_free: true,
    }),
    `insert ${opts.label} course`,
  );
  check(
    await svc
      .from("chapters")
      .insert({ id: chapterId, course_id: opts.courseId, slug: "intro", title: "Introduction", position: 1 }),
    `insert ${opts.label} chapter`,
  );
  check(
    await svc.from("lessons").insert({
      id: opts.lessonId,
      course_id: opts.courseId,
      chapter_id: chapterId,
      slug: `${opts.label}-lesson`,
      title: `Match lesson ${opts.label}`,
      position: 1,
      content_md: `Lesson for ${opts.label} match-isolation testing.`,
    }),
    `insert ${opts.label} lesson`,
  );
  check(
    await svc.from("messages").insert({
      id: opts.messageId,
      lesson_id: opts.lessonId,
      author_id: opts.authorId,
      body: opts.body,
      is_seeded: false,
      embedding: opts.embedding,
    }),
    `insert ${opts.label} message`,
  );
}

/**
 * Remove the `runId` namespace's data rows, and (when given) the run's users.
 * Idempotent — safe on a fresh DB and safe to call before create. Deleting the
 * gated course cascades its chapters/lessons/messages/tests/questions/options/
 * enrollments/attempts; deleting a user cascades its profile + own-only rows
 * (attempts/SRS/completions) on ANY course, including the free seed course the
 * IDOR tests use. Pass the fixture's users in afterAll to delete them by id.
 */
export async function cleanup(runId: string, users: readonly TestUser[] = []): Promise<void> {
  const svc = serviceClient();

  // Delete every fixture course by id — each cascades its chapters/lessons/
  // messages/tests/questions/options/enrollments/attempts. (Phase 2 added the
  // match/trap/embed courses.)
  for (const key of ["course", "match-course-a", "trap-course", "embed-course"]) {
    check(await svc.from("courses").delete().eq("id", uid(runId, key)), `cleanup course ${key}`);
  }

  for (const user of users) {
    const res = await svc.auth.admin.deleteUser(user.id);
    // Tolerate already-gone users so cleanup stays idempotent.
    if (res.error !== null && !/not.*found/i.test(res.error.message)) {
      throw new Error(`delete user ${user.email}: ${res.error.message}`);
    }
  }
}
