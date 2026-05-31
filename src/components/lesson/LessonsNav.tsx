import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChapterWithLessons } from "@/types";

interface Props {
  courseSlug: string;
  chapters: ChapterWithLessons[];
  /**
   * Completed lesson IDs for the signed-in user, serialised as
   * string[] across the Astro → React-island boundary (Sets aren't
   * JSON-serializable). Converted to Set internally for O(1) lookups.
   */
  completedLessonIds: string[];
  currentLessonId: string;
}

interface LessonCompletionChangedDetail {
  lessonId: string;
  completed: boolean;
}

/**
 * Lesson navigation content — chapter hierarchy with completion check,
 * current-lesson highlight, and click-to-navigate. Pure presentational;
 * NOT a React island. Mounted inside LessonAside which owns chrome
 * + tab state + the client:load directive.
 *
 * Click on any lesson is a standard <a> navigation (full SSR load) —
 * the new page re-renders with the new currentLessonId; localStorage
 * keeps the Lessons tab active across the navigation.
 *
 * UNS-14 (d): subscribes to `unstuck:lesson-completion-changed` window
 * events emitted by MarkCompleteButton so the current lesson's row
 * reflects mark/unmark instantly, without waiting for a full page
 * navigation. SSR-passed completedLessonIds remain the source of
 * truth across navigations.
 */
export default function LessonsNav({ courseSlug, chapters, completedLessonIds, currentLessonId }: Props) {
  // Local state seeded from the SSR prop. Astro lesson nav is full
  // SSR (`<a href>` → page reload → island remount), so the initializer
  // captures fresh props on every navigation — no prop-sync useEffect
  // needed (and lint forbids the antipattern anyway).
  const [completedSet, setCompletedSet] = useState<Set<string>>(() => new Set(completedLessonIds));

  // Subscribe to MarkComplete success events (UNS-14 d).
  useEffect(() => {
    function handle(event: Event) {
      const { lessonId, completed } = (event as CustomEvent<LessonCompletionChangedDetail>).detail;
      setCompletedSet((prev) => {
        const next = new Set(prev);
        if (completed) {
          next.add(lessonId);
        } else {
          next.delete(lessonId);
        }
        return next;
      });
    }
    window.addEventListener("unstuck:lesson-completion-changed", handle);
    return () => {
      window.removeEventListener("unstuck:lesson-completion-changed", handle);
    };
  }, []);

  if (chapters.length === 0) {
    return <p className="text-muted-foreground p-4 text-center text-sm">No chapters in this course yet.</p>;
  }

  return (
    <nav aria-label="Course lessons" className="space-y-5 overflow-y-auto pr-1">
      {chapters.map((chapter) => (
        <section key={chapter.id}>
          <h3 className="text-foreground mb-2 text-sm font-semibold">
            <span className="text-muted-foreground mr-2 font-mono text-xs">
              {String(chapter.position).padStart(2, "0")}
            </span>
            {chapter.title}
          </h3>
          {chapter.lessons.length === 0 ? (
            <p className="text-muted-foreground bg-card/40 border-border rounded-lg border p-2 text-xs">
              No lessons in this chapter yet.
            </p>
          ) : (
            <ol className="space-y-1.5">
              {chapter.lessons.map((lesson) => {
                const done = completedSet.has(lesson.id);
                const isCurrent = lesson.id === currentLessonId;
                return (
                  <li key={lesson.id}>
                    <a
                      href={`/courses/${courseSlug}/lessons/${lesson.slug}`}
                      aria-current={isCurrent ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border p-2 text-sm backdrop-blur-xl transition-colors",
                        isCurrent
                          ? "border-l-primary bg-primary/10 border-border border-l-4"
                          : "bg-card/40 border-border hover:bg-card/60",
                      )}
                    >
                      {done ? (
                        <CheckCircle2 className="size-4 shrink-0 text-green-400" aria-label="Completed" />
                      ) : (
                        <span className="text-muted-foreground w-4 shrink-0 text-center font-mono text-xs">
                          {String(lesson.position).padStart(2, "0")}
                        </span>
                      )}
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          done ? "text-foreground/60" : "text-foreground",
                          isCurrent && "font-semibold",
                        )}
                      >
                        {lesson.title}
                      </span>
                      {lesson.video_url === null && (
                        <span className="text-muted-foreground shrink-0 text-[10px] tracking-wide uppercase">
                          Reading
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ))}
    </nav>
  );
}
