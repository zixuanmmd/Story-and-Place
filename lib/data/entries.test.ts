import { describe, expect, it } from "vitest";
import { toLimitedEntryResult } from "./entries";

describe("entry query limit", () => {
  it("读取 limit + 1 条时返回截断标记并只暴露 limit 条", () => {
    const result = toLimitedEntryResult(
      Array.from({ length: 501 }, (_, index) => ({ id: index })),
      500,
    );
    expect(result.entries).toHaveLength(500);
    expect(result.truncated).toBe(true);
  });

  it("未超过上限时不误报截断", () => {
    expect(toLimitedEntryResult([{ id: 1 }], 500).truncated).toBe(false);
  });
});
