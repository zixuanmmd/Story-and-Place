import { describe, expect, it } from "vitest";
import type { MapEntryWithProfile } from "@/types/database";
import {
  DEFAULT_TIME_PLAYBACK_STATE,
  filterEntriesForTimePlayback,
  getEntryPlaybackYear,
  getTimePlaybackBounds,
  getTimePlaybackYears,
  normalizeTimePlaybackState,
} from "./time-playback";

function entry(
  id: string,
  overrides: Partial<MapEntryWithProfile> = {},
): MapEntryWithProfile {
  return {
    id,
    user_id: "owner-a",
    title: id,
    content: "故事",
    place_name: "地点",
    latitude: 30,
    longitude: 104,
    occurred_at: null,
    occurred_local: null,
    occurred_timezone: null,
    occurred_date: null,
    occurred_year: null,
    time_precision: "approximate",
    time_label: "时间未定",
    visibility: "public",
    group_id: null,
    place_category_slug: "other",
    allow_comments: true,
    unlock_at: null,
    featured_at: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    profiles: { display_name: "山音", avatar_url: null },
    ...overrides,
  };
}

describe("map time playback", () => {
  it("从不同精度字段和大致时间中稳定提取年份", () => {
    expect(getEntryPlaybackYear(entry("year", { occurred_year: 1998 }))).toBe(1998);
    expect(getEntryPlaybackYear(entry("local", {
      occurred_local: "2008-06-01T09:30",
      time_precision: "exact",
    }))).toBe(2008);
    expect(getEntryPlaybackYear(entry("date", {
      occurred_date: "2023-01-02",
      time_precision: "date",
    }))).toBe(2023);
    expect(getEntryPlaybackYear(entry("approx", { time_label: "2012 年夏天" }))).toBe(2012);
    expect(getEntryPlaybackYear(entry("undated", { time_label: "童年时期" }))).toBeNull();
  });

  it("计算有数据的年份边界并规范化反向范围", () => {
    const bounds = getTimePlaybackBounds([
      entry("a", { occurred_year: 1998 }),
      entry("b", { occurred_year: 2023 }),
      entry("c"),
    ]);
    expect(bounds).toEqual({ minYear: 1998, maxYear: 2023 });
    expect(getTimePlaybackYears([
      entry("a", { occurred_year: 2023 }),
      entry("b", { occurred_year: 1998 }),
      entry("c", { occurred_year: 2023 }),
    ])).toEqual([1998, 2023]);
    expect(normalizeTimePlaybackState({
      mode: "range",
      year: 2099,
      startYear: 2020,
      endYear: 2000,
    }, bounds!)).toEqual({
      mode: "range",
      year: 2023,
      startYear: 2000,
      endYear: 2020,
    });
  });

  it("全部、单年份和时间范围模式按预期筛选，无时间仅留在全部模式", () => {
    const entries = [
      entry("1998", { occurred_year: 1998 }),
      entry("2008", { occurred_year: 2008 }),
      entry("2023", { occurred_year: 2023 }),
      entry("undated"),
    ];
    expect(filterEntriesForTimePlayback(
      entries,
      DEFAULT_TIME_PLAYBACK_STATE,
      null,
    ).map(({ id }) => id)).toEqual(["1998", "2008", "2023", "undated"]);
    expect(filterEntriesForTimePlayback(entries, {
      mode: "year",
      year: 2008,
      startYear: null,
      endYear: null,
    }, null).map(({ id }) => id)).toEqual(["2008"]);
    expect(filterEntriesForTimePlayback(entries, {
      mode: "range",
      year: null,
      startYear: 2000,
      endYear: 2020,
    }, null).map(({ id }) => id)).toEqual(["2008"]);
  });

  it("未解锁胶囊不会因残留数据泄露给匿名、普通用户或共同经历者", () => {
    const future = entry("future", {
      user_id: "owner-a",
      visibility: "private",
      occurred_year: 2035,
      unlock_at: "2035-01-01T00:00:00Z",
    });
    const state = { ...DEFAULT_TIME_PLAYBACK_STATE, mode: "year" as const, year: 2035 };
    const now = new Date("2026-08-11T00:00:00Z").getTime();
    expect(filterEntriesForTimePlayback([future], state, null, now)).toEqual([]);
    expect(filterEntriesForTimePlayback([future], state, "user-b", now)).toEqual([]);
    expect(filterEntriesForTimePlayback([future], state, "participant-b", now)).toEqual([]);
    expect(filterEntriesForTimePlayback([future], state, "owner-a", now)).toEqual([future]);
  });

  it("群组权限变化后的输入为空时不会制造聚合数量", () => {
    const groupEntry = entry("group", {
      user_id: "owner-a",
      visibility: "group",
      group_id: "group-a",
      occurred_year: 2020,
    });
    expect(filterEntriesForTimePlayback([], DEFAULT_TIME_PLAYBACK_STATE, "former-member"))
      .toEqual([]);
    expect(filterEntriesForTimePlayback(
      [groupEntry],
      { ...DEFAULT_TIME_PLAYBACK_STATE, mode: "range", startYear: 2019, endYear: 2021 },
      "member-b",
    )).toEqual([groupEntry]);
  });
});
