import { describe, expect, it } from "vitest";
import {
  isLeapYear,
  normalizeStoredLocalDateTime,
  parseExactLocalDateTime,
  parseLegacyExactTimeLabel,
} from "./local-date-time";

describe("strict local date-time", () => {
  it("正确判断闰年", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  it("精确校验日期、小时和分钟", () => {
    expect(parseExactLocalDateTime("2024-02-29T23:59")).not.toBeNull();
    expect(parseExactLocalDateTime("2025-02-29T12:00")).toBeNull();
    expect(parseExactLocalDateTime("2025-02-30T12:00")).toBeNull();
    expect(parseExactLocalDateTime("2025-13-01T12:00")).toBeNull();
    expect(parseExactLocalDateTime("2025-01-01T24:00")).toBeNull();
    expect(parseExactLocalDateTime("2025-01-01T23:60")).toBeNull();
  });

  it("从旧版显示文本无损恢复当地时间", () => {
    expect(parseLegacyExactTimeLabel("2024 年 2 月 29 日 08:05")).toBe(
      "2024-02-29T08:05",
    );
    expect(parseLegacyExactTimeLabel("2025 年 2 月 29 日 08:05")).toBeNull();
  });

  it("把 PostgreSQL timestamp 文本规范化为表单分钟格式", () => {
    expect(normalizeStoredLocalDateTime("2024-02-29 08:05:00")).toBe(
      "2024-02-29T08:05",
    );
    expect(normalizeStoredLocalDateTime("2025-02-29 08:05:00")).toBeNull();
  });
});
