import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
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
const MOBILE_MEDIA = "(max-width: 1023px)";

/**
 * Lesson-scoped chat panel.
 *
 * Phase 1: read-only.
 * Phase 2: + Realtime + reconnect toast.
 * Phase 3: + Composer + optimistic post + Retry/Discard.
 * Phase 4 (this file): + minimal mobile bottom-drawer. Below the lg
 * breakpoint the panel renders as a fixed bar that the learner taps to
 * expand into a near-full-screen overlay with body scroll locked.
 * Desktop layout is unchanged.
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

  // Mobile drawer state.
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasNewSinceCollapse, setHasNewSinceCollapse] = useState(false);

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
  // Also tracks the "new since collapse" pulse signal for the mobile drawer.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const grew = messages.length > prevLengthRef.current;
    prevLengthRef.current = messages.length;
    if (!grew) return;

    // Mobile pulse: only meaningful when the drawer is collapsed and the
    // viewport is narrow. Deferred via queueMicrotask so the setState
    // doesn't trip the "synchronous state update inside layout effect"
    // lint (it would otherwise be a transitive re-render trigger).
    if (!isExpanded && typeof window !== "undefined" && window.matchMedia(MOBILE_MEDIA).matches) {
      queueMicrotask(() => {
        setHasNewSinceCollapse(true);
      });
    }

    if (!el) return;
    if (wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      setShowNewPill(false);
    } else {
      setShowNewPill(true);
    }
  }, [messages.length, isExpanded]);

  // Body scroll-lock while the mobile drawer is expanded. Restored on
  // collapse and on unmount (defense against navigation away while open).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isExpanded) return;
    if (!window.matchMedia(MOBILE_MEDIA).matches) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isExpanded]);

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

  const openDrawer = () => {
    setIsExpanded(true);
    setHasNewSinceCollapse(false);
    // Scroll-to-bottom after the expanded layout paints so the latest
    // message is visible without manual scroll. Run via rAF so the DOM
    // exists at scroll time.
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
        wasAtBottomRef.current = true;
      }
    });
  };

  const closeDrawer = () => {
    setIsExpanded(false);
  };

  return (
    <div
      className={cn(
        // Common surface styling (desktop + mobile expanded share this).
        "bg-card/95 border-border backdrop-blur-xl",
        // Mobile collapsed: fixed thin bar at bottom.
        "fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t",
        // Mobile expanded: near-full-screen overlay (topbar at top-16 stays visible).
        isExpanded && "top-16 z-50 flex flex-col",
        // Desktop: revert to inline card inside <aside>.
        "lg:shadow-cosmic-glow lg:bg-card/40 lg:relative lg:inset-auto lg:top-auto lg:z-auto lg:flex lg:flex-col lg:rounded-2xl lg:border",
      )}
    >
      {/* Mobile collapsed bar — tap target. Hidden on desktop. */}
      {!isExpanded && (
        <button
          type="button"
          onClick={openDrawer}
          className="text-foreground flex w-full items-center justify-between px-4 py-3 text-sm font-semibold lg:hidden"
          aria-label="Open chat"
          aria-expanded={false}
        >
          <span className="flex items-center gap-2">
            <span>Live peer chat</span>
            <span className="text-muted-foreground font-normal">· {messages.length}</span>
            {hasNewSinceCollapse && (
              <span className="bg-accent h-2 w-2 animate-pulse rounded-full" aria-label="New messages" />
            )}
          </span>
          <span className="text-muted-foreground text-xs">Tap to open ↑</span>
        </button>
      )}

      {/* Full chat — desktop always; mobile only when expanded. */}
      <div
        className={cn(
          "flex flex-col p-4 lg:p-6",
          // Mobile collapsed: hide the full chat (only the bar above is visible).
          !isExpanded && "hidden",
          // Mobile expanded: take all remaining vertical space.
          isExpanded && "min-h-0 flex-1",
          // Desktop: always render.
          "lg:flex! lg:min-h-0 lg:flex-1",
        )}
      >
        <header className="border-border mb-3 flex items-center justify-between border-b pb-2">
          <h2 className="text-foreground text-base font-semibold">Live peer chat</h2>
          <div className="flex items-center gap-3">
            {!isLoading && !error && <span className="text-muted-foreground text-xs">{messages.length} messages</span>}
            {/* Close button — mobile expanded only. */}
            {isExpanded && (
              <button
                type="button"
                onClick={closeDrawer}
                className="text-muted-foreground hover:text-foreground lg:hidden"
                aria-label="Close chat"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
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
              "chat-scroll flex flex-col gap-3 overflow-y-auto",
              // Mobile expanded: fill the available space.
              isExpanded ? "h-full" : "h-[60vh]",
              "lg:h-[calc(100vh-16rem)]",
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
      </div>
    </div>
  );
}
