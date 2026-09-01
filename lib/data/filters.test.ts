import { describe, expect, it } from "vitest";
import { DEFAULT_ENTRY_FILTERS, filterEntries } from "./filters";
import type { MapEntryWithProfile } from "../../types/database";

function entry(
  id: string,
  overrides: Partial<MapEntryWithProfile> = {},
): MapEntryWithProfile {
  return {
    id,
    user_id: "user-a",
    title: id,
    content: "一段故事",
    place_name: "地点",
    latitude: 0,
    longitude: 0,
    occurred_at: null,
    occurred_local: null,
    occurred_timezone: null,
    occurred_date: "2024-01-01",
    occurred_year: 2024,
    time_precision: "date",
    time_label: "2024 年 1 月 1 日",
    visibility: "public",
    group_id: null,
    place_category_slug: "other",
    allow_comments: true,
    unlock_at: null,
    featured_at: null,
    moderation_status: "active",
    moderated_at: null,
    moderated_by: null,
    moderation_reason: "",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    profiles: { display_name: "用户 A", avatar_url: null },
    ...overrides,
  };
}

describe("entry filters", () => {
  it("匿名作用域即使收到残留数据也只渲染公开记录", () => {
    const publicEntry = entry("public");
    const privateEntry = entry("private", { visibility: "private" });
    const groupEntry = entry("group", {
      visibility: "group",
      group_id: "group-a",
    });

    expect(
      filterEntries(
        [publicEntry, privateEntry, groupEntry],
        DEFAULT_ENTRY_FILTERS,
        null,
        null,
      ),
    ).toEqual([publicEntry]);
  });

  it("日期筛选优先采用事件当地日期而不是 UTC 日期", () => {
    const local = entry("local", {
      occurred_local: "2024-01-02T00:30",
      occurred_at: "2024-01-01T16:30:00Z",
      occurred_date: "2024-01-02",
      time_precision: "exact",
    });
    const result = filterEntries(
      [local],
      { ...DEFAULT_ENTRY_FILTERS, startDate: "2024-01-02" },
      null,
      null,
    );
    expect(result).toEqual([local]);
  });

  it("正确处理跨国际日期变更线的地图边界", () => {
    const east = entry("east", { longitude: 179 });
    const west = entry("west", { longitude: -179 });
    const middle = entry("middle", { longitude: 0 });
    const result = filterEntries(
      [east, west, middle],
      { ...DEFAULT_ENTRY_FILTERS, withinMap: true },
      null,
      { north: 20, south: -20, west: 170, east: -170 },
    );
    expect(result.map((item) => item.id)).toEqual(["east", "west"]);
  });

  it("关键词和仅我的私密记录筛选可以组合", () => {
    const mine = entry("mine", {
      user_id: "user-a",
      visibility: "private",
      title: "夏天",
    });
    const other = entry("other", {
      user_id: "user-b",
      visibility: "private",
      title: "夏天",
    });
    expect(
      filterEntries(
        [mine, other],
        {
          ...DEFAULT_ENTRY_FILTERS,
          visibility: "my-private",
          keyword: "夏天",
        },
        "user-a",
        null,
      ),
    ).toEqual([mine]);
  });

  it("支持多分类与群组组合筛选", () => {
    const school = entry("school", {
      visibility: "group",
      group_id: "group-a",
      place_category_slug: "school",
    });
    const nature = entry("nature", {
      visibility: "group",
      group_id: "group-a",
      place_category_slug: "nature",
    });
    const homeElsewhere = entry("home", {
      visibility: "group",
      group_id: "group-b",
      place_category_slug: "home",
    });
    expect(
      filterEntries(
        [school, nature, homeElsewhere],
        {
          ...DEFAULT_ENTRY_FILTERS,
          categories: ["school", "nature"],
          groupId: "group-a",
        },
        "user-a",
        null,
      ).map((item) => item.id),
    ).toEqual(["school", "nature"]);
  });
});
