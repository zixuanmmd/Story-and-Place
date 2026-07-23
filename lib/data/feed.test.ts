import { describe, expect, it } from "vitest";
import { toFeedPage } from "./feed";
import type { FeedEntry } from "@/types/database";

function row(id: string): FeedEntry {
  return {
    id,
    user_id: "user",
    title: id,
    content: "内容",
    place_name: null,
    latitude: 0,
    longitude: 0,
    time_label: "2026 年",
    visibility: "public",
    group_id: null,
    place_category_slug: "other",
    allow_comments: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    author_display_name: "作者",
    author_avatar_url: null,
    group_name: null,
    group_slug: null,
    like_count: 0,
    comment_count: 0,
    user_liked: false,
  };
}

describe("信息流分页", () => {
  it("用 page size + 1 判断是否还有下一页", () => {
    const page = toFeedPage([row("1"), row("2"), row("3")], 2);
    expect(page.entries.map((entry) => entry.id)).toEqual(["1", "2"]);
    expect(page.hasMore).toBe(true);
  });
});
