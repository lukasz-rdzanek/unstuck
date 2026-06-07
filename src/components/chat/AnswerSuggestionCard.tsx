import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnswerMatch } from "@/types";

interface Props {
  match: AnswerMatch;
  currentLessonId: string;
  onDismiss: () => void;
}

/**
 * Dismissible "you might find this helpful" card shown beneath a just-posted
 * question (ai-answer-matching). Renders the matched answer body as plain text
 * (no dangerouslySetInnerHTML), a "curated" badge for operator-seeded hits, and
 * a link to the source lesson when the match came from a different lesson in the
 * same course. Course slug is read from the URL so this stays self-contained.
 */
export default function AnswerSuggestionCard({ match, currentLessonId, onDismiss }: Props) {
  const fromOtherLesson = match.lessonId !== currentLessonId;
  const courseSlug =
    typeof window === "undefined"
      ? null
      : (/^\/courses\/([^/]+)\/lessons\//.exec(window.location.pathname)?.[1] ?? null);
  const href = fromOtherLesson && courseSlug ? `/courses/${courseSlug}/lessons/${match.lessonSlug}` : null;

  return (
    <div className={cn("border-border bg-card/70 text-foreground relative rounded-xl border p-3 text-sm shadow-sm")}>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss suggestion"
        className="text-muted-foreground hover:text-foreground absolute top-2 right-2 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="text-primary mb-1.5 flex items-center gap-1.5 text-xs font-medium">
        <Sparkles className="h-3.5 w-3.5" />
        <span>You might find this helpful</span>
        {match.isSeeded && (
          <span className="bg-primary/15 text-primary ml-1 rounded-full px-1.5 py-0.5 text-[10px]">curated</span>
        )}
      </div>

      <p className="text-foreground/90 line-clamp-4 pr-5 whitespace-pre-wrap">{match.body}</p>

      {fromOtherLesson && (
        <div className="text-muted-foreground mt-2 text-xs">
          From:{" "}
          {href ? (
            <a href={href} className="text-primary hover:underline">
              {match.lessonTitle}
            </a>
          ) : (
            <span className="text-foreground/80">{match.lessonTitle}</span>
          )}
        </div>
      )}
    </div>
  );
}
