import { Download } from "lucide-react";
import { buildLessonMarkdown, lessonExportFilename } from "@/lib/lesson-export";

interface Props {
  title: string;
  courseTitle: string;
  contentMd: string;
  videoUrl: string | null;
  courseSlug: string;
  lessonSlug: string;
}

/**
 * Download the current lesson as a single Markdown note (UNS-21 Phase 1).
 * Client-only: builds the file via the lesson-export helper and triggers a
 * download through a temporary <a download>. The attribution link uses the live
 * page URL so it's correct per environment. Interactive → React island.
 */
export default function SaveLessonButton({ title, courseTitle, contentMd, videoUrl, courseSlug, lessonSlug }: Props) {
  function handleSave() {
    if (typeof document === "undefined") return;
    const markdown = buildLessonMarkdown({
      title,
      courseTitle,
      contentMd,
      videoUrl,
      lessonUrl: window.location.href,
    });
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = lessonExportFilename(courseSlug, lessonSlug);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleSave}
      className="border-border text-foreground hover:bg-muted inline-flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors"
    >
      <Download className="size-4" />
      Save as Markdown
    </button>
  );
}
