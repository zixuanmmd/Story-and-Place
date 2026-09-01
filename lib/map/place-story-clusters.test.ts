import { describe, expect, it } from "vitest";
import type { MapEntryWithProfile } from "@/types/database";
import {
  clusterEntriesByPlace,
  distanceBetweenCoordinates,
  normalizePlaceName,
  sortPlaceStories,
} from "./place-story-clusters";
import { DEFAULT_ENTRY_FILTERS, filterEntries } from "@/lib/data/filters";
import {
  DEFAULT_TIME_PLAYBACK_STATE,
  filterEntriesForTimePlayback,
} from "@/lib/map/time-playback";

function entry(
  id: string,
  overrides: Partial<MapEntryWithProfile> = {},
): MapEntryWithProfile {
  return {
    id,
    user_id: "owner-a",
    title: id,
    content: "故事",
    place_name: "人民公园",
    latitude: 30.6633,
    longitude: 104.0528,
    occurred_at: null,
    occurred_local: null,
    occurred_timezone: null,
    occurred_date: null,
    occurred_year: 2020,
    time_precision: "year",
    time_label: "2020 年",
    visibility: "public",
    group_id: null,
    place_category_slug: "nature",
    allow_comments: true,
    unlock_at: null,
    featured_at: null,
    moderation_status: "active",
    moderated_at: null,
    moderated_by: null,
    moderation_reason: "",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    profiles: { display_name: "山音", avatar_url: null },
    ...overrides,
  };
}

describe("same-place story clusters", () => {
  it("规范化全角、空白、标点和英文大小写", () => {
    expect(normalizePlaceName("  People’s Park（东门） "))
      .toBe(normalizePlaceName("people’s park 东门"));
    expect(normalizePlaceName(" 人民 公园 ")).toBe("人民公园");
  });

  it("只合并名称一致且相距不超过 60 米的故事", () => {
    const result = clusterEntriesByPlace([
      entry("a", { place_name: "人民公园" }),
      entry("b", { place_name: " 人民公园。", latitude: 30.6635 }),
      entry("far", { place_name: "人民公园", latitude: 30.6645 }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((cluster) => cluster.entries.map(({ id }) => id)))
      .toContainEqual(["a", "b"]);
    expect(result.map((cluster) => cluster.entries.map(({ id }) => id)))
      .toContainEqual(["far"]);
  });

  it("相同坐标但名称不同的相邻地点不会被误合并", () => {
    const result = clusterEntriesByPlace([
      entry("park", { place_name: "人民公园" }),
      entry("station", { place_name: "人民公园地铁站" }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("无地点名时只合并几乎相同的坐标", () => {
    const result = clusterEntriesByPlace([
      entry("a", { place_name: null }),
      entry("b", { place_name: null, latitude: 30.66331 }),
      entry("c", { place_name: null, latitude: 30.6634 }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.some((cluster) => cluster.entries.length === 2)).toBe(true);
  });

  it("正确计算跨国际日期变更线的近距离", () => {
    const distance = distanceBetweenCoordinates(
      entry("east", { latitude: 0, longitude: 179.9999 }),
      entry("west", { latitude: 0, longitude: -179.9999 }),
    );
    expect(distance).toBeLessThan(25);
  });

  it("地点故事按事件时间升序排列，并把时间未定放在最后", () => {
    expect(sortPlaceStories([
      entry("undated", {
        occurred_year: null,
        time_precision: "approximate",
        time_label: "童年时期",
      }),
      entry("recent", { occurred_year: 2023, time_label: "2023 年" }),
      entry("old", { occurred_year: 1998, time_label: "1998 年" }),
    ]).map(({ id }) => id)).toEqual(["old", "recent", "undated"]);
  });

  it("聚合结果只包含传入的已授权记录，不会制造隐藏条目或数量", () => {
    const visible = entry("visible");
    const clusters = clusterEntriesByPlace([visible]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].entries).toEqual([visible]);
  });

  it("匿名聚合数量不会包含私密记录或尚未解锁的公开胶囊", () => {
    const now = new Date("2026-08-11T00:00:00Z").getTime();
    const visible = entry("visible");
    const privateEntry = entry("private", { visibility: "private" });
    const lockedPublic = entry("locked", {
      unlock_at: "2035-01-01T00:00:00Z",
    });
    const homeFiltered = filterEntries(
      [visible, privateEntry, lockedPublic],
      DEFAULT_ENTRY_FILTERS,
      null,
      null,
    );
    const playbackFiltered = filterEntriesForTimePlayback(
      homeFiltered,
      DEFAULT_TIME_PLAYBACK_STATE,
      null,
      now,
    );
    const clusters = clusterEntriesByPlace(playbackFiltered);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].entries.map(({ id }) => id)).toEqual(["visible"]);
  });
});
