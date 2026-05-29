import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onSubmit: (body: string) => void;
  disabled?: boolean;
}

const MAX_LEN = 4000;
const COUNTER_THRESHOLD = 3000;
const MAX_ROWS = 6;

/**
 * Textarea composer. Enter (without Shift) submits; Shift+Enter inserts
 * newline. Auto-grows from 1 to MAX_ROWS lines, then scrolls internally.
 * Char counter appears at COUNTER_THRESHOLD. Send button disabled when
 * empty / over MAX_LEN / parent-disabled.
 */
export default function Composer({ onSubmit, disabled }: Props) {
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow: reset height, then measure scrollHeight and cap to MAX_ROWS.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const maxHeight = lineHeight * MAX_ROWS;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [body]);

  const trimmed = body.trim();
  const overLimit = body.length > MAX_LEN;
  const canSubmit = !disabled && trimmed.length > 0 && !overLimit;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
    setBody("");
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="border-border mt-3 flex flex-col gap-1 border-t pt-3"
    >
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
          }}
          onKeyDown={handleKey}
          disabled={disabled}
          rows={1}
          placeholder={disabled ? "Sign in to post a message" : "Ask a question or share a tip…"}
          className={cn(
            "chat-scroll bg-card/40 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring min-h-10 flex-1 resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2",
            disabled && "cursor-not-allowed opacity-60",
          )}
          aria-label="Message"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            "bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-opacity",
            !canSubmit && "cursor-not-allowed opacity-50",
          )}
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      {body.length >= COUNTER_THRESHOLD && (
        <span className={cn("text-muted-foreground self-end text-xs tabular-nums", overLimit && "text-destructive")}>
          {body.length} / {MAX_LEN}
        </span>
      )}
    </form>
  );
}
