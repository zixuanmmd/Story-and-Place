import { describe, expect, it } from "vitest";
import {
  isDisplayNameLengthValid,
  normalizeDisplayNameForComparison,
  normalizeDisplayNameForStorage,
} from "./display-name";

describe("display name normalization", () => {
  it("去除首尾空白并折叠连续空白", () => {
    expect(normalizeDisplayNameForStorage("  山音   故事  ")).toBe("山音 故事");
  });

  it.each([
    ["山音", " 山音 "],
    ["Zixuan", "zixuan"],
    ["Zixuan   Story", " zixuan story "],
  ])("比较时不能用空白或英文大小写绕过：%s", (left, right) => {
    expect(normalizeDisplayNameForComparison(left)).toBe(
      normalizeDisplayNameForComparison(right),
    );
  });

  it("拒绝空昵称和规范化后超过 80 字的昵称", () => {
    expect(isDisplayNameLengthValid("   ")).toBe(false);
    expect(isDisplayNameLengthValid("字".repeat(81))).toBe(false);
    expect(isDisplayNameLengthValid("字".repeat(80))).toBe(true);
  });
});
