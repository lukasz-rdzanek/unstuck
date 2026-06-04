import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, ListTree, PanelRightClose, PanelLeftOpen, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import ChatPanel from "@/components/chat/ChatPanel";
import LessonsNav from "./LessonsNav";
import type { ChapterWithLessons } from "@/types";

type Tab = "chat" | "lessons";

interface Props {
  courseId: string;
  lessonId: string;
  userId: string | null;
  userDisplayName: string | null;
  courseSlug: string;
  chapters: ChapterWithLessons[];
  completedLessonIds: string[];
  currentLessonId: string;
  /**
   * UNS-14 (c): MAX of courses.updated_at + lessons.updated_at across the
   * whole course, ISO string. Null when there's no signed-in user or no
   * course context. UI consumes in Phase 4 — passed but unused here for
   * now (props are wired in P3 so the next phase is a UI-only change).
   */
  courseUpdatedAt: string | null;
  /**
   * UNS-14 (c): the user's last_seen_at for this course (from
   * course_views), ISO string. Null on first visit after deploy —
   * indicator is suppressed in that case per Q5 graceful-default
   * decision. UI consumes in Phase 4.
   */
  lastSeenAt: string | null;
}

const MOBILE_MEDIA = "(max-width: 1023px)";
const TAB_STORAGE_KEY = "unstuck.lesson-aside.tab";
const COLLAPSED_STORAGE_KEY = "unstuck.lesson-aside.collapsed";

/** Per-course dismiss key for the UNS-14 "course updated" banner. Stores
 *  the ISO timestamp of the courseUpdatedAt that was dismissed; a NEWER
 *  update supersedes the dismiss and re-shows the indicator. */
function courseUpdateDismissedKey(courseId: string): string {
  return `unstuck.lesson-aside.course-update-dismissed.${courseId}`;
}

// localStorage helpers — Safari private mode throws on write, so every
// read/write is try/catch wrapped with sensible defaults.
function readLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Quota exceeded or private mode — silently swallow.
  }
}

function loadTab(): Tab {
  // Default flipped to "lessons" (UNS-14): new users see course progress
  // as the primary affordance. Returning users with a stored "chat"
  // preference are honored — we explicitly check for "chat" so anyone
  // else (no key, malformed value, "lessons" itself) lands on Lessons.
  const stored = readLocalStorage(TAB_STORAGE_KEY);
  return stored === "chat" ? "chat" : "lessons";
}

function loadCollapsed(): boolean {
  return readLocalStorage(COLLAPSED_STORAGE_KEY) === "true";
}

/**
 * Lesson page aside (S-07 P2): tab switcher (Chat / Lessons) + collapse
 * toggle + mobile drawer + thin fixed pill handle to re-open when
 * collapsed (desktop only).
 *
 * Owns: container surface styling, mobile drawer state + body
 * scroll-lock, tab state (localStorage), collapsed state (localStorage),
 * pulse signal when chat has new messages while the Lessons tab is
 * active. Composes ChatPanel + LessonsNav internally (single React
 * island — both children hydrate as part of this component's tree).
 *
 * Replaces ChatPanelChrome (S-07 P1) on the lesson page.
 */
