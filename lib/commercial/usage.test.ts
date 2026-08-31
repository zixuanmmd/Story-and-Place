import { describe, expect, it } from "vitest";
import {
  formatUsageBytes,
  isUsageNearLimit,
  usagePercentage,
} from "@/lib/commercial/usage";

describe("commercial usage presentation", () => {
  it("formats storage without losing the unit", () => {
    expect(formatUsageBytes(512)).toBe("512 B");
    expect(formatUsageBytes(1024 ** 2)).toBe("1.0 MB");
    expect(formatUsageBytes(5 * 1024 ** 3)).toBe("5.0 GB");
  });

  it("bounds percentages and identifies the near-limit threshold", () => {
    expect(usagePercentage(90, 100)).toBe(90);
    expect(usagePercentage(120, 100)).toBe(100);
    expect(usagePercentage(0, 0)).toBe(0);
    expect(isUsageNearLimit(79, 100)).toBe(false);
    expect(isUsageNearLimit(80, 100)).toBe(true);
  });
});
