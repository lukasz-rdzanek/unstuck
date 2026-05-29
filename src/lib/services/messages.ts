/**
 * Read + write helpers for the lesson-chat panel.
 *
 * Initial fetch is two queries per plan-review F1 — chat UX needs the NEWEST
 * peers visible by default (not oldest), so we fetch all seeds + last N peers
 * separately and concatenate. Single-query `ORDER BY is_seeded DESC,
 * created_at ASC LIMIT 50` would return oldest peers (wrong for chat).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import type { LessonChatMessage, NewMessage } from "@/types";

type ChatSupabaseClient = SupabaseClient<Database>;

const EMBED_AUTHOR = "*, author:profiles!messages_author_id_fkey(id, display_name)";

const DEFAULT_PEER_LIMIT = 50;

export async function listInitialMessages(
  supabase: ChatSupabaseClient,
  lessonId: string,
  opts?: { peerLimit?: number },
): Promise<LessonChatMessage[]> {
  const peerLimit = opts?.peerLimit ?? DEFAULT_PEER_LIMIT;

  const [seedsRes, peersRes] = await Promise.all([
    supabase
      .from("messages")
      .select(EMBED_AUTHOR)
      .eq("lesson_id", lessonId)
      .eq("is_seeded", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("messages")
      .select(EMBED_AUTHOR)
      .eq("lesson_id", lessonId)
      .eq("is_seeded", false)
      .order("created_at", { ascending: false })
      .limit(peerLimit),
  ]);

  if (seedsRes.error) {
    console.error("[messages] listInitialMessages seeds failed:", seedsRes.error.message);
    return [];
  }
  if (peersRes.error) {
    console.error("[messages] listInitialMessages peers failed:", peersRes.error.message);
    return [];
  }

  const seeds = seedsRes.data as unknown as LessonChatMessage[];
  // Peers came back DESC; reverse to ASC for chronological display.
  const peersAsc = (peersRes.data as unknown as LessonChatMessage[]).slice().reverse();

  return [...seeds, ...peersAsc];
}

export async function listOlderPeers(
  supabase: ChatSupabaseClient,
  lessonId: string,
  before: string,
  opts?: { limit?: number },
): Promise<LessonChatMessage[]> {
  const limit = opts?.limit ?? DEFAULT_PEER_LIMIT;

  const { data, error } = await supabase
    .from("messages")
    .select(EMBED_AUTHOR)
    .eq("lesson_id", lessonId)
    .eq("is_seeded", false)
    .lt("created_at", before)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[messages] listOlderPeers failed:", error.message);
    return [];
  }

  // DESC → reverse to ASC for chronological prepend.
  return (data as unknown as LessonChatMessage[]).slice().reverse();
}

export interface InsertMessageResult {
  data: LessonChatMessage | null;
  error: { message: string; code?: string } | null;
}

export async function insertMessage(supabase: ChatSupabaseClient, msg: NewMessage): Promise<InsertMessageResult> {
  // author_id is NOT in the request: RLS INSERT policy enforces
  // `author_id = auth.uid()` server-side via WITH CHECK; we let the
  // database fill it from the session.
  const { data, error } = await supabase
    .from("messages")
    .insert({ lesson_id: msg.lesson_id, body: msg.body })
    .select(EMBED_AUTHOR)
    .single();

  if (error) {
    return { data: null, error: { message: error.message, code: error.code } };
  }
  return { data: data as unknown as LessonChatMessage, error: null };
}
