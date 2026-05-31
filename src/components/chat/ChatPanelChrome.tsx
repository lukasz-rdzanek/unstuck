import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import ChatPanel from "./ChatPanel";

interface Props {
  lessonId: string;
  userId: string | null;
  userDisplayName: string | null;
}

const MOBILE_MEDIA = "(max-width: 1023px)";

/**
 * Container chrome for the lesson page chat aside (S-07 Phase 1).
 *
 * Owns: container surface styling, mobile drawer state (collapsed bar
 * ↔ expanded near-full-screen overlay), body scroll-lock while
 * expanded, and the open/close controls. Renders ChatPanel as its
 * content child — ChatPanel itself is pure chat (no chrome) after the
 * S-07 P1 refactor.
 *
 * NOT used by LessonAside (S-07 P2) — LessonAside owns its own chrome
 * because it needs the tab strip + collapse to live alongside the
 * surface styling. ChatPanelChrome is the post-refactor checkpoint:
 * Phase 1 keeps the lesson page behaviour identical to S-02 while
 * proving ChatPanel works as a pure content component.
 */
export default function ChatPanelChrome({ lessonId, userId, userDisplayName }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

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

  const openDrawer = () => {
    setIsExpanded(true);
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
          <span>Live peer chat</span>
          <span className="text-muted-foreground text-xs">Tap to open ↑</span>
        </button>
      )}

      {/* Full chat — desktop always; mobile only when expanded. */}
      <div
        className={cn(
          "flex flex-col p-4 lg:p-6",
          // Mobile collapsed: hide ChatPanel content (only the bar above is visible).
          !isExpanded && "hidden",
          // Mobile expanded: take all remaining vertical space.
          isExpanded && "min-h-0 flex-1",
          // Desktop: always render.
          "lg:flex! lg:min-h-0 lg:flex-1",
        )}
      >
        {/* Close button — mobile expanded only. Lives above the chat
            header so the user can dismiss without scrolling. */}
        {isExpanded && (
          <div className="mb-2 flex justify-end lg:hidden">
            <button
              type="button"
              onClick={closeDrawer}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close chat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <ChatPanel lessonId={lessonId} userId={userId} userDisplayName={userDisplayName} fillHeight={isExpanded} />
      </div>
    </div>
  );
}