export default function LessonAside({
  courseId,
  lessonId,
  userId,
  userDisplayName,
  courseSlug,
  chapters,
  completedLessonIds,
  currentLessonId,
  courseUpdatedAt,
  lastSeenAt,
}: Props) {
  const [activeTab, setActiveTabState] = useState<Tab>(() => loadTab());

  // UNS-14 (c) indicator state. Derived `hasFreshUpdate` boolean:
  //   - true iff lastSeenAt != null AND courseUpdatedAt > lastSeenAt
  //   - per Q5 graceful default: lastSeenAt == null (first-visit-after-
  //     deploy) suppresses the indicator entirely
  // `dismissedAt` is the ISO timestamp the user last dismissed for THIS
  // courseId. A newer courseUpdatedAt supersedes the dismiss.
  const hasFreshUpdate = lastSeenAt !== null && courseUpdatedAt !== null && courseUpdatedAt > lastSeenAt;
  const [dismissedAt, setDismissedAt] = useState<string | null>(() =>
    readLocalStorage(courseUpdateDismissedKey(courseId)),
  );
  const showIndicator = hasFreshUpdate && (dismissedAt === null || (courseUpdatedAt && dismissedAt < courseUpdatedAt));

  const dismissUpdateIndicator = useCallback(() => {
    if (!courseUpdatedAt) return;
    writeLocalStorage(courseUpdateDismissedKey(courseId), courseUpdatedAt);
    setDismissedAt(courseUpdatedAt);
  }, [courseId, courseUpdatedAt]);
  const [collapsed, setCollapsedState] = useState<boolean>(() => loadCollapsed());

  // Mobile drawer expansion (ephemeral — not persisted).
  const [isExpanded, setIsExpanded] = useState(false);

  // Pulse signal: new chat messages while we're NOT on the Chat tab.
  // Cleared when user switches back to Chat.
  const [hasNewChat, setHasNewChat] = useState(false);
  const prevMessageCountRef = useRef<number | null>(null);

  // Mirror activeTab + isExpanded into refs so handleChatMessageCount
  // can read the latest values without including them in its useCallback
  // dep array — otherwise the callback identity churns on every state
  // change and re-fires ChatPanel's onMessageCountChange effect.
  const activeTabRef = useRef<Tab>(activeTab);
  const isExpandedRef = useRef<boolean>(isExpanded);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  useEffect(() => {
    isExpandedRef.current = isExpanded;
  }, [isExpanded]);

  const setActiveTab = useCallback((tab: Tab) => {
    setActiveTabState(tab);
    writeLocalStorage(TAB_STORAGE_KEY, tab);
    if (tab === "chat") setHasNewChat(false);
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    writeLocalStorage(COLLAPSED_STORAGE_KEY, value ? "true" : "false");
  }, []);

  // Body scroll-lock while the mobile drawer is expanded.
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

  const handleChatMessageCount = useCallback((count: number) => {
    const prev = prevMessageCountRef.current;
    prevMessageCountRef.current = count;
    // First report is the initial load — don't treat as "new".
    if (prev === null) return;
    if (count <= prev) return;
    // New message arrived. Pulse the Chat tab unless we're already
    // looking at it (or the mobile drawer is collapsed —
    // pulse always indicates "Chat has activity you haven't seen").
    if (
      activeTabRef.current !== "chat" ||
      (typeof window !== "undefined" && window.matchMedia(MOBILE_MEDIA).matches && !isExpandedRef.current)
    ) {
      setHasNewChat(true);
    }
  }, []);

  // === Render: desktop collapsed ===
  // Pill handle on the right edge; aside hidden via grid-collapse in
  // the lesson page (it doesn't render the wrapper at all in this
  // mode, so we render only the fixed handle here).
  if (collapsed) {
    return (
      <button
        type="button"
        data-aside-collapsed="true"
        onClick={() => {
          setCollapsed(false);
        }}
        aria-label="Open lesson panel"
        className="bg-card/60 border-border text-foreground/80 hover:bg-card/80 fixed top-1/2 right-0 z-40 hidden -translate-y-1/2 flex-col items-center gap-2 rounded-l-2xl border-y border-l px-2 py-4 backdrop-blur-xl transition-colors lg:flex"
      >
        <PanelLeftOpen className="size-4" />
        <span
          className="text-[10px] font-semibold tracking-widest uppercase"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          Panel
        </span>
      </button>
    );
  }

  // === Render: expanded surface (desktop always; mobile only when isExpanded) ===
  const surface = (
    <div
      data-aside-collapsed="false"
      className={cn(
        "bg-card/95 border-border backdrop-blur-xl",
        // Mobile collapsed: fixed thin bar at bottom.
        "fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t",
        // Mobile expanded: near-full-screen overlay (topbar at top-16 stays visible).
        isExpanded && "top-16 z-50 flex flex-col",
        // Desktop: revert to inline card inside <aside>. Definite height tied
        // to the viewport (the aside is `lg:sticky lg:top-8`) with a ~9rem
        // allowance for the topbar + page padding + a >=20px bottom gap, so the
        // panel always fits on screen and the chat/lessons lists scroll INSIDE
        // it. flex-col + overflow-hidden keep the Composer pinned and visible.
        "lg:shadow-cosmic-glow lg:bg-card/40 lg:relative lg:inset-auto lg:top-auto lg:z-auto lg:flex lg:h-[calc(100vh-9rem)] lg:flex-col lg:overflow-hidden lg:rounded-2xl lg:border",
      )}
    >
      {/* Mobile collapsed bar — tap target with pulse indicator. */}
      {!isExpanded && (
        <button
          type="button"
          onClick={() => {
            setIsExpanded(true);
          }}
          className="text-foreground flex w-full items-center justify-between px-4 py-3 text-sm font-semibold lg:hidden"
          aria-label="Open lesson panel"
          aria-expanded={isExpanded}
        >
          <span className="flex items-center gap-2">
            <span>Lesson panel</span>
            {hasNewChat && (
              <span className="bg-accent h-2 w-2 animate-pulse rounded-full" aria-label="New chat activity" />
            )}
          </span>
          <span className="text-muted-foreground text-xs">Tap to open ↑</span>
        </button>
      )}

      {/* Full content — desktop always; mobile only when expanded. */}
      <div
        className={cn(
          "flex flex-col p-4 lg:p-6",
          !isExpanded && "hidden",
          isExpanded && "min-h-0 flex-1",
          "lg:flex! lg:min-h-0 lg:flex-1",
        )}
      >
        {/* Header row: tab strip + close (mobile) + collapse (desktop) */}
        <div className="border-border mb-3 flex items-center justify-between gap-2 border-b pb-2">
          <div className="flex items-center gap-1" role="tablist" aria-label="Lesson aside tabs">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "lessons"}
              onClick={() => {
                setActiveTab("lessons");
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                activeTab === "lessons"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/60",
              )}
            >
              <ListTree className="size-3.5" />
              <span>Lessons</span>
              {showIndicator && (
                <span
                  className="bg-info ml-1 h-1.5 w-1.5 rounded-full"
                  aria-label="Course has new content since your last visit"
                />
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "chat"}
              onClick={() => {
                setActiveTab("chat");
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                activeTab === "chat"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/60",
              )}
            >
              <MessageSquare className="size-3.5" />
              <span>Chat</span>
              {hasNewChat && activeTab !== "chat" && (
                <span
                  className="bg-accent ml-1 h-1.5 w-1.5 animate-pulse rounded-full"
                  aria-label="New chat activity"
                />
              )}
            </button>
          </div>
          <div className="flex items-center gap-1">
            {/* Collapse — desktop only. */}
            <button
              type="button"
              onClick={() => {
                setCollapsed(true);
              }}
              aria-label="Collapse panel"
              className="text-muted-foreground hover:text-foreground hidden p-1 lg:inline-flex"
            >
              <PanelRightClose className="size-4" />
            </button>
            {/* Close drawer — mobile expanded only. */}
            {isExpanded && (
              <button
                type="button"
                onClick={() => {
                  setIsExpanded(false);
                }}
                aria-label="Close panel"
                className="text-muted-foreground hover:text-foreground p-1 lg:hidden"
              >
                <X className="size-5" />
              </button>
            )}
          </div>
        </div>

        {/* Content. Chat stays mounted under display-toggle to preserve
            Realtime subscription + scroll position. LessonsNav
            conditionally renders (no Realtime; cheap to remount). */}
        <div className={cn("flex min-h-0 flex-1 flex-col", activeTab !== "chat" && "hidden")}>
          <ChatPanel
            lessonId={lessonId}
            userId={userId}
            userDisplayName={userDisplayName}
            onMessageCountChange={handleChatMessageCount}
          />
        </div>
        {activeTab === "lessons" && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {showIndicator && (
              <div className="border-info/30 bg-info/10 text-info flex items-start gap-2 rounded-lg border p-3 text-xs">
                <Sparkles className="text-info mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p className="flex-1">This course has new content since your last visit.</p>
                <button
                  type="button"
                  onClick={dismissUpdateIndicator}
                  className="text-info hover:text-info/80 transition-colors"
                  aria-label="Dismiss course-updated notice"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}
            <LessonsNav
              courseSlug={courseSlug}
              chapters={chapters}
              completedLessonIds={completedLessonIds}
              currentLessonId={currentLessonId}
            />
          </div>
        )}
      </div>
    </div>
  );

  return surface;
}
