import { describe, expect, it } from "vitest";
import { moveRouteItem, sortRouteItems, type OrderedRouteItem } from "./ordering";
import type { MapEntryWithProfile } from "@/types/database";

const ids = [
  "81000000-0000-4000-8000-000000000001",
  "81000000-0000-4000-8000-000000000002",
  "81000000-0000-4000-8000-000000000003",
];

function routeItem(id: string, position: number): OrderedRouteItem {
  return { entry_id: id, position, note: "" };
}

function entry(id: string, year: number, createdAt: string): MapEntryWithProfile {
  return {
    id,
    user_id: "82000000-0000-4000-8000-000000000001",
    title: id,
    content: "",
    place_name: null,
    latitude: 0,
    longitude: 0,
    occurred_at: null,
    occurred_local: null,
    occurred_timezone: null,
    occurred_date: null,
    occurred_year: year,
    time_precision: "year",
    time_label: String(year),
    visibility: "public",
    group_id: null,
    place_category_slug: "other",
    allow_comments: true,
    unlock_at: null,
    featured_at: null,
    created_at: createdAt,
    updated_at: createdAt,
    profiles: null,
  };
}

describe("story route ordering", () => {
  const items = ids.map(routeItem);
  const entries = [
    entry(ids[0], 2024, "2020-01-01T00:00:00Z"),
    entry(ids[1], 2008, "2022-01-01T00:00:00Z"),
    entry(ids[2], 2018, "2021-01-01T00:00:00Z"),
  ];

  it("moves nodes up and down while normalizing positions", () => {
    expect(moveRouteItem(items, 2, 0).map((item) => item.entry_id))
      .toEqual([ids[2], ids[0], ids[1]]);
    expect(moveRouteItem(items, 2, 0).map((item) => item.position))
      .toEqual([1, 2, 3]);
  });

  it("automatically sorts by event time", () => {
    expect(sortRouteItems(items, entries, "event-time").map((item) => item.entry_id))
      .toEqual([ids[1], ids[2], ids[0]]);
  });

  it("sorts by creation time without losing notes or positions", () => {
    expect(sortRouteItems(items, entries, "created-time").map((item) => item.entry_id))
      .toEqual([ids[0], ids[2], ids[1]]);
  });
});
