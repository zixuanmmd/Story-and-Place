import type { MapBoundsValue } from "@/types/map";
import type { MapEntryWithProfile } from "@/types/database";
import type { PlaceCategorySlug } from "@/types/database";

export type HomeVisibilityFilter = "all" | "public" | "group" | "mine" | "my-private";

export type EntryFilters = {
  visibility: HomeVisibilityFilter;
  keyword: string;
  startDate: string;
  endDate: string;
  withinMap: boolean;
  categories: PlaceCategorySlug[];
  groupId: string;
};

export const DEFAULT_ENTRY_FILTERS: EntryFilters = {
  visibility: "all",
  keyword: "",
  startDate: "",
  endDate: "",
  withinMap: false,
  categories: [],
  groupId: "",
};

function comparableDate(entry: MapEntryWithProfile) {
  if (entry.occurred_local) return entry.occurred_local.slice(0, 10);
  if (entry.occurred_at) return entry.occurred_at.slice(0, 10);
  if (entry.occurred_date) return entry.occurred_date;
  if (entry.occurred_year) return `${String(entry.occurred_year).padStart(4, "0")}-01-01`;
  return null;
}

function isInsideBounds(entry: MapEntryWithProfile, bounds: MapBoundsValue) {
  const latitudeMatches = entry.latitude >= bounds.south && entry.latitude <= bounds.north;
  const longitudeMatches =
    bounds.west <= bounds.east
      ? entry.longitude >= bounds.west && entry.longitude <= bounds.east
      : entry.longitude >= bounds.west || entry.longitude <= bounds.east;
  return latitudeMatches && longitudeMatches;
}

export function filterEntries(
  entries: MapEntryWithProfile[],
  filters: EntryFilters,
  userId: string | null,
  bounds: MapBoundsValue | null,
) {
  const keyword = filters.keyword.trim().toLocaleLowerCase("zh-CN");

  return entries.filter((entry) => {
    if (!userId && entry.visibility !== "public") return false;
    if (filters.visibility === "public" && entry.visibility !== "public") return false;
    if (filters.visibility === "group" && entry.visibility !== "group") return false;
    if (filters.visibility === "mine" && entry.user_id !== userId) return false;
    if (
      filters.visibility === "my-private" &&
      (entry.user_id !== userId || entry.visibility !== "private")
    ) {
      return false;
    }
    if (
      filters.categories.length &&
      !filters.categories.includes(entry.place_category_slug)
    ) {
      return false;
    }
    if (filters.groupId && entry.group_id !== filters.groupId) return false;

    if (keyword) {
      const haystack = [entry.title, entry.content, entry.place_name, entry.time_label]
        .filter(Boolean)
        .join("\n")
        .toLocaleLowerCase("zh-CN");
      if (!haystack.includes(keyword)) return false;
    }

    const date = comparableDate(entry);
    if (filters.startDate && (!date || date < filters.startDate)) return false;
    if (filters.endDate && (!date || date > filters.endDate)) return false;
    if (filters.withinMap && bounds && !isInsideBounds(entry, bounds)) return false;

    return true;
  });
}
