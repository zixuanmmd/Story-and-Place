import { describe, expect, it } from "vitest";
import { entryMediaForScope, moveMediaAsset } from "@/lib/data/entry-media";
import type { MediaAssetView } from "@/lib/media/contracts";

function asset(id: string, sortOrder: number): MediaAssetView {
  return {
    id,
    entryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    width: 100,
    height: 100,
    sizeBytes: 100,
    sortOrder,
    isCover: sortOrder === 0,
    fullUrl: `https://example.test/${id}.webp`,
    thumbnailUrl: `https://example.test/${id}-thumb.webp`,
    createdAt: "2026-08-28T00:00:00.000Z",
  };
}

describe("story media ordering", () => {
  const first = asset("10000000-0000-4000-8000-000000000001", 0);
  const second = asset("20000000-0000-4000-8000-000000000002", 1);
  const third = asset("30000000-0000-4000-8000-000000000003", 2);

  it("moves an image and normalizes positions", () => {
    const result = moveMediaAsset([first, second, third], second.id, "next");
    expect(result.map((item) => item.id)).toEqual([first.id, third.id, second.id]);
    expect(result.map((item) => item.sortOrder)).toEqual([0, 1, 2]);
  });

  it("does not create an invalid order at either boundary", () => {
    const original = [first, second, third];
    expect(moveMediaAsset(original, first.id, "previous")).toBe(original);
    expect(moveMediaAsset(original, third.id, "next")).toBe(original);
  });

  it("never renders media retained from another identity scope", () => {
    const scoped = {
      scope: "user-a",
      assets: [first],
      usage: { usedBytes: 150, quotaBytes: 500, fileCount: 1 },
    };
    expect(entryMediaForScope(scoped, "user-a").assets).toEqual([first]);
    expect(entryMediaForScope(scoped, "user-b")).toEqual({ assets: [], usage: null });
    expect(entryMediaForScope(scoped, "anon")).toEqual({ assets: [], usage: null });
  });
});
