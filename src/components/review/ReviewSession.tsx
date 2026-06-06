import { useState } from "react";
import { cn } from "@/lib/utils";

/** A due review card, prepared server-side per the lesson's review format. */
export interface ReviewCard {
  lessonId: string;
  title: string;
  format: "video" | "text" | "title";
  answerHtml: string | null; // text format: autodescription → HTML
  embedSrc: string | null; // video format: provider embed URL
  courseSlug: string;
  lessonSlug: string;
}

interface Props {
  queue: ReviewCard[];
}

// FSRS grades (1-4). Colors map to the cosmic semantic tokens.
const GRADES = [
  {
    rating: 1,
    label: "Again",
    cls: "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20",
  },
  { rating: 2, label: "Hard", cls: "border-warning/30 bg-warning/10 text-warning hover:bg-warning/20" },
  { rating: 3, label: "Good", cls: "border-info/30 bg-info/10 text-info hover:bg-info/20" },
  { rating: 4, label: "Easy", cls: "border-success/30 bg-success/10 text-success hover:bg-success/20" },
] as const;

/**
 * Review session (spaced-repetition-review): one due card at a time. Prompt by
 * lesson title → "Show answer" reveals the lesson's autodescription + a link →
 * grade Again/Hard/Good/Easy. The grade POSTs to the FSRS rate endpoint (JSON,
 * so no CSRF-origin dance); on success the card leaves the local queue. When
 * the queue is exhausted, an "all caught up" state shows.
 */
export default function ReviewSession({ queue }: Props) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = index >= queue.length;
  const card = queue[index];

  async function grade(rating: number) {
    if (done || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${card.lessonId}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      if (!res.ok) {
        setError("Couldn't save your rating — try again.");
        setSubmitting(false);
        return;
      }
      setIndex((i) => i + 1);
      setRevealed(false);
      setSubmitting(false);
    } catch {
      setError("Network error — try again.");
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="border-border bg-card/40 rounded-2xl border p-10 text-center backdrop-blur-xl">
        <p className="text-cosmic-gradient mb-2 text-2xl font-bold">All caught up 🎉</p>
        <p className="text-muted-foreground text-sm">
          No lessons are due for review right now. Complete more lessons or check back later.
        </p>
        <a href="/courses" className="text-primary mt-4 inline-block text-sm font-medium hover:opacity-80">
          ← Back to courses
        </a>
      </div>
    );
  }

  return (
    <div>
      <div className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase">
        {index + 1} / {queue.length} due
      </div>
      <div className="border-border bg-card/40 rounded-2xl border p-8 backdrop-blur-xl">
        <p className="text-muted-foreground mb-1 text-xs tracking-wide uppercase">Recall</p>
        <h2 className="text-foreground mb-6 text-2xl font-bold">{card.title}</h2>

        {!revealed ? (
          <button
            type="button"
            onClick={() => {
              setRevealed(true);
            }}
            className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 w-full rounded-xl border px-4 py-3 text-sm font-semibold transition-colors"
          >
            Show answer
          </button>
        ) : (
          <>
            <div className="border-border mb-6 border-t pt-6">
              {card.format === "video" && card.embedSrc ? (
                <div className="border-border aspect-video w-full overflow-hidden rounded-xl border">
                  <iframe
                    src={card.embedSrc}
                    title={card.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full"
                  />
                </div>
              ) : card.format === "text" && card.answerHtml ? (
                // Operator-trusted markdown rendered server-side (same trust
                // boundary as the lesson page); safe to inject.
                <article className="prose max-w-none" dangerouslySetInnerHTML={{ __html: card.answerHtml }} />
              ) : (
                <p className="text-muted-foreground text-sm">Re-open the lesson to refresh your memory.</p>
              )}
              <a
                href={`/courses/${card.courseSlug}/lessons/${card.lessonSlug}`}
                className="text-primary mt-4 inline-block text-sm font-medium hover:opacity-80"
              >
                Open the full lesson →
              </a>
            </div>

            <p className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">How well did you recall it?</p>
            <div className="grid grid-cols-4 gap-2">
              {GRADES.map((g) => (
                <button
                  key={g.rating}
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    void grade(g.rating);
                  }}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-sm font-semibold transition-colors disabled:opacity-50",
                    g.cls,
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </>
        )}

        {error && <p className="text-destructive mt-4 text-sm">{error}</p>}
      </div>
    </div>
  );
}
