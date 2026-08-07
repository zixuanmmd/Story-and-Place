import { describe, expect, it } from "vitest";
import type { MapEntryWithProfile } from "@/types/database";
import {
  mergePublicProfileStories,
  toPublicProfileStoryPage,
} from "@/lib/data/public-profile";

function entry(id: string) {
  return { id } as MapEntryWithProfile;
}

describe("public profile story pagination", () => {
  it("uses the extra row only to report that another page exists", () => {
    const page = toPublicProfileStoryPage([entry("a"), entry("b"), entry("c")], 2);

    expect(page.rows.map((item) => item.id)).toEqual(["a", "b"]);
    expect(page.hasMore).toBe(true);
  });

  it("reports a complete final page", () => {
    const page = toPublicProfileStoryPage([entry("a"), entry("b")], 2);

    expect(page.rows).toHaveLength(2);
    expect(page.hasMore).toBe(false);
  });

  it("preserves order while removing entries repeated across pages", () => {
    const merged = mergePublicProfileStories(
      [entry("a"), entry("b")],
      [entry("b"), entry("c")],
    );

    expect(merged.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });
});
