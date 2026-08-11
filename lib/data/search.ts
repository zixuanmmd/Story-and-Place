import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  globalSearchFiltersSchema,
  globalSearchResultSchema,
  type GlobalSearchFilters,
} from "@/lib/validation/search";
import type { GlobalSearchResult } from "@/types/database";

export const GLOBAL_SEARCH_PAGE_SIZE = 20;

export type GlobalSearchPage = {
  results: GlobalSearchResult[];
  totalCount: number;
  hasMore: boolean;
};

export async function searchStoryAndPlace(
  rawFilters: GlobalSearchFilters,
  page = 0,
): Promise<GlobalSearchPage> {
  const filters = globalSearchFiltersSchema.parse(rawFilters);
  const safePage = Math.max(0, Math.trunc(page));
  const { data, error } = await getSupabaseBrowserClient().rpc(
    "search_story_and_place",
    {
      p_query: filters.query,
      p_start_year: filters.startYear,
      p_end_year: filters.endYear,
      p_place: filters.place,
      p_tag: filters.tag,
      p_emotion: filters.emotion,
      p_author_id: filters.authorId,
      p_content_types: filters.contentTypes,
      p_offset: safePage * GLOBAL_SEARCH_PAGE_SIZE,
      p_limit: GLOBAL_SEARCH_PAGE_SIZE,
    },
  );
  if (error) throw error;

  const results = (data ?? []).map((result) => globalSearchResultSchema.parse(result));
  const totalCount = Number(results[0]?.total_count ?? 0);
  return {
    results,
    totalCount,
    hasMore: (safePage + 1) * GLOBAL_SEARCH_PAGE_SIZE < totalCount,
  };
}
