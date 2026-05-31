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

    // Cancel any in-flight burst before firing — rapid mark/unmark/mark
    // cycles otherwise stack live particle systems on top of each other.
    confetti.reset();

    // Button-rect origin (normalized 0-1) for the center shot.
    const rect = node.getBoundingClientRect();
    const buttonX = (rect.left + rect.width / 2) / window.innerWidth;
    const buttonY = (rect.top + rect.height / 2) / window.innerHeight;

    // Shared physics base. Higher startVelocity + ticks so particles
    // actually travel across the viewport instead of clumping at spawn.
    // Colors: canvas-confetti default rainbow palette — cosmic tokens
    // (--primary/--accent/--ring) blend into the dark theme background;
    // bright defaults give us the contrast needed for a visible celebration.
    const base = {
      startVelocity: 55,
      ticks: 250,
      gravity: 0.9,
      decay: 0.92,
      disableForReducedMotion: true,
    };

    // Three sequential shots — left cannon → center burst → right cannon.
    // 150ms stagger gives ~500ms total run time (the gravity pulls the
    // first shot's particles down by the time the third fires).
    // confetti() returns a Promise that resolves when the animation
    // finishes — fire-and-forget; orphaned setTimeouts after unmount
    // are harmless (the library appends to document.body anyway).
    void confetti({
      ...base,
      particleCount: 70,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.7 },
    });
    window.setTimeout(() => {
      void confetti({
        ...base,
        particleCount: 100,
        angle: 90,
        spread: 100,
        origin: { x: buttonX, y: buttonY },
      });
    }, 150);
    window.setTimeout(() => {
      void confetti({
        ...base,
        particleCount: 70,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
      });
    }, 300);
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
      } else if (typeof window !== "undefined") {
        // UNS-14 (d): broadcast confirmed completion change so sibling
        // islands (currently LessonsNav) can update their UI without a
        // full page navigation. Event name follows project convention
        // `unstuck:<feature>:<action>` (first such bus in the repo).
        // Dispatch only on success — rollback path keeps subscribers
        // consistent with server truth.
        window.dispatchEvent(
          new CustomEvent("unstuck:lesson-completion-changed", {
            detail: { lessonId, completed: !wasCompleted },
          }),
        );
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
