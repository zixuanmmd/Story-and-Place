import { describe, expect, it } from "vitest";
import {
  DEFAULT_GLOBAL_SEARCH_FILTERS,
  filtersFromSearchParams,
  globalSearchFiltersSchema,
  globalSearchResultSchema,
  hasActiveSearch,
} from "./search";

describe("global search validation", () => {
  it("accepts a combined search and trims text", () => {
    const filters = globalSearchFiltersSchema.parse({
      query: " 成都 ",
      startYear: 2010,
      endYear: 2020,
      place: " 武侯区 ",
      tag: "大学",
      emotion: "孤独",
      authorId: null,
      contentTypes: ["entry", "route"],
    });
    expect(filters).toMatchObject({
      query: "成都",
      startYear: 2010,
      endYear: 2020,
      place: "武侯区",
    });
    expect(hasActiveSearch(filters)).toBe(true);
  });

  it("rejects enumeration-sized keywords and reversed years", () => {
    expect(globalSearchFiltersSchema.safeParse({
      ...DEFAULT_GLOBAL_SEARCH_FILTERS,
      query: "成",
    }).success).toBe(false);
    expect(globalSearchFiltersSchema.safeParse({
      ...DEFAULT_GLOBAL_SEARCH_FILTERS,
      startYear: 2025,
      endYear: 2020,
    }).success).toBe(false);
  });

  it("parses safe URL filters and removes a leading hash", () => {
    expect(filtersFromSearchParams({
      q: "成都",
      from: "2010",
      to: "2020",
      tag: "#大学",
      emotion: "#孤独",
      types: "entry,route,not-real",
    })).toMatchObject({
      query: "成都",
      startYear: 2010,
      endYear: 2020,
      tag: "大学",
      emotion: "孤独",
      contentTypes: ["entry", "route"],
    });
  });

  it("falls back safely for malformed URL filters", () => {
    expect(filtersFromSearchParams({
      q: "x",
      author: "not-a-uuid",
    })).toEqual(DEFAULT_GLOBAL_SEARCH_FILTERS);
  });

  it("validates database rows before rendering map coordinates or links", () => {
    const base = {
      result_type: "entry",
      result_id: "3e6c9b0d-2277-4b0c-9e76-1a646a8dba22",
      title: "成都的故事",
      subtitle: "人民公园",
      excerpt: "正文",
      href: "/entries/3e6c9b0d-2277-4b0c-9e76-1a646a8dba22",
      occurred_year: 2020,
      time_label: "2020 年",
      latitude: 30.66,
      longitude: 104.06,
      visibility: "public",
      place_category_slug: "landmark",
      author_id: null,
      author_name: null,
      author_avatar_url: null,
      tag_type: null,
      tag_slug: null,
      share_slug: null,
      created_at: "2026-08-08T00:00:00Z",
      total_count: "1",
    };
    expect(globalSearchResultSchema.parse(base).total_count).toBe(1);
    expect(globalSearchResultSchema.safeParse({ ...base, latitude: 91 }).success).toBe(false);
    expect(globalSearchResultSchema.safeParse({ ...base, href: "https://evil.example" }).success).toBe(false);
  });
});
