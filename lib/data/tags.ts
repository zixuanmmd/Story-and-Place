import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  MapEntry,
  MapEntryWithProfile,
  Profile,
  Tag,
} from "@/types/database";

export const TAG_PAGE_SIZE = 50;

export type VisibleTagSummary = Pick<Tag, "slug" | "name"> & {
  entry_count: number;
};

export async function getVisibleTagSummary(slug: string) {
  const { data, error } = await getSupabaseBrowserClient().rpc(
    "get_visible_tag_summary",
    { p_tag_slug: slug },
  );
  if (error) throw error;
  return (data[0] ?? null) as VisibleTagSummary | null;
}

export async function listEntriesByTag(slug: string, page = 0) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_tag_entries", {
    p_tag_slug: slug,
    p_offset: page * TAG_PAGE_SIZE,
    p_limit: TAG_PAGE_SIZE + 1,
  });
  if (error) throw error;
  const rows = data as unknown as MapEntry[];
  const visibleRows = rows.slice(0, TAG_PAGE_SIZE);
  const authorIds = [...new Set(visibleRows.map((entry) => entry.user_id))];
  const entryIds = visibleRows.map((entry) => entry.id);

  const [profilesResult, tagsResult] = await Promise.all([
    authorIds.length
      ? supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", authorIds)
      : Promise.resolve({ data: [], error: null }),
    entryIds.length
      ? supabase
          .from("entry_tags")
          .select("entry_id, tag_id, added_by, created_at, tags(id, name, slug)")
          .in("entry_id", entryIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (tagsResult.error) throw tagsResult.error;

  const profileById = new Map(
    (profilesResult.data as Array<
      Pick<Profile, "id" | "display_name" | "avatar_url">
    >).map((profile) => [profile.id, profile]),
  );
  const tagsByEntry = new Map<string, typeof tagsResult.data>();
  for (const entryTag of tagsResult.data) {
    const current = tagsByEntry.get(entryTag.entry_id) ?? [];
    current.push(entryTag);
    tagsByEntry.set(entryTag.entry_id, current);
  }
  return {
    entries: visibleRows.map((entry) => ({
      ...entry,
      profiles: profileById.get(entry.user_id) ?? null,
      entry_tags: tagsByEntry.get(entry.id) ?? [],
    })) as unknown as MapEntryWithProfile[],
    hasMore: rows.length > TAG_PAGE_SIZE,
  };
}
