import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import confetti from "canvas-confetti";

interface Props {
  lessonId: string;
  initialCompleted: boolean;
}

const RESET_ERROR_MS = 3000;

export default function MarkCompleteButton({ lessonId, initialCompleted }: Props) {
  const [completed, setCompleted] = useState(initialCompleted);
  const [error, setError] = useState<string | null>(null);

  // Synchronous in-flight guard — React state flush is async, so a pure
  // `completed`-state guard allows two same-tick clicks to both pass.
  // The ref flips synchronously and immunises (S-04 impl-review F4 pattern).
  const inflightRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mount-only cleanup — clears any pending auto-clear timer if the
  // component unmounts within the 3s error-display window. Without this
  // the timeout fires setError(null) on an unmounted component (React
  // 18+ silently ignores it but the closure leaks until the timer
  // resolves).
  useEffect(() => {
    return () => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
    };
  }, []);

  function fireConfetti() {
    const node = buttonRef.current;
    if (!node || typeof window === "undefined") return;
    const rect = node.getBoundingClientRect();
    const x = (rect.left + rect.width / 2) / window.innerWidth;
    const y = (rect.top + rect.height / 2) / window.innerHeight;
    // confetti() returns a Promise that resolves when the animation
    // finishes — we don't need to await it (fire-and-forget animation).
    void confetti({
      particleCount: 150,
      spread: 70,
      origin: { x, y },
      disableForReducedMotion: true,
    });
  }

  async function handleClick() {
    if (inflightRef.current) return;
    inflightRef.current = true;
    const wasCompleted = completed;

    // Optimistic flip immediately so the UI feels instant. Particle fires
    // only on the mark-complete direction (celebration), not on unmark.
    setCompleted(!wasCompleted);
    setError(null);
    if (!wasCompleted) {
      fireConfetti();
    }

    try {
      const method = wasCompleted ? "DELETE" : "POST";
      const res = await fetch(`/api/lessons/${lessonId}/complete`, { method });
      if (!res.ok) {
        // Rollback optimistic flip + surface inline error. The particle
        // already fired (transient animation; not worth cancelling
        // mid-burst) but the state reverts so the next click can retry.
        setCompleted(wasCompleted);
        setError(res.status === 401 ? "Sign in to save your progress." : "Couldn't save — try again.");
      }
    } catch (err) {
      setCompleted(wasCompleted);
      // `fetch` throws TypeError on actual network failure (DNS, offline,
      // CORS). Anything else (e.g. AbortError from a future cancel) is
      // unexpected — surface a generic message instead of misleading the
      // user about a non-existent network problem.
      setError(err instanceof TypeError ? "Network error — try again in a moment." : "Couldn't save — try again.");
    } finally {
      inflightRef.current = false;
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      // Auto-clear the error after a beat so it doesn't sit forever
      // once the user notices it.
      errorTimerRef.current = setTimeout(() => {
        setError(null);
      }, RESET_ERROR_MS);
    }
  }

  const baseClasses =
    "inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
  const completedClasses = "border border-green-400/40 bg-green-400/10 text-green-200 hover:bg-green-400/20";
  const incompleteClasses = "shadow-cosmic-glow bg-primary text-primary-foreground hover:bg-primary/90";

  return (
    <div className="space-y-2">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        className={`${baseClasses} ${completed ? completedClasses : incompleteClasses}`}
        aria-pressed={completed}
      >
        <CheckCircle2 className="size-4" />
        {completed ? "Completed (click to unmark)" : "Mark as complete"}
      </button>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
