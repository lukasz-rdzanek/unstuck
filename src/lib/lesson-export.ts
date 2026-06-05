// Lesson export helpers (UNS-21 Phase 1). Pure functions that assemble the
// downloadable Markdown note and its filename — kept out of the component so the
// formatting is unit-checkable and reusable (e.g. a future PDF path).

interface LessonMarkdownInput {
  title: string;
  courseTitle: string;
  contentMd: string;
  videoUrl: string | null;
  /** Canonical URL of the lesson page, used in the attribution footer. */
  lessonUrl: string;
}

/**
 * Compose a single, attributed Markdown note for one lesson:
 * a title heading, a course line, the content body, an optional video link,
 * and an attribution footer. The footer + single-lesson scope keep exports
 * framed as personal notes rather than a clean course mirror (UNS-21).
 */
export function buildLessonMarkdown({
  title,
  courseTitle,
  contentMd,
  videoUrl,
  lessonUrl,
}: LessonMarkdownInput): string {
  const parts = [`# ${title}`, "", `_Course: ${courseTitle}_`, "", contentMd.trim(), "", "---", ""];
  if (videoUrl) {
    parts.push(`Watch the video: ${videoUrl}`, "");
  }
  parts.push(`_Saved from Unstuck — ${lessonUrl} — for personal use._`, "");
  return parts.join("\n");
}

/** Filesystem-safe download name from the (already URL-safe) slugs. */
export function lessonExportFilename(courseSlug: string, lessonSlug: string): string {
  return `${courseSlug}-${lessonSlug}.md`;
}
