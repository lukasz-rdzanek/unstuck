import { useEffect, useState } from "react";
import { CheckCircle2, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChapterWithLessons } from "@/types";

/** Slim test shape for the nav (chapterId null = course-level / final test). */
export interface NavTest {
  chapterId: string | null;
  slug: string;
  title: string;
}

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
  /** Tests for the course; the chapter "boss" rows + a course-level final test. */
  tests: NavTest[];
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
export default function LessonsNav({ courseSlug, chapters, completedLessonIds, currentLessonId, tests }: Props) {
  const courseTest = tests.find((t) => t.chapterId === null) ?? null;
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
    <nav aria-label="Course lessons" className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
      {chapters.map((chapter) => {
        const chapterTest = tests.find((t) => t.chapterId === chapter.id) ?? null;
        return (
          <section key={chapter.id}>
            <h3 className="text-foreground mb-2 text-sm font-semibold">
              <span className="text-muted-foreground mr-2 font-mono text-xs">
                {String(chapter.position).padStart(2, "0")}
              </span>
              {chapter.title}
            </h3>
            {chapter.lessons.length === 0 && !chapterTest ? (
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
                          <CheckCircle2 className="text-success size-4 shrink-0" aria-label="Completed" />
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
                {chapterTest ? (
                  <li>
                    <a
                      href={`/courses/${courseSlug}/tests/${chapterTest.slug}`}
                      className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-2 rounded-lg border p-2 text-sm font-semibold backdrop-blur-xl transition-colors"
                    >
                      <Target className="size-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{chapterTest.title}</span>
                      <span className="shrink-0 text-[10px] tracking-wide uppercase">Test</span>
                    </a>
                  </li>
                ) : null}
              </ol>
            )}
          </section>
        );
      })}
      {courseTest ? (
        <a
          href={`/courses/${courseSlug}/tests/${courseTest.slug}`}
          className="border-primary/50 bg-primary/15 text-primary hover:bg-primary/25 flex items-center gap-2 rounded-lg border p-2 text-sm font-bold backdrop-blur-xl transition-colors"
        >
          <Target className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">Final test: {courseTest.title}</span>
          <span className="shrink-0 text-[10px] tracking-wide uppercase">Course</span>
        </a>
      ) : null}
    </nav>
  );
}
