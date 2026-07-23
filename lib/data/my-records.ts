import type { EntryVisibility, MapEntryWithProfile } from "@/types/database";

export type MineFilter = "all" | EntryVisibility;
export type MineSort = "updated" | "occurred";

export function occurredSortValue(entry: MapEntryWithProfile) {
  if (entry.occurred_local) {
    const compact = entry.occurred_local.replace(/[-T:]/g, "").slice(0, 12);
    const value = Number(compact);
    if (Number.isFinite(value)) return value;
  }
  if (entry.occurred_date) {
    const value = Number(entry.occurred_date.replaceAll("-", "")) * 10_000;
    if (Number.isFinite(value)) return value;
  }
  if (entry.occurred_year) return entry.occurred_year * 100_000_000;
  if (entry.occurred_at) return new Date(entry.occurred_at).getTime();
  return Number.NEGATIVE_INFINITY;
}

export function filterAndSortMyEntries(
  entries: MapEntryWithProfile[],
  keyword: string,
  visibility: MineFilter,
  sort: MineSort,
) {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase("zh-CN");
  return entries
    .filter((entry) => visibility === "all" || entry.visibility === visibility)
    .filter((entry) => {
      if (!normalizedKeyword) return true;
      return [entry.title, entry.content, entry.place_name, entry.time_label]
        .filter(Boolean)
        .join("\n")
        .toLocaleLowerCase("zh-CN")
        .includes(normalizedKeyword);
    })
    .toSorted((left, right) =>
      sort === "updated"
        ? new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
        : occurredSortValue(right) - occurredSortValue(left),
    );
}
