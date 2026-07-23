import { describe, expect, it } from "vitest";
import {
  getCategoryLabel,
  getVisibilityMarkerGlyph,
  normalizeCategory,
  PLACE_CATEGORIES,
} from "./registry";

describe("地点分类注册表", () => {
  it("包含稳定且唯一的 12 个分类", () => {
    expect(PLACE_CATEGORIES).toHaveLength(12);
    expect(new Set(PLACE_CATEGORIES.map((item) => item.slug)).size).toBe(12);
  });

  it("未知图标键安全回退到 other", () => {
    expect(normalizeCategory("not-real")).toBe("other");
    expect(getCategoryLabel("not-real")).toBe("其他");
  });

  it("公开、私密和群组标记具有不同的非颜色符号", () => {
    const glyphs = ["public", "private", "group"].map((visibility) =>
      getVisibilityMarkerGlyph(visibility as "public" | "private" | "group"),
    );
    expect(new Set(glyphs).size).toBe(3);
  });
});

