import { sortTimelineEntries } from "@/lib/timeline/timeline";
import type { MapEntryWithProfile } from "@/types/database";

export type OrderedRouteItem = {
  entry_id: string;
  position: number;
  note: string;
};

function normalizePositions(items: OrderedRouteItem[]) {
  return items.map((item, index) => ({ ...item, position: index + 1 }));
}

export function moveRouteItem(
  items: OrderedRouteItem[],
  from: number,
  to: number,
) {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) {
    return normalizePositions(items);
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return normalizePositions(next);
}

export function sortRouteItems(
  items: OrderedRouteItem[],
  entries: MapEntryWithProfile[],
  mode: "event-time" | "created-time",
) {
  const itemByEntry = new Map(items.map((item) => [item.entry_id, item]));
  const selectedEntries = entries.filter((entry) => itemByEntry.has(entry.id));
  const sortedEntries = mode === "event-time"
    ? sortTimelineEntries(selectedEntries, "asc")
    : [...selectedEntries].sort((left, right) =>
        left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
  const knownIds = new Set(sortedEntries.map((entry) => entry.id));
  const unavailable = items.filter((item) => !knownIds.has(item.entry_id));
  return normalizePositions([
    ...sortedEntries.map((entry) => itemByEntry.get(entry.id)).filter((item): item is OrderedRouteItem => Boolean(item)),
    ...unavailable,
  ]);
}
