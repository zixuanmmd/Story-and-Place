import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ExploreCategory } from "@/lib/explore/categories";
import { mergeUniqueById } from "@/lib/data/keyset-pagination";
import type { MapEntry, MapEntryWithProfile } from "@/types/database";

export const EXPLORE_PAGE_SIZE = 20;
export const FEATURED_EXPLORE_LIMIT = 6;

const EXPLORE_ENTRY_SELECT = `
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

export type ExploreCursor = {
  createdAt: string;
  id: string;
};

export function toExplorePage<T>(rows: T[], pageSize = EXPLORE_PAGE_SIZE) {
  return {
    rows: rows.slice(0, pageSize),
    hasMore: rows.length > pageSize,
  };
}

export async function listPublicExploreEntries(
  category: ExploreCategory,
  cursor?: ExploreCursor,
) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_public_explore_entries", {
    p_category: category,
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: EXPLORE_PAGE_SIZE + 1,
  });
  if (error) throw error;

  const page = toExplorePage((data ?? []) as MapEntry[]);
  const ids = page.rows.map((entry) => entry.id);
  const last = page.rows.at(-1);
  const nextCursor = last ? { createdAt: last.created_at, id: last.id } : null;
  if (!ids.length) {
    return { entries: [], hasMore: page.hasMore, nextCursor };
  }

  const hydrated = await supabase
    .from("map_entries")
    .select(EXPLORE_ENTRY_SELECT)
    .in("id", ids)
    .eq("visibility", "public");
  if (hydrated.error) throw hydrated.error;

  const byId = new Map(
    (hydrated.data as MapEntryWithProfile[]).map((entry) => [entry.id, entry]),
  );
  return {
    entries: ids
      .map((id) => byId.get(id))
      .filter((entry): entry is MapEntryWithProfile => Boolean(entry)),
    hasMore: page.hasMore,
    nextCursor,
  };
}

export async function listFeaturedPublicEntries(
  limit = FEATURED_EXPLORE_LIMIT,
) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_featured_public_entries", {
    p_limit: limit,
  });
  if (error) throw error;

  const ids = ((data ?? []) as MapEntry[]).map((entry) => entry.id);
  if (!ids.length) return [];

  const hydrated = await supabase
    .from("map_entries")
    .select(EXPLORE_ENTRY_SELECT)
    .in("id", ids)
    .eq("visibility", "public");
  if (hydrated.error) throw hydrated.error;

  const byId = new Map(
    (hydrated.data as MapEntryWithProfile[]).map((entry) => [entry.id, entry]),
  );
  return ids
    .map((id) => byId.get(id))
    .filter((entry): entry is MapEntryWithProfile => Boolean(entry));
}

export function mergeExploreEntries(
  current: readonly MapEntryWithProfile[],
  incoming: readonly MapEntryWithProfile[],
) {
  return mergeUniqueById(current, incoming);
}
