import { useState } from "react";
import { cn } from "@/lib/utils";
import type { TakingQuestion } from "@/lib/services/tests";

interface PerQuestion {
  questionId: string;
  isCorrect: boolean;
  correctOptionIds: string[];
}
interface Result {
  score: number;
  passed: boolean;
  perQuestion: PerQuestion[];
}

interface Props {
  testId: string;
  questions: TakingQuestion[];
  passThreshold: number;
}

/**
 * Quiz island (learning-loop). Renders questions (radio for single-correct,
 * checkbox for multi), submits to the grading endpoint, and shows the score +
 * pass/fail with per-question feedback (correct options come back from the
 * server — the client never holds the answer key). Retake resets local state.
 */
export default function TestQuiz({ testId, questions, passThreshold }: Props) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(question: TakingQuestion, optionId: string) {
    if (result) return;
    setAnswers((prev) => {
      const current = prev[question.id] ?? [];
      if (question.multi) {
        return {
          ...prev,
          [question.id]: current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId],
        };
      }
      return { ...prev, [question.id]: [optionId] };
    });
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tests/${testId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) {
        setError("Couldn't grade your test — try again.");
        setSubmitting(false);
        return;
      }
      setResult((await res.json()) as Result);
      setSubmitting(false);
    } catch {
      setError("Network error — try again.");
      setSubmitting(false);
    }
  }

  function retake() {
    setAnswers({});
    setResult(null);
    setError(null);
  }

  const byQuestion = new Map(result?.perQuestion.map((p) => [p.questionId, p]));

  return (
    <div className="space-y-6">
      {result && (
        <div
          className={cn(
            "rounded-2xl border p-6 text-center backdrop-blur-xl",
            result.passed
              ? "border-success/30 bg-success/10 text-success"
              : "border-warning/30 bg-warning/10 text-warning",
          )}
        >
          <p className="text-3xl font-bold">{Math.round(result.score * 100)}%</p>
          <p className="mt-1 text-sm font-semibold">
            {result.passed ? "Passed" : `Not yet — ${Math.round(passThreshold * 100)}% to pass`}
          </p>
        </div>
      )}

      {questions.map((q, i) => {
        const fb = byQuestion.get(q.id);
        return (
          <div key={q.id} className="border-border bg-card/40 rounded-2xl border p-6 backdrop-blur-xl">
            <div className="mb-3 flex items-start gap-2">
              <span className="text-muted-foreground font-mono text-sm">{i + 1}.</span>
              <p className="text-foreground font-medium">{q.prompt}</p>
              {fb && (
                <span
                  className={cn("ml-auto text-xs font-semibold", fb.isCorrect ? "text-success" : "text-destructive")}
                >
                  {fb.isCorrect ? "✓ correct" : "✗ incorrect"}
                </span>
              )}
            </div>
            {q.multi && !result && (
              <p className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">Select all that apply</p>
            )}
            <div className="space-y-2">
              {q.options.map((o) => {
                const picked = (answers[q.id] ?? []).includes(o.id);
                const isCorrectOpt = fb?.correctOptionIds.includes(o.id);
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
                        toggle(q, o.id);
                      }}
                      className="accent-primary"
                    />
                    <span>{o.body}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      {error && <p className="text-destructive text-sm">{error}</p>}

      {result ? (
        <button
          type="button"
          onClick={retake}
          className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl border px-5 py-3 text-sm font-semibold transition-colors"
        >
          Retake
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            void submit();
          }}
          disabled={submitting}
          className="shadow-cosmic-glow bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-5 py-3 text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {submitting ? "Grading…" : "Submit test"}
        </button>
      )}
    </div>
  );
}
