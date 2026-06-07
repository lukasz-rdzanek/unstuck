import { useEffect, useRef, useState, useCallback } from "react";
import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import type { LessonChatMessage } from "@/types";
import type { Database } from "@/lib/db/database.types";
import { createClientBrowser } from "@/lib/supabase-browser";
import { listInitialMessages, listOlderPeers, insertMessage } from "@/lib/services/messages";

const PEER_LIMIT = 50;
// Explicit columns (NOT `*`) so the 768-dim `embedding` vector is never pulled
// into the chat client — it's backend-only matching data, useless to the UI.
const EMBED_AUTHOR =
  "id, lesson_id, author_id, body, is_seeded, created_at, author:profiles!messages_author_id_fkey(id, display_name)";

// Window inside which a Realtime INSERT echo is dedup-matched against a
// pending optimistic bubble (same author_id + body + |Δ created_at| < this).
const DEDUP_WINDOW_MS = 5000;

// Safety net: if the Realtime echo for our own post never arrives, this is
// how long we wait after the successful insertMessage RETURNING before we
// fall back to replacing the pending bubble from the API result directly.
const PENDING_FALLBACK_MS = 10_000;

/**
 * In-memory representation of a chat row. Server-confirmed messages have
 * only the LessonChatMessage fields. Optimistic / failed posts carry
 * tempId + status until the server INSERT replaces them.
 */
export type ChatPanelMessage = LessonChatMessage & {
  tempId?: string;
  status?: "sending" | "failed";
  errorMessage?: string;
};

interface UseChatMessagesOptions {
  lessonId: string;
  userId: string | null;
  userDisplayName: string | null;
}

interface UseChatMessagesReturn {
  messages: ChatPanelMessage[];
  isLoading: boolean;
  error: string | null;
  hasOlder: boolean;
  isLoadingOlder: boolean;
  loadOlder: () => Promise<void>;
  isReconnecting: boolean;
  postMessage: (body: string) => Promise<void>;
  retryMessage: (tempId: string) => Promise<void>;
  discardMessage: (tempId: string) => void;
}

/**
 * Owns chat state for one lesson.
 *
 * Phase 1: read-only (initial fetch + load older).
 * Phase 2: + Realtime postgres_changes subscription on messages-INSERT
 *   scoped to lesson_id, dedupe by id, reconnect detection via
 *   window.online/offline + refetchAndMerge.
 * Phase 3 (this file): + optimistic post / retry / discard, dedup against
 *   own Realtime echo by (author_id, body, ±5s).
 */
