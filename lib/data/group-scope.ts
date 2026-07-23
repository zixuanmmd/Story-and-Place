import type { MapEntryWithProfile } from "@/types/database";

export function filterEntriesForActiveGroups(
  entries: MapEntryWithProfile[],
  activeGroupIds: readonly string[],
) {
  const active = new Set(activeGroupIds);
  return entries.filter(
    (entry) =>
      entry.visibility !== "group" ||
      (entry.group_id !== null && active.has(entry.group_id)),
  );
}

export function canRenderGroupEntry(
  entry: Pick<MapEntryWithProfile, "visibility" | "group_id"> | null,
  activeGroupIds: readonly string[],
) {
  if (!entry || entry.visibility !== "group") return Boolean(entry);
  return entry.group_id !== null && activeGroupIds.includes(entry.group_id);
}

