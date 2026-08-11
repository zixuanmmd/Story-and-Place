import type { MapEntryWithProfile } from "@/types/database";

export type TimePlaybackMode = "all" | "year" | "range";

export type TimePlaybackState = {
  mode: TimePlaybackMode;
  year: number | null;
  startYear: number | null;
  endYear: number | null;
};

export type TimePlaybackBounds = {
  minYear: number;
  maxYear: number;
};

export const DEFAULT_TIME_PLAYBACK_STATE: TimePlaybackState = {
  mode: "all",
  year: null,
  startYear: null,
  endYear: null,
};

const YEAR_IN_LABEL = /(?:^|\D)([1-9]\d{3})(?:\D|$)/;

export function getEntryPlaybackYear(entry: MapEntryWithProfile): number | null {
  if (entry.occurred_year !== null) return entry.occurred_year;
  if (entry.occurred_local) {
    const year = Number(entry.occurred_local.slice(0, 4));
    if (Number.isInteger(year) && year >= 1 && year <= 9999) return year;
  }
  if (entry.occurred_date) {
    const year = Number(entry.occurred_date.slice(0, 4));
    if (Number.isInteger(year) && year >= 1 && year <= 9999) return year;
  }
  if (entry.occurred_at) {
    const match = entry.occurred_at.match(/^([1-9]\d{3})-/);
    if (match) return Number(match[1]);
  }
  if (entry.time_precision === "approximate") {
    const match = entry.time_label.match(YEAR_IN_LABEL);
    if (match) return Number(match[1]);
  }
  return null;
}

export function getTimePlaybackBounds(
  entries: MapEntryWithProfile[],
): TimePlaybackBounds | null {
  const years = getTimePlaybackYears(entries);
  if (!years.length) return null;
  return { minYear: years[0], maxYear: years[years.length - 1] };
}

export function getTimePlaybackYears(entries: MapEntryWithProfile[]) {
  const years = new Set<number>();
  for (const entry of entries) {
    const year = getEntryPlaybackYear(entry);
    if (year !== null) years.add(year);
  }
  return [...years].sort((left, right) => left - right);
}

function clampYear(year: number | null, bounds: TimePlaybackBounds, fallback: number) {
  if (year === null || !Number.isInteger(year)) return fallback;
  return Math.min(Math.max(year, bounds.minYear), bounds.maxYear);
}

export function normalizeTimePlaybackState(
  state: TimePlaybackState,
  bounds: TimePlaybackBounds,
): TimePlaybackState {
  const year = clampYear(state.year, bounds, bounds.maxYear);
  const first = clampYear(state.startYear, bounds, bounds.minYear);
  const second = clampYear(state.endYear, bounds, bounds.maxYear);
  return {
    mode: state.mode,
    year,
    startYear: Math.min(first, second),
    endYear: Math.max(first, second),
  };
}

function isLockedForAnotherUser(
  entry: MapEntryWithProfile,
  currentUserId: string | null,
  now: number,
) {
  if (!entry.unlock_at || entry.user_id === currentUserId) return false;
  const unlockAt = new Date(entry.unlock_at).getTime();
  return Number.isFinite(unlockAt) && unlockAt > now;
}

export function filterEntriesForTimePlayback(
  entries: MapEntryWithProfile[],
  state: TimePlaybackState,
  currentUserId: string | null,
  now = Date.now(),
) {
  const safeEntries = entries.filter(
    (entry) => !isLockedForAnotherUser(entry, currentUserId, now),
  );
  if (state.mode === "all") return safeEntries;

  const bounds = getTimePlaybackBounds(safeEntries);
  if (!bounds) return [];
  const normalized = normalizeTimePlaybackState(state, bounds);

  return safeEntries.filter((entry) => {
    const year = getEntryPlaybackYear(entry);
    if (year === null) return false;
    if (normalized.mode === "year") return year === normalized.year;
    return year >= (normalized.startYear ?? bounds.minYear)
      && year <= (normalized.endYear ?? bounds.maxYear);
  });
}