export function useChatMessages({ lessonId, userId, userDisplayName }: UseChatMessagesOptions): UseChatMessagesReturn {
  const [messages, setMessages] = useState<ChatPanelMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Lazy ref init — calling createClientBrowser() inline in useRef()
  // would run the factory twice under React 19 Strict Mode (impl-review
  // F2) and leak the second client. The subscription effect populates
  // this on first run.
  const supabaseRef = useRef<ReturnType<typeof createClientBrowser>>(null);
  // Refs the post helpers read at call time so async callbacks see fresh
  // identity without forcing the subscription effect to tear down. Synced
  // via useEffect (mutating refs during render trips react-hooks rules).
  const userIdRef = useRef(userId);
  const userDisplayNameRef = useRef(userDisplayName);
  useEffect(() => {
    userIdRef.current = userId;
    userDisplayNameRef.current = userDisplayName;
  }, [userId, userDisplayName]);
  // Pending optimistic-post fallback timers — declared above submitInsert
  // (declare-before-use) and cleared inside the subscription effect's
  // cleanup so a lessonId change cancels in-flight timers, not just
  // unmount (per impl-review F1).
  const pendingTimeoutsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    supabaseRef.current ??= createClientBrowser();
    const supabase = supabaseRef.current;
    if (!supabase) {
      setError("Chat unavailable — Supabase not configured");
      setIsLoading(false);
      return;
    }

    const cancelled = { current: false };
    const wasDisconnected = { current: false };

    // Dedupe-aware upsert. Order of checks:
    //   1. Already in state by `id` → ignore (Realtime echoes are idempotent).
    //   2. Own message? Look for a matching pending bubble in the
    //      (author_id, body, ±DEDUP_WINDOW_MS) neighborhood → replace it.
    //   3. Otherwise → append at the end.
    const upsertMessage = (msg: LessonChatMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;

        const ownerId = userIdRef.current;
        if (ownerId && msg.author?.id === ownerId) {
          const arrivalTs = new Date(msg.created_at).getTime();
          const pendingIdx = prev.findIndex(
            (p) =>
              p.status === "sending" &&
              p.author?.id === ownerId &&
              p.body === msg.body &&
              Math.abs(new Date(p.created_at).getTime() - arrivalTs) < DEDUP_WINDOW_MS,
          );
          if (pendingIdx >= 0) {
            const next = prev.slice();
            next[pendingIdx] = msg;
            return next;
          }
        }

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
    // state (upsert by id). Pending bubbles are preserved (no id match in
    // fresh fetch), then their own Realtime echo eventually replaces them
    // via upsertMessage's dedup window.
    const refetchAndMerge = async () => {
      const fresh = await listInitialMessages(supabase, lessonId, { peerLimit: PEER_LIMIT });
      if (cancelled.current) return;
      setMessages((prev) => {
        const byId = new Map<string, ChatPanelMessage>(prev.map((m) => [m.id, m]));
        for (const msg of fresh) byId.set(msg.id, msg);
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
        if (status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR && err) {
          console.error("[chat] channel error:", err);
        }
      });

    // 3. Reconnect detection via browser-native online/offline events.
    //    See Phase 2 commit body for the supabase-js v2 RealtimeClient
    //    API gap that this works around.
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
      // Cancel any optimistic-post fallback timers from THIS lesson —
      // they reference tempIds that won't match anything in the next
      // lesson's state. Clearing here (not in a separate []-deps
      // effect) means a lesson-switch cancels in-flight timers too.
      for (const id of pendingTimeoutsRef.current) window.clearTimeout(id);
      pendingTimeoutsRef.current.clear();
    };
  }, [lessonId]);

  const loadOlder = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase || isLoadingOlder) return;

    const earliestPeer = messages.find((m) => !m.is_seeded);
    if (!earliestPeer) return;

    setIsLoadingOlder(true);
    const older = await listOlderPeers(supabase, lessonId, earliestPeer.created_at, { limit: PEER_LIMIT });

    setMessages((prev) => {
      const seeds = prev.filter((m) => m.is_seeded);
      const existingPeers = prev.filter((m) => !m.is_seeded);
      const olderById = new Set(older.map((m) => m.id));
      const dedupedExisting = existingPeers.filter((m) => !olderById.has(m.id));
      return [...seeds, ...older, ...dedupedExisting];
    });
    setHasOlder(older.length === PEER_LIMIT);
    setIsLoadingOlder(false);
  }, [lessonId, messages, isLoadingOlder]);

  // Internal helper: fires the actual INSERT, handles success/failure for
  // both postMessage (fresh) and retryMessage (already-failed pending).
  const submitInsert = useCallback(
    async (tempId: string, body: string) => {
      const supabase = supabaseRef.current;
      if (!supabase) return;
      const ownerId = userIdRef.current;
      if (!ownerId) {
        setMessages((prev) =>
          prev.map((m) => (m.tempId === tempId ? { ...m, status: "failed", errorMessage: "Not signed in" } : m)),
        );
        return;
      }

      const { data, error: insertErr } = await insertMessage(supabase, { lesson_id: lessonId, body }, ownerId);

      if (insertErr || !data) {
        setMessages((prev) =>
          prev.map((m) =>
            m.tempId === tempId ? { ...m, status: "failed", errorMessage: insertErr?.message ?? "Unknown error" } : m,
          ),
        );
        return;
      }

      // Schedule a fallback replacement in case Realtime echo never arrives:
      // after PENDING_FALLBACK_MS, if the pending bubble is still in state
      // (status: sending), replace it from the INSERT RETURNING data.
      const fallback = window.setTimeout(() => {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.tempId === tempId && m.status === "sending");
          if (idx < 0) return prev;
          const next = prev.slice();
          next[idx] = data;
          return next;
        });
      }, PENDING_FALLBACK_MS);

      // Track timeout id so unmount doesn't leak.
      pendingTimeoutsRef.current.add(fallback);
    },
    [lessonId],
  );

  const postMessage = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return;
      const ownerId = userIdRef.current;
      if (!ownerId) return;

      const tempId = crypto.randomUUID();
      const optimistic: ChatPanelMessage = {
        id: tempId,
        tempId,
        lesson_id: lessonId,
        author_id: ownerId,
        body: trimmed,
        is_seeded: false,
        created_at: new Date().toISOString(),
        author: userDisplayNameRef.current ? { id: ownerId, display_name: userDisplayNameRef.current } : null,
        status: "sending",
      };
      setMessages((prev) => [...prev, optimistic]);

      await submitInsert(tempId, trimmed);
    },
    [lessonId, submitInsert],
  );

  const retryMessage = useCallback(
    async (tempId: string) => {
      let body: string | undefined;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.tempId === tempId && m.status === "failed") {
            body = m.body;
            return { ...m, status: "sending", errorMessage: undefined };
          }
          return m;
        }),
      );
      if (!body) return;
      await submitInsert(tempId, body);
    },
    [submitInsert],
  );

  const discardMessage = useCallback((tempId: string) => {
    setMessages((prev) => prev.filter((m) => m.tempId !== tempId));
  }, []);

  return {
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
  };
}
