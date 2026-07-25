import { z } from "zod";
import type {
  EntryVisibility,
  MapEntryWithProfile,
  PlaceCategorySlug,
} from "@/types/database";

export type TimelineOrder = "asc" | "desc";

export type TimelineFilters = {
  keyword: string;
  visibility: EntryVisibility | "all";
  categories: PlaceCategorySlug[];
  authorId: string;
  startYear: number | null;
  endYear: number | null;
  includeUndated: boolean;
  order: TimelineOrder;
};

export const DEFAULT_TIMELINE_FILTERS: TimelineFilters = {
  keyword: "",
  visibility: "all",
  categories: [],
  authorId: "",
  startYear: null,
  endYear: null,
  includeUndated: true,
  order: "desc",
};

const timelineQuerySchema = z.object({
  q: z.string().max(100).catch(""),
  visibility: z.enum(["all", "public", "private", "group"]).catch("all"),
  categories: z.string().max(300).catch(""),
  author: z.string().uuid().or(z.literal("")).catch(""),
  start: z.coerce.number().int().min(1).max(9999).nullable().catch(null),
  end: z.coerce.number().int().min(1).max(9999).nullable().catch(null),
  undated: z.enum(["0", "1"]).catch("1"),
  order: z.enum(["asc", "desc"]).catch("desc"),
});

const CATEGORY_SET = new Set<PlaceCategorySlug>([
  "home", "school", "work", "food", "transport", "street",
  "nature", "landmark", "medical", "travel", "memorial", "other",
]);

export function parseTimelineSearchParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): TimelineFilters {
  const read = (key: string) => {
    if (params instanceof URLSearchParams) return params.get(key) ?? "";
    const value = params[key];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
  };
  const parsed = timelineQuerySchema.parse({
    q: read("q"),
    visibility: read("visibility"),
    categories: read("categories"),
    author: read("author"),
    start: read("start") || null,
    end: read("end") || null,
    undated: read("undated") || "1",
    order: read("order"),
  });
  return {
    keyword: parsed.q,
    visibility: parsed.visibility,
    categories: parsed.categories
      .split(",")
      .filter((value): value is PlaceCategorySlug =>
        CATEGORY_SET.has(value as PlaceCategorySlug)),
    authorId: parsed.author,
    startYear: parsed.start,
    endYear: parsed.end,
    includeUndated: parsed.undated === "1",
    order: parsed.order,
  };
}

export function getTimelineYear(entry: MapEntryWithProfile): number | null {
  if (entry.occurred_year) return entry.occurred_year;
  if (entry.time_precision !== "approximate") return null;
  const match = entry.time_label.match(/(?:^|\D)([1-9]\d{3})(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

function localSortToken(entry: MapEntryWithProfile) {
  if (entry.occurred_local) return entry.occurred_local;
  if (entry.occurred_date) return `${entry.occurred_date}T00:00`;
  const year = getTimelineYear(entry);
  return year ? `${String(year).padStart(4, "0")}-99-99T99:99` : "";
}

export function sortTimelineEntries(
  entries: MapEntryWithProfile[],
  order: TimelineOrder,
) {
  return [...entries].sort((left, right) => {
    const leftYear = getTimelineYear(left);
    const rightYear = getTimelineYear(right);
    if (leftYear === null && rightYear !== null) return 1;
    if (leftYear !== null && rightYear === null) return -1;
    if (leftYear !== null && rightYear !== null && leftYear !== rightYear) {
      return order === "asc" ? leftYear - rightYear : rightYear - leftYear;
    }
    const localComparison = localSortToken(left).localeCompare(localSortToken(right));
    if (localComparison) return order === "asc" ? localComparison : -localComparison;
    const createdComparison = left.created_at.localeCompare(right.created_at);
    if (createdComparison) return order === "asc" ? createdComparison : -createdComparison;
    return left.id.localeCompare(right.id);
  });
}

export function filterTimelineEntries(
  entries: MapEntryWithProfile[],
  filters: TimelineFilters,
) {
  const keyword = filters.keyword.trim().toLocaleLowerCase("zh-CN");
  return sortTimelineEntries(entries.filter((entry) => {
    const year = getTimelineYear(entry);
    if (!filters.includeUndated && year === null) return false;
    if (filters.visibility !== "all" && entry.visibility !== filters.visibility) return false;
    if (filters.categories.length && !filters.categories.includes(entry.place_category_slug)) return false;
    if (filters.authorId && entry.user_id !== filters.authorId) return false;
    if (filters.startYear !== null && (year === null || year < filters.startYear)) return false;
    if (filters.endYear !== null && (year === null || year > filters.endYear)) return false;
    if (!keyword) return true;
    return [
      entry.title,
      entry.content,
      entry.place_name,
      entry.time_label,
      entry.profiles?.display_name,
    ].filter(Boolean).join("\n").toLocaleLowerCase("zh-CN").includes(keyword);
  }), filters.order);
}

export type TimelineGroup = {
  key: string;
  label: string;
  entries: MapEntryWithProfile[];
};

export function groupTimelineEntries(entries: MapEntryWithProfile[]): TimelineGroup[] {
  const groups = new Map<string, MapEntryWithProfile[]>();
  for (const entry of entries) {
    const year = getTimelineYear(entry);
    const key = year === null ? "undated" : String(year);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups].map(([key, groupedEntries]) => ({
    key,
    label: key === "undated" ? "时间未定" : `${key} 年`,
    entries: groupedEntries,
  }));
}
