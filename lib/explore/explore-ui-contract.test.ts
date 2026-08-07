import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(
  new URL("../../components/explore/explore-view.tsx", import.meta.url),
  "utf8",
);
const data = readFileSync(
  new URL("../data/explore.ts", import.meta.url),
  "utf8",
);

describe("Explore UI contract", () => {
  it("is available to anonymous visitors without a sign-in gate", () => {
    expect(view).toContain("PUBLIC STORY ATLAS");
    expect(view).not.toContain('kind="signed-out"');
    expect(view).toContain("这里始终只展示已经公开并解锁的故事。");
  });

  it("renders only results from the public Explore RPC", () => {
    expect(data).toContain('rpc("get_public_explore_entries"');
    expect(data).toContain('rpc("get_featured_public_entries"');
    expect(data).toContain('.eq("visibility", "public")');
    expect(view).toContain("listPublicExploreEntries");
    expect(view).toContain("listFeaturedPublicEntries");
  });

  it("provides category, retry, empty and keyset load-more interactions", () => {
    expect(view).toContain("EXPLORE_CATEGORIES.map");
    expect(view).toContain("重新加载");
    expect(view).toContain("GuidedEmptyState");
    expect(view).toContain("加载更多");
  });

  it("keeps optional editorial picks separate from latest pagination", () => {
    expect(view).toContain("编辑精选");
    expect(view).toContain("featuredEntries");
    expect(view).toContain("latestEntries");
    expect(view).toContain("编辑精选暂时无法读取，最新故事仍可继续浏览。");
  });
});
