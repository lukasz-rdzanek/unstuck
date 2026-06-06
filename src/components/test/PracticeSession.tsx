import { useState } from "react";
import { cn } from "@/lib/utils";
import type { PracticeQuestion } from "@/lib/services/tests";

interface GradeResult {
  isCorrect: boolean;
  correctOptionIds: string[];
}

interface Props {
  questions: PracticeQuestion[];
}

/**
 * Practice session (learning-loop P3): re-quiz the questions due today, one at a
 * time. Answer → Check (grades via the practice endpoint, which reschedules the
 * FSRS card from correctness) → see feedback → Next. When the queue is
 * exhausted, an "all caught up" state shows. The answer key never reaches the
 * client (grading + correct-option reveal come from the server).
 */
export default function PracticeSession({ questions }: Props) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = index >= questions.length;
  const q = questions[index];

  function toggle(optionId: string) {
    if (done || result) return;
    setSelected((prev) => {
      if (q.multi) {
        return prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId];
      }
      return [optionId];
    });
  }

  async function check() {
    if (done || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/practice/${q.id}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected }),
      });
      if (!res.ok) {
        setError("Couldn't grade that — try again.");
        setSubmitting(false);
        return;
      }
      setResult((await res.json()) as GradeResult);
      setSubmitting(false);
    } catch {
      setError("Network error — try again.");
      setSubmitting(false);
    }
  }

  function next() {
    setIndex((i) => i + 1);
    setSelected([]);
    setResult(null);
    setError(null);
  }

  if (done) {
    return (
      <div className="border-border bg-card/40 rounded-2xl border p-10 text-center backdrop-blur-xl">
        <p className="text-cosmic-gradient mb-2 text-2xl font-bold">All caught up 🎉</p>
        <p className="text-muted-foreground text-sm">No questions are due for review. Take a test to add some.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase">
        {index + 1} / {questions.length} due
      </div>
      <div className="border-border bg-card/40 rounded-2xl border p-6 backdrop-blur-xl">
        <p className="text-foreground mb-4 font-medium">{q.prompt}</p>
        {q.multi && !result && (
          <p className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">Select all that apply</p>
        )}
        <div className="space-y-2">
          {q.options.map((o) => {
            const picked = selected.includes(o.id);
            const isCorrectOpt = result?.correctOptionIds.includes(o.id);
            return (
              <label
                key={o.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors",
                  !result && "border-border hover:bg-card/60",
                  result && isCorrectOpt && "border-success/40 bg-success/10 text-success",
                  result && picked && !isCorrectOpt && "border-destructive/40 bg-destructive/10 text-destructive",
                  result && !picked && !isCorrectOpt && "border-border opacity-70",
                )}
              >
                <input
                  type={q.multi ? "checkbox" : "radio"}
                  name={q.id}
                  checked={picked}
                  disabled={!!result || submitting}
                  onChange={() => {
                    toggle(o.id);
                  }}
                  className="accent-primary"
                />
                <span>{o.body}</span>
              </label>
            );
          })}
        </div>

        {result && (
          <p className={cn("mt-4 text-sm font-semibold", result.isCorrect ? "text-success" : "text-destructive")}>
            {result.isCorrect ? "✓ Correct — scheduled further out" : "✗ Not quite — you'll see this again soon"}
          </p>
        )}
        {error && <p className="text-destructive mt-4 text-sm">{error}</p>}

        <div className="mt-5">
          {result ? (
            <button
              type="button"
              onClick={next}
              className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl border px-5 py-3 text-sm font-semibold transition-colors"
            >
              {index + 1 < questions.length ? "Next" : "Finish"}
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting || selected.length === 0}
              onClick={() => {
                void check();
              }}
              className="shadow-cosmic-glow bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-5 py-3 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {submitting ? "Checking…" : "Check"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
