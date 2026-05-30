/**
 * Shared domain entity + DTO types for Unstuck.
 *
 * Backed by the generated `Database` type from `src/lib/db/database.types.ts`
 * (run `npx supabase gen types typescript --local 2>/dev/null | grep -v
 * "^Connecting" > src/lib/db/database.types.ts` to regenerate — the
 * `grep -v` strip works around a Supabase CLI 2.98.2 quirk where status
 * lines land in stdout instead of stderr).
 *
 * Convention (per `AGENTS.md`):
 *   - Domain entity aliases derive from `Database['public']['Tables'][T]['Row']`.
 *   - DTOs derive from `Insert` / `Update` row variants when they share a
 *     shape, or compose from existing aliases.
 *   - Never hand-redefine a column shape — let the generated types flow.
 */

import type { Database } from "@/lib/db/database.types";

type Tables = Database["public"]["Tables"];

// ---------------------------------------------------------------------------
// Domain entities — one alias per table's Row type.
// ---------------------------------------------------------------------------

export type Profile = Tables["profiles"]["Row"];
export type Course = Tables["courses"]["Row"];
export type Chapter = Tables["chapters"]["Row"];
export type Lesson = Tables["lessons"]["Row"];
export type Enrollment = Tables["enrollments"]["Row"];
export type Message = Tables["messages"]["Row"];

/**
 * Composite view for course-detail rendering (S-05 / FR-004 chapters):
 * a chapter together with its lessons in chapter-local position order.
 * Returned by `listChaptersWithLessonsForCourse` via a single PostgREST
 * embed query. The `lessons` array is empty (not missing) for chapters
 * authored without lesson assignments yet.
 */
export type ChapterWithLessons = Chapter & {
  lessons: Lesson[];
};

// ---------------------------------------------------------------------------
// DTOs — input shapes for downstream slices (S-01, S-02, S-03).
// ---------------------------------------------------------------------------

/**
 * Shape a learner submits to post a lesson-scoped chat message.
 *
 * The RLS INSERT policy on `messages` enforces:
 *   - `author_id = auth.uid()` — server-side, derived from the session.
 *   - `is_seeded = false` — only service-role can create seeded messages.
 *   - `has_course_access(lesson's course)` — must be free or enrolled.
 *
 * So the *client-facing* shape is just `lesson_id` + `body`; the rest is
 * either server-derived or rejected at the policy level.
 */
export type NewMessage = Pick<Tables["messages"]["Insert"], "lesson_id" | "body">;

/**
 * View type for the ordered chat-panel read (FR-006 / Business Logic).
 *
 * Combines a `Message` row with the (optional) author's display info. The
 * `author` field is nullable because `messages.author_id` is `ON DELETE
 * SET NULL` — chat history outlives the user who posted it.
 *
 * Surfaced as `order by is_seeded desc, created_at asc` so operator-seeded
 * threads pin to the top and peer messages fall through chronologically.
 */
export type LessonChatMessage = Message & {
  author: Pick<Profile, "id" | "display_name"> | null;
};
