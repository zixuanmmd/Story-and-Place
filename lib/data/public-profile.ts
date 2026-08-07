import { descendingTimestampFilter, mergeUniqueById } from "@/lib/data/keyset-pagination";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MapEntryWithProfile } from "@/types/database";

export const PUBLIC_PROFILE_STORY_PAGE_SIZE = 12;

const PUBLIC_PROFILE_ENTRY_SELECT = `
  *,
  profiles!map_entries_user_id_fkey(display_name, avatar_url),
  entry_tags(
    entry_id,
    tag_id,
    added_by,
    created_at,
    tags(id, name, slug, type, semantic_key)
  )
`;

export type PublicProfileStoryCursor = {
  createdAt: string;
  id: string;
};

export function toPublicProfileStoryPage<T>(
  rows: readonly T[],
  pageSize = PUBLIC_PROFILE_STORY_PAGE_SIZE,
) {
  return {
    rows: rows.slice(0, pageSize),
    hasMore: rows.length > pageSize,
  };
}

export function mergePublicProfileStories(
  current: readonly MapEntryWithProfile[],
  incoming: readonly MapEntryWithProfile[],
) {
  return mergeUniqueById(current, incoming);
}

export async function listPublicProfileStories(
  profileId: string,
  cursor?: PublicProfileStoryCursor,
) {
  const supabase = getSupabaseBrowserClient();
  const now = new Date().toISOString();
  let query = supabase
    .from("map_entries")
    .select(PUBLIC_PROFILE_ENTRY_SELECT)
    .eq("user_id", profileId)
    .eq("visibility", "public")
    .or(`unlock_at.is.null,unlock_at.lte.${now}`)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PUBLIC_PROFILE_STORY_PAGE_SIZE + 1);

  if (cursor) {
    query = query.or(descendingTimestampFilter("created_at", "id", {
      timestamp: cursor.createdAt,
      id: cursor.id,
    }));
  }

  const { data, error } = await query;
  if (error) throw error;

  const page = toPublicProfileStoryPage(data as MapEntryWithProfile[]);
  const last = page.rows.at(-1);
  return {
    entries: page.rows,
    hasMore: page.hasMore,
    nextCursor: last ? { createdAt: last.created_at, id: last.id } : null,
  };
}
