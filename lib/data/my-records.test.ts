import { describe, expect, it } from "vitest";
import { filterAndSortMyEntries } from "./my-records";
import type { MapEntryWithProfile } from "../../types/database";

function record(id: string, local: string, visibility: "public" | "private") {
  return {
    id,
    user_id: "user-a",
    title: `${id} 标题`,
    content: "内容",
    place_name: null,
    latitude: 0,
    longitude: 0,
    occurred_at: null,
    occurred_local: local,
    occurred_timezone: "Asia/Shanghai",
    occurred_date: local.slice(0, 10),
    occurred_year: Number(local.slice(0, 4)),
    time_precision: "exact",
    time_label: local,
    visibility,
    group_id: null,
    place_category_slug: "other",
    allow_comments: true,
    unlock_at: null,
    featured_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: id === "new" ? "2026-02-01T00:00:00Z" : "2026-01-01T00:00:00Z",
    profiles: null,
  } satisfies MapEntryWithProfile;
}

describe("my records filtering and sorting", () => {
  const old = record("old", "2020-01-01T12:00", "private");
  const recent = record("new", "2024-01-01T12:00", "public");

  it("按事件当地时间排序", () => {
    expect(
      filterAndSortMyEntries([old, recent], "", "all", "occurred").map(
        (item) => item.id,
      ),
    ).toEqual(["new", "old"]);
  });

  it("组合文本搜索和可见性筛选", () => {
    expect(
      filterAndSortMyEntries([old, recent], "old", "private", "updated"),
    ).toEqual([old]);
  });
});
