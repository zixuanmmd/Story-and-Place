import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMELINE_FILTERS,
  filterTimelineEntries,
  getTimelineYear,
  groupTimelineEntries,
  parseTimelineSearchParams,
  sortTimelineEntries,
} from "./timeline";
import type { MapEntryWithProfile } from "@/types/database";

function entry(
  id: string,
  overrides: Partial<MapEntryWithProfile> = {},
): MapEntryWithProfile {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    title: `故事 ${id}`,
    content: "内容",
    place_name: "上海",
    latitude: 31,
    longitude: 121,
    occurred_at: null,
    occurred_local: null,
    occurred_timezone: null,
    occurred_date: null,
    occurred_year: null,
    time_precision: "approximate",
    time_label: "童年时期",
    visibility: "public",
    group_id: null,
    place_category_slug: "other",
    allow_comments: true,
    created_at: `2026-01-0${id}T00:00:00Z`,
    updated_at: "2026-01-01T00:00:00Z",
    profiles: { display_name: "山音", avatar_url: null },
    ...overrides,
  };
}

describe("timeline ordering and filtering", () => {
  it("recognizes explicit years in approximate labels without inventing dates", () => {
    expect(getTimelineYear(entry("1", { time_label: "2008 年夏天" }))).toBe(2008);
    expect(getTimelineYear(entry("2", { time_label: "童年时期" }))).toBeNull();
  });

  it("sorts known event times stably and keeps undated entries separate at the end", () => {
    const rows = [
      entry("1"),
      entry("2", { occurred_year: 2020, time_precision: "year", time_label: "2020" }),
      entry("3", { occurred_year: 2024, occurred_date: "2024-02-29", time_precision: "date", time_label: "2024-02-29" }),
    ];
    expect(sortTimelineEntries(rows, "desc").map((row) => row.id)).toEqual(["3", "2", "1"]);
    expect(groupTimelineEntries(sortTimelineEntries(rows, "desc")).map((group) => group.label))
      .toEqual(["2024 年", "2020 年", "时间未定"]);
  });

  it("orders exact, date, month and year precisions by their normalized local values", () => {
    const rows = [
      entry("1", { occurred_year: 2024, time_precision: "year", time_label: "2024" }),
      entry("2", { occurred_year: 2024, occurred_date: "2024-05-01", time_precision: "month", time_label: "2024 年 5 月" }),
      entry("3", { occurred_year: 2024, occurred_date: "2024-05-20", time_precision: "date", time_label: "2024-05-20" }),
      entry("4", { occurred_year: 2024, occurred_date: "2024-05-20", occurred_local: "2024-05-20T08:30", time_precision: "exact", time_label: "2024-05-20 08:30" }),
    ];
    expect(sortTimelineEntries(rows, "asc").map((row) => row.id))
      .toEqual(["2", "3", "4", "1"]);
    expect(sortTimelineEntries(rows, "desc").map((row) => row.id))
      .toEqual(["1", "4", "3", "2"]);
  });

  it("uses created time and id as deterministic tie breakers", () => {
    const first = entry("1", { occurred_year: 2020, time_precision: "year", time_label: "2020", created_at: "2026-01-01T00:00:00Z" });
    const second = entry("2", { occurred_year: 2020, time_precision: "year", time_label: "2020", created_at: "2026-01-02T00:00:00Z" });
    expect(sortTimelineEntries([first, second], "asc").map((row) => row.id)).toEqual(["1", "2"]);
    expect(sortTimelineEntries([first, second], "desc").map((row) => row.id)).toEqual(["2", "1"]);
  });

  it("filters multiple categories, author and visibility with the same pure function", () => {
    const rows = [
      entry("1", { place_category_slug: "home", visibility: "private" }),
      entry("2", { place_category_slug: "school" }),
    ];
    expect(filterTimelineEntries(rows, {
      ...DEFAULT_TIMELINE_FILTERS,
      categories: ["home", "school"],
      visibility: "private",
    }).map((row) => row.id)).toEqual(["1"]);
  });

  it("filters years and authors without including undated records", () => {
    const anotherAuthor = "00000000-0000-4000-8000-000000000099";
    const rows = [
      entry("1", { occurred_year: 2008, user_id: anotherAuthor }),
      entry("2", { occurred_year: 2024, user_id: anotherAuthor }),
      entry("3"),
    ];
    expect(filterTimelineEntries(rows, {
      ...DEFAULT_TIMELINE_FILTERS,
      authorId: anotherAuthor,
      startYear: 2000,
      endYear: 2010,
      includeUndated: false,
    }).map((row) => row.id)).toEqual(["1"]);
  });

  it("validates URL filters and ignores unknown categories", () => {
    const filters = parseTimelineSearchParams(new URLSearchParams(
      "visibility=private&categories=home,evil&order=asc&start=2001&undated=0",
    ));
    expect(filters).toMatchObject({
      visibility: "private",
      categories: ["home"],
      order: "asc",
      startYear: 2001,
      includeUndated: false,
    });
  });
});
