import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MapEntry, MapEntryWithProfile } from "@/types/database";
import type { TimelineFilters } from "@/lib/timeline/timeline";

export const TIMELINE_PAGE_SIZE = 50;

export type TimelineScope =
  | { kind: "mine"; userId: string }
  | { kind: "user"; userId: string }
  | { kind: "group"; groupId: string };

export async function listTimelineEntries(
  scope: TimelineScope,
  page: number,
  filters: TimelineFilters,
) {
  const supabase = getSupabaseBrowserClient();
  const targetId = scope.kind === "group" ? scope.groupId : scope.userId;
  const { data, error } = await supabase.rpc("get_timeline_entries", {
    p_scope: scope.kind,
    p_target_id: targetId,
    p_order: filters.order,
    p_visibility: filters.visibility === "all" ? null : filters.visibility,
    p_category_slugs: filters.categories.length ? filters.categories : null,
    p_author_id: filters.authorId || null,
    p_keyword: filters.keyword.trim() || null,
    p_start_year: filters.startYear,
    p_end_year: filters.endYear,
    p_include_undated: filters.includeUndated,
    p_offset: page * TIMELINE_PAGE_SIZE,
    p_limit: TIMELINE_PAGE_SIZE + 1,
  });
  if (error) throw error;

  const rows = data as unknown as MapEntry[];
  const authorIds = [...new Set(rows.map((entry) => entry.user_id))];
  const { data: profiles, error: profileError } = authorIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", authorIds)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const entries = rows.map((entry) => ({
    ...entry,
    profiles: profileById.get(entry.user_id) ?? null,
  })) as MapEntryWithProfile[];
  return {
    entries: entries.slice(0, TIMELINE_PAGE_SIZE),
    hasMore: entries.length > TIMELINE_PAGE_SIZE,
  };
}
