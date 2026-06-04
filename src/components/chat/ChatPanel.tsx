import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import MessageBubble from "./MessageBubble";
import Composer from "./Composer";
import { useChatMessages } from "./useChatMessages";

interface Props {
  lessonId: string;
  userId: string | null;
  userDisplayName: string | null;
  /**
   * Called whenever the messages array length changes. Used by the
   * wrapper to track "new since I last looked" pulse signals (e.g.
   * pulse the Chat tab when LessonAside has the Lessons tab active
   * and a new message arrives).
   */
  onMessageCountChange?: (count: number) => void;
}

const SCROLL_BOTTOM_THRESHOLD = 50;

/**
 * Lesson-scoped chat content (S-07 P1 refactor: pure content, no chrome).
 *
 * What this owns: chat header (title + count), scroll region (reconnect
 * toast, load-older button, message list, new-message pill), Composer.
 *
 * What this does NOT own (post-refactor): container surface styling,
 * mobile drawer state, body scroll-lock, open/close controls. Those
 * live in the wrapper (ChatPanelChrome in S-07 P1, LessonAside in S-07
 * P2). The split lets the same chat content compose into either the
 * single-tab chrome (Phase 1) or the multi-tab nav-panel surface
 * (Phase 2) without duplicating chat logic.
 *
 * History:
 *   S-02 Phase 1: read-only.
 *   S-02 Phase 2: + Realtime + reconnect toast.
 *   S-02 Phase 3: + Composer + optimistic post + Retry/Discard.
 *   S-02 Phase 4: + mobile bottom-drawer (now extracted to chrome wrapper).
 *   S-07 Phase 1: chrome extracted; this file becomes pure content.
 */
export default function ChatPanel({ lessonId, userId, userDisplayName, onMessageCountChange }: Props) {
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

  // Notify the wrapper of message count changes so it can drive
  // tab-level pulse signals ("new chat messages while user is on
  // another tab"). Fires after every length change including initial
  // load — the wrapper is responsible for distinguishing
  // "first paint" from "new arrival".
  useEffect(() => {
    onMessageCountChange?.(messages.length);
  }, [messages.length, onMessageCountChange]);

  // Capture scroll state BEFORE the messages change is painted, so we can
  // decide whether to follow new messages or stay where the user is reading.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const grew = messages.length > prevLengthRef.current;
    prevLengthRef.current = messages.length;
    if (!grew) return;

    if (!el) return;
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
    <>
      <header className="border-border mb-3 flex items-center justify-between border-b pb-2">
        <h2 className="text-foreground text-base font-semibold">Live peer chat</h2>
        {!isLoading && !error && <span className="text-muted-foreground text-xs">{messages.length} messages</span>}
      </header>

      <div className="relative min-h-0 flex-1">
        {isReconnecting && (
          <div className="bg-card border-border text-foreground absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-full border px-3 py-1 text-xs shadow-md">
            Reconnected — catching up
          </div>
        )}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={cn(
            // Absolutely fill the `relative min-h-0 flex-1` wrapper so the list
            // scrolls INSIDE the panel regardless of percentage-height
            // resolution. The wrapper is flex-bounded by the surface
            // (mobile drawer = fixed; desktop = lg:h-[calc(100vh-9rem)]), and
            // the Composer is a flow sibling below, so it stays pinned/visible.
            "chat-scroll absolute inset-0 flex flex-col gap-3 overflow-y-auto",
          )}
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
    </>
  );
}
