import type { LessonChatMessage } from "@/types";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/relative-time";
import { avatarColor } from "./avatar-color";

interface Props {
  message: LessonChatMessage;
  isOwn: boolean;
  now: Date;
}

/**
 * Discord-style chat bubble. Operator-seeded and peer messages render
 * IDENTICALLY per PRD FR-006 AC — the only distinction is positional
 * (seed-pinned at top of list).
 */
export default function MessageBubble({ message, isOwn, now }: Props) {
  const displayName = message.author?.display_name ?? "Learner";
  const initial = displayName.charAt(0).toUpperCase() || "?";
  const color = avatarColor(displayName);

  return (
    <div className={cn("flex items-start gap-3", isOwn && "flex-row-reverse")}>
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
          )}
        >
          <p className="wrap-break-word whitespace-pre-wrap">{message.body}</p>
        </div>
      </div>
    </div>
  );
}
