import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  LIFE_PATH_PAGE_SIZE,
  type LifePathSummary,
} from "@/lib/life-path/life-path";
import type { MapEntry } from "@/types/database";

export async function listPublicLifePathEntries(profileId: string) {
  const { data, error } = await getSupabaseBrowserClient().rpc(
    "get_public_life_path_entries",
    {
      p_profile_id: profileId,
      p_offset: 0,
      p_limit: LIFE_PATH_PAGE_SIZE + 1,
    },
  );
  if (error) throw error;
  return {
    entries: data.slice(0, LIFE_PATH_PAGE_SIZE) as MapEntry[],
    truncated: data.length > LIFE_PATH_PAGE_SIZE,
  };
}

export async function getPublicLifePathSummary(profileId: string) {
  const { data, error } = await getSupabaseBrowserClient().rpc(
    "get_public_life_path_summary",
    { p_profile_id: profileId },
  );
  if (error) throw error;
  return (data[0] ?? {
    public_story_count: 0,
    earliest_year: null,
    latest_year: null,
    distinct_place_count: 0,
    first_time_label: null,
    last_time_label: null,
  }) as LifePathSummary;
}
