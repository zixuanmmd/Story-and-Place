import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { FeedEntry } from "@/types/database";

export const FEED_PAGE_SIZE = 20;

export function toFeedPage(rows: FeedEntry[], pageSize = FEED_PAGE_SIZE) {
  return {
    entries: rows.slice(0, pageSize),
    hasMore: rows.length > pageSize,
  };
}

export async function listFeed(cursor?: { createdAt: string; id: string }) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_social_feed_v11", {
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: FEED_PAGE_SIZE + 1,
  });
  if (error) throw error;
  const rows = data as FeedEntry[];
  return toFeedPage(rows);
}
