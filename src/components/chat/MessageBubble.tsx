import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/relative-time";
import { avatarColor } from "./avatar-color";
import type { ChatPanelMessage } from "./useChatMessages";

interface Props {
  message: ChatPanelMessage;
  isOwn: boolean;
  now: Date;
  onRetry?: () => void;
  onDiscard?: () => void;
}

/**
 * Discord-style chat bubble. Operator-seeded and peer messages render
 * IDENTICALLY per PRD FR-006 AC — the only distinction is positional
 * (seed-pinned at top of list).
 *
 * Optimistic (status='sending') bubbles render at reduced opacity.
 * Failed (status='failed') bubbles get destructive border + inline
 * Retry / Discard controls.
 */
export default function MessageBubble({ message, isOwn, now, onRetry, onDiscard }: Props) {
  const displayName = message.author?.display_name ?? "Learner";
  const initial = displayName.charAt(0).toUpperCase() || "?";
  const color = avatarColor(displayName);
  const isSending = message.status === "sending";
  const isFailed = message.status === "failed";

  return (
    <div className={cn("flex items-start gap-3", isOwn && "flex-row-reverse", isSending && "opacity-70")}>
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      >
        {initial}
      </div>
      <div className={cn("flex min-w-0 flex-col gap-1", isOwn && "items-end")}>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <span className="text-foreground font-medium">{displayName}</span>
          <span>·</span>
          <time dateTime={typeof message.created_at === "string" ? message.created_at : undefined}>
            {relativeTime(message.created_at, now)}
          </time>
        </div>
        <div
          className={cn(
            "rounded-2xl px-3 py-2 text-sm",
            isOwn ? "bg-primary/20 text-foreground" : "bg-card/40 text-foreground border-border border",
            isFailed && "border-destructive/40 text-muted-foreground border",
          )}
        >
          <p className="wrap-break-word whitespace-pre-wrap">{message.body}</p>
        </div>
        {isFailed && (
          <div className="text-destructive flex items-center gap-2 text-xs">
            <span>Failed to send</span>
            <span>·</span>
            <button
              type="button"
              onClick={onRetry}
              className="hover:text-foreground underline-offset-2 transition-colors hover:underline"
            >
              Retry
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={onDiscard}
              className="hover:text-foreground underline-offset-2 transition-colors hover:underline"
            >
              Discard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
