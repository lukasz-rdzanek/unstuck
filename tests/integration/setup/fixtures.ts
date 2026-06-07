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
}

/** Deterministic UUID-shaped id from (runId, key). Postgres `uuid` accepts any hex. */
function uid(runId: string, key: string): string {
  const h = createHash("md5").update(`itest:${runId}:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function uniqueEmail(runId: string, who: string): string {
  return `itest-${runId}-${who}-${randomUUID()}@unstuck.test`;
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

  return fx;
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

  // One delete is enough — the FK cascades handle the children.
  check(await svc.from("courses").delete().eq("id", uid(runId, "course")), "cleanup gated course");

  for (const user of users) {
    const res = await svc.auth.admin.deleteUser(user.id);
    // Tolerate already-gone users so cleanup stays idempotent.
    if (res.error !== null && !/not.*found/i.test(res.error.message)) {
      throw new Error(`delete user ${user.email}: ${res.error.message}`);
    }
  }
}
