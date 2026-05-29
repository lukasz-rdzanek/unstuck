import { useEffect, useRef, useState, useCallback } from "react";
import type { LessonChatMessage } from "@/types";
import { createClientBrowser } from "@/lib/supabase-browser";
import { listInitialMessages, listOlderPeers } from "@/lib/services/messages";

const PEER_LIMIT = 50;

interface UseChatMessagesOptions {
  lessonId: string;
  userId: string | null;
}

interface UseChatMessagesReturn {
  messages: LessonChatMessage[];
  isLoading: boolean;
  error: string | null;
  hasOlder: boolean;
  isLoadingOlder: boolean;
  loadOlder: () => Promise<void>;
}

/**
 * Owns chat state for one lesson. Phase 1 = read-only (initial fetch +
 * load older). Phase 2 will extend with Realtime subscription; Phase 3
 * with optimistic post / retry / discard.
 */
export function useChatMessages({ lessonId }: UseChatMessagesOptions): UseChatMessagesReturn {
  const [messages, setMessages] = useState<LessonChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const supabaseRef = useRef(createClientBrowser());

  useEffect(() => {
    const supabase = supabaseRef.current;
    if (!supabase) {
      setError("Chat unavailable — Supabase not configured");
      setIsLoading(false);
      return;
    }

    const cancelled = { current: false };
    void (async () => {
      setIsLoading(true);
      const initial = await listInitialMessages(supabase, lessonId, { peerLimit: PEER_LIMIT });
      if (cancelled.current) return;
      const peerCount = initial.filter((m) => !m.is_seeded).length;
      setMessages(initial);
      setHasOlder(peerCount === PEER_LIMIT);
      setIsLoading(false);
    })();

    return () => {
      cancelled.current = true;
    };
  }, [lessonId]);

  const loadOlder = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase || isLoadingOlder) return;

    // Cursor: earliest non-seed created_at in current state.
    const earliestPeer = messages.find((m) => !m.is_seeded);
    if (!earliestPeer) return;

    setIsLoadingOlder(true);
    const older = await listOlderPeers(supabase, lessonId, earliestPeer.created_at, { limit: PEER_LIMIT });

    setMessages((prev) => {
      // Insert older peers AFTER seeds, BEFORE existing peers.
      const seeds = prev.filter((m) => m.is_seeded);
      const existingPeers = prev.filter((m) => !m.is_seeded);
      const olderById = new Set(older.map((m) => m.id));
      const dedupedExisting = existingPeers.filter((m) => !olderById.has(m.id));
      return [...seeds, ...older, ...dedupedExisting];
    });
    setHasOlder(older.length === PEER_LIMIT);
    setIsLoadingOlder(false);
  }, [lessonId, messages, isLoadingOlder]);

  return { messages, isLoading, error, hasOlder, isLoadingOlder, loadOlder };
}
