import { describe, expect, it } from "vitest";
import {
  FEATURED_EXPLORE_LIMIT,
  mergeExploreEntries,
  toExplorePage,
} from "./explore";
import type { MapEntryWithProfile } from "@/types/database";

describe("explore pagination", () => {
  it("uses limit plus one without returning the sentinel row", () => {
    expect(toExplorePage([1, 2, 3], 2)).toEqual({
      rows: [1, 2],
      hasMore: true,
    });
    expect(toExplorePage([1, 2], 2)).toEqual({
      rows: [1, 2],
      hasMore: false,
    });
  });

  it("deduplicates a stable keyset boundary", () => {
    const entry = (id: string) => ({ id }) as MapEntryWithProfile;
    expect(
      mergeExploreEntries(
        [entry("first"), entry("second")],
        [entry("second"), entry("third")],
      ).map((item) => item.id),
    ).toEqual(["first", "second", "third"]);
  });

  it("keeps the editorial rail intentionally small", () => {
    expect(FEATURED_EXPLORE_LIMIT).toBe(6);
  });
});
