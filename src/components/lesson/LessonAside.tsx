import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, ListTree, PanelRightClose, PanelLeftOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import ChatPanel from "@/components/chat/ChatPanel";
import LessonsNav from "./LessonsNav";
import type { ChapterWithLessons } from "@/types";

type Tab = "chat" | "lessons";

interface Props {
  lessonId: string;
  userId: string | null;
  userDisplayName: string | null;
  courseSlug: string;
  chapters: ChapterWithLessons[];
  completedLessonIds: string[];
  currentLessonId: string;
}

const MOBILE_MEDIA = "(max-width: 1023px)";
const TAB_STORAGE_KEY = "unstuck.lesson-aside.tab";
const COLLAPSED_STORAGE_KEY = "unstuck.lesson-aside.collapsed";

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
  const stored = readLocalStorage(TAB_STORAGE_KEY);
  return stored === "lessons" ? "lessons" : "chat";
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
  lessonId,
  userId,
  userDisplayName,
  courseSlug,
  chapters,
  completedLessonIds,
  currentLessonId,
}: Props) {
  const [activeTab, setActiveTabState] = useState<Tab>(() => loadTab());
  const [collapsed, setCollapsedState] = useState<boolean>(() => loadCollapsed());

  // Mobile drawer expansion (ephemeral — not persisted).
  const [isExpanded, setIsExpanded] = useState(false);

  // Pulse signal: new chat messages while we're NOT on the Chat tab.
  // Cleared when user switches back to Chat.
  const [hasNewChat, setHasNewChat] = useState(false);
  const prevMessageCountRef = useRef<number | null>(null);

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

  const handleChatMessageCount = useCallback(
    (count: number) => {
      const prev = prevMessageCountRef.current;
      prevMessageCountRef.current = count;
      // First report is the initial load — don't treat as "new".
      if (prev === null) return;
      if (count <= prev) return;
      // New message arrived. Pulse the Chat tab unless we're already
      // looking at it (or the mobile drawer is collapsed — the existing
      // ChatPanelChrome had a similar signal there; here we
      // consolidate: pulse always indicates "Chat has activity you
      // haven't seen", regardless of cause).
      if (
        activeTab !== "chat" ||
        (typeof window !== "undefined" && window.matchMedia(MOBILE_MEDIA).matches && !isExpanded)
      ) {
        setHasNewChat(true);
      }
    },
    [activeTab, isExpanded],
  );

  // === Render: desktop collapsed ===
  // Pill handle on the right edge; aside hidden via grid-collapse in
  // the lesson page (it doesn't render the wrapper at all in this
  // mode, so we render only the fixed handle here).
  if (collapsed) {
    return (
      <button
        type="button"
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
      className={cn(
        "bg-card/95 border-border backdrop-blur-xl",
        // Mobile collapsed: fixed thin bar at bottom.
        "fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t",
        // Mobile expanded: near-full-screen overlay (topbar at top-16 stays visible).
        isExpanded && "top-16 z-50 flex flex-col",
        // Desktop: revert to inline card inside <aside>.
        "lg:shadow-cosmic-glow lg:bg-card/40 lg:relative lg:inset-auto lg:top-auto lg:z-auto lg:flex lg:flex-col lg:rounded-2xl lg:border",
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
          aria-expanded={false}
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
            fillHeight={isExpanded}
            onMessageCountChange={handleChatMessageCount}
          />
        </div>
        {activeTab === "lessons" && (
          <div className="min-h-0 flex-1">
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
