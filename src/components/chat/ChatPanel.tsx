import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import MessageBubble from "./MessageBubble";
import Composer from "./Composer";
import { useChatMessages } from "./useChatMessages";

interface Props {
  lessonId: string;
  userId: string | null;
  userDisplayName: string | null;
}

const SCROLL_BOTTOM_THRESHOLD = 50;

/**
 * Lesson-scoped chat panel. Phase 1 = read-only (initial fetch +
 * pagination + auto-scroll discipline). Phase 2 wires Realtime; Phase 3
 * wires the Composer.
 */
export default function ChatPanel({ lessonId, userId, userDisplayName }: Props) {
  const {
    messages,
    isLoading,
    error,
    hasOlder,
    isLoadingOlder,
    loadOlder,
    isReconnecting,
    postMessage,
    retryMessage,
    discardMessage,
  } = useChatMessages({
    lessonId,
    userId,
    userDisplayName,
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const wasAtBottomRef = useRef(true);
  const prevLengthRef = useRef(0);
  const [showNewPill, setShowNewPill] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Refresh "5 min ago" every 60s.
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  // Capture scroll state BEFORE the messages change is painted, so we can
  // decide whether to follow new messages or stay where the user is reading.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = messages.length > prevLengthRef.current;
    prevLengthRef.current = messages.length;
    if (!grew) return;

    if (wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      setShowNewPill(false);
    } else {
      setShowNewPill(true);
    }
  }, [messages.length]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    wasAtBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_BOTTOM_THRESHOLD;
    if (wasAtBottomRef.current && showNewPill) setShowNewPill(false);
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    wasAtBottomRef.current = true;
    setShowNewPill(false);
  };

  return (
    <div className="shadow-cosmic-glow bg-card/40 border-border flex flex-col rounded-2xl border p-4 backdrop-blur-xl lg:p-6">
      <header className="border-border mb-3 flex items-center justify-between border-b pb-2">
        <h2 className="text-foreground text-base font-semibold">Live peer chat</h2>
        {!isLoading && !error && <span className="text-muted-foreground text-xs">{messages.length} messages</span>}
      </header>

      <div className="relative">
        {isReconnecting && (
          <div className="bg-card border-border text-foreground absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-full border px-3 py-1 text-xs shadow-md">
            Reconnected — catching up
          </div>
        )}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="chat-scroll flex h-[60vh] flex-col gap-3 overflow-y-auto lg:h-[calc(100vh-16rem)]"
        >
          {error ? (
            <p className="text-muted-foreground p-4 text-center text-sm">{error}</p>
          ) : isLoading ? (
            <>
              <div className="bg-card/60 h-12 animate-pulse rounded-xl" />
              <div className="bg-card/60 h-12 animate-pulse rounded-xl" />
              <div className="bg-card/60 h-12 animate-pulse rounded-xl" />
            </>
          ) : messages.length === 0 ? (
            <p className="text-muted-foreground p-4 text-center text-sm">No messages yet — be the first to post.</p>
          ) : (
            <>
              {hasOlder && (
                <button
                  type="button"
                  onClick={() => void loadOlder()}
                  disabled={isLoadingOlder}
                  className="text-primary self-center text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
                >
                  {isLoadingOlder ? "Loading…" : "Load older messages"}
                </button>
              )}
              {messages.map((message) => {
                const tempId = message.tempId;
                return (
                  <MessageBubble
                    key={message.tempId ?? message.id}
                    message={message}
                    isOwn={message.author?.id === userId}
                    now={now}
                    onRetry={tempId ? () => void retryMessage(tempId) : undefined}
                    onDiscard={
                      tempId
                        ? () => {
                            discardMessage(tempId);
                          }
                        : undefined
                    }
                  />
                );
              })}
            </>
          )}
        </div>

        {showNewPill && (
          <button
            type="button"
            onClick={scrollToBottom}
            className={cn(
              "bg-primary text-primary-foreground absolute right-3 bottom-3 rounded-full px-3 py-1 text-xs shadow-md transition-opacity hover:opacity-90",
            )}
          >
            New ↓
          </button>
        )}
      </div>

      <Composer
        onSubmit={(body) => {
          void postMessage(body);
        }}
        disabled={userId === null}
      />
    </div>
  );
}
