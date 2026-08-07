import type {
  MapEntry,
  MapEntryWithProfile,
  Profile,
  StoryRouteItemWithEntry,
} from "@/types/database";

export const LIFE_PATH_PAGE_SIZE = 200;

export type LifePathSummary = {
  public_story_count: number;
  earliest_year: number | null;
  latest_year: number | null;
  distinct_place_count: number;
  first_time_label: string | null;
  last_time_label: string | null;
};

export function formatLifePathSpan(summary: LifePathSummary) {
  if (!summary.public_story_count) return "尚未开始";
  if (summary.earliest_year !== null && summary.latest_year !== null) {
    return summary.earliest_year === summary.latest_year
      ? `${summary.earliest_year} 年`
      : `${summary.earliest_year}–${summary.latest_year}`;
  }
  if (summary.first_time_label && summary.last_time_label) {
    return summary.first_time_label === summary.last_time_label
      ? summary.first_time_label
      : `${summary.first_time_label} 至 ${summary.last_time_label}`;
  }
  return summary.first_time_label ?? summary.last_time_label ?? "时间未定";
}

export function toLifePathRouteItems(
  entries: MapEntry[],
  profile: Profile,
): StoryRouteItemWithEntry[] {
  return entries.map((entry, index) => ({
    id: `life-path-${entry.id}`,
    route_id: "life-path",
    entry_id: entry.id,
    position: index + 1,
    note: "",
    relation_type: "normal",
    created_at: entry.created_at,
    map_entries: {
      ...entry,
      profiles: {
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
      },
    } satisfies MapEntryWithProfile,
  }));
}
