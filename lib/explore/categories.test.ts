import { describe, expect, it } from "vitest";
import {
  EXPLORE_CATEGORIES,
  getExploreCategory,
  parseExploreCategory,
} from "./categories";

describe("explore categories", () => {
  it("exposes the five launch discovery lenses and an all view", () => {
    expect(EXPLORE_CATEGORIES.map((category) => category.value)).toEqual([
      "all",
      "literature",
      "city-memory",
      "travel",
      "science-fiction",
      "fictional-world",
    ]);
  });

  it("falls back safely when a category is unknown", () => {
    expect(parseExploreCategory("travel")).toBe("travel");
    expect(parseExploreCategory("private")).toBe("all");
    expect(parseExploreCategory(null)).toBe("all");
    expect(getExploreCategory("literature").label).toBe("文学");
  });

  it("keeps every discovery lens tied to an explicit tag vocabulary", () => {
    expect(
      EXPLORE_CATEGORIES
        .filter((category) => category.value !== "all")
        .every((category) => category.tagNames.length > 0),
    ).toBe(true);
  });
});
