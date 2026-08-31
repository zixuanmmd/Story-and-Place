import { describe, expect, it } from "vitest";
import type { MapEntry, Profile } from "@/types/database";
import { formatLifePathSpan, toLifePathRouteItems } from "./life-path";

const profile: Profile = {
  id: "41000000-0000-4000-8000-000000000001",
  username: "shan-yin",
  display_name: "山音",
  avatar_url: null,
  bio: null,
  deleted_at: null,
  created_at: "2020-01-01T00:00:00.000Z",
  updated_at: "2020-01-01T00:00:00.000Z",
};

function entry(id: string, title: string): MapEntry {
  return {
    id,
    user_id: profile.id,
    title,
    content: `${title}正文`,
    place_name: "成都",
    latitude: 30.67,
    longitude: 104.06,
    occurred_at: null,
    occurred_local: null,
    occurred_timezone: null,
    occurred_date: null,
    occurred_year: 2024,
    time_precision: "year",
    time_label: "2024 年",
    visibility: "public",
    group_id: null,
    place_category_slug: "street",
    allow_comments: true,
    unlock_at: null,
    featured_at: null,
    moderation_status: "active",
    moderated_at: null,
    moderated_by: null,
    moderation_reason: "",
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
  };
}

describe("life path presentation", () => {
  it("formats a public event year span", () => {
    expect(formatLifePathSpan({
      public_story_count: 4,
      earliest_year: 2012,
      latest_year: 2026,
      distinct_place_count: 3,
      first_time_label: "2012 年",
      last_time_label: "2026 年",
    })).toBe("2012–2026");
  });

  it("falls back to original labels when no normalized year exists", () => {
    expect(formatLifePathSpan({
      public_story_count: 2,
      earliest_year: null,
      latest_year: null,
      distinct_place_count: 2,
      first_time_label: "童年时期",
      last_time_label: "离开前后",
    })).toBe("童年时期 至 离开前后");
  });

  it("converts chronological entries into numbered map nodes without copying", () => {
    const entries = [entry("51000000-0000-4000-8000-000000000001", "起点"), entry("51000000-0000-4000-8000-000000000002", "后来")];
    const items = toLifePathRouteItems(entries, profile);
    expect(items.map((item) => item.position)).toEqual([1, 2]);
    expect(items.map((item) => item.entry_id)).toEqual(entries.map((item) => item.id));
    expect(items[0].map_entries?.profiles?.display_name).toBe("山音");
  });
});
