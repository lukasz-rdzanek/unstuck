import { useEffect, useRef, useState, useCallback } from "react";
import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import type { LessonChatMessage } from "@/types";
import type { Database } from "@/lib/db/database.types";
import { createClientBrowser } from "@/lib/supabase-browser";
import { listInitialMessages, listOlderPeers } from "@/lib/services/messages";

const PEER_LIMIT = 50;
const EMBED_AUTHOR = "*, author:profiles!messages_author_id_fkey(id, display_name)";

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
  isReconnecting: boolean;
}

/**
 * Owns chat state for one lesson.
 *
 * Phase 1: read-only (initial fetch + load older).
 * Phase 2 (this file): + Realtime postgres_changes subscription on
 *   messages-INSERT scoped to lesson_id, dedupe by id, socket-level
 *   reconnect detection (onOpen/onClose) with refetch+merge.
 * Phase 3: + optimistic post / retry / discard.
 *
 * Reconnect detection uses socket-level `realtime.onOpen/onClose` events
 * rather than the per-channel `.subscribe((status) => ...)` callback —
 * the auto-rejoin status re-fire is documented as flaky (supabase-js
 * issue #1473). See plan-review F4.
 */
export function useChatMessages({ lessonId }: UseChatMessagesOptions): UseChatMessagesReturn {
  const [messages, setMessages] = useState<LessonChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const supabaseRef = useRef(createClientBrowser());

  useEffect(() => {
    const supabase = supabaseRef.current;
    if (!supabase) {
      setError("Chat unavailable — Supabase not configured");
      setIsLoading(false);
      return;
    }

    const cancelled = { current: false };
    const wasDisconnected = { current: false };

    // Dedupe-aware append. Same key used by initial fetch + Realtime
    // arrivals + reconnect refetch.
    const upsertMessage = (msg: LessonChatMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    // Realtime postgres_changes payloads do NOT follow PostgREST embeds —
    // payload.new is just the messages row. We refetch by id to hydrate
    // the author join so MessageBubble renders the right display_name.
    const fetchAndUpsert = async (id: string) => {
      const { data, error: fetchErr } = await supabase.from("messages").select(EMBED_AUTHOR).eq("id", id).single();
      if (fetchErr) return;
      upsertMessage(data);
    };

    // Reconnect catch-up: refetch the initial slice and merge with current
    // state (upsert by id). Resolves a stale state if any INSERTs landed
    // while the socket was disconnected.
    const refetchAndMerge = async () => {
      const fresh = await listInitialMessages(supabase, lessonId, { peerLimit: PEER_LIMIT });
      if (cancelled.current) return;
      setMessages((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]));
        for (const msg of fresh) byId.set(msg.id, msg);
        // Preserve seeds-first + chronological order via the canonical sort
        // (is_seeded DESC, then created_at ASC).
        return Array.from(byId.values()).sort((a, b) => {
          if (a.is_seeded !== b.is_seeded) return a.is_seeded ? -1 : 1;
          return a.created_at.localeCompare(b.created_at);
        });
      });
    };

    // 1. Initial fetch.
    void (async () => {
      setIsLoading(true);
      const initial = await listInitialMessages(supabase, lessonId, { peerLimit: PEER_LIMIT });
      if (cancelled.current) return;
      const peerCount = initial.filter((m) => !m.is_seeded).length;
      setMessages(initial);
      setHasOlder(peerCount === PEER_LIMIT);
      setIsLoading(false);
    })();

    // 2. Channel subscription for live INSERTs.
    type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
    const channel = supabase
      .channel(`lesson-chat-${lessonId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `lesson_id=eq.${lessonId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          void fetchAndUpsert(row.id);
        },
      )
      .subscribe((status, err) => {
        // surface for debugging only; reconnect detection lives at socket level
        if (status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR && err) {
          console.error("[chat] channel error:", err);
        }
      });

    // 3. Reconnect detection via browser-native online/offline events.
    //    Note: supabase-js v2's RealtimeClient does NOT expose
    //    onOpen/onClose/onError (only connect/disconnect/connectionState).
    //    The per-channel `.subscribe(status)` callback's auto-rejoin
    //    behavior is also documented as flaky (supabase-js #1473).
    //    `window.online`/`offline` events are the most reliable signal:
    //    they fire whenever the browser's network stack flips between
    //    connected and disconnected, independent of WebSocket internals.
    const handleOffline = () => {
      wasDisconnected.current = true;
    };
    const handleOnline = () => {
      if (!wasDisconnected.current) return;
      wasDisconnected.current = false;
      setIsReconnecting(true);
      void refetchAndMerge().then(() => {
        if (!cancelled.current) setIsReconnecting(false);
      });
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      cancelled.current = true;
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      void supabase.removeChannel(channel);
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

  return { messages, isLoading, error, hasOlder, isLoadingOlder, loadOlder, isReconnecting };
}
