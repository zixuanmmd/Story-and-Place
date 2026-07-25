import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("生产安全响应头", () => {
  it("限制脚本、嵌入、来源信息和高风险浏览器能力", async () => {
    const rules = await nextConfig.headers?.();
    const headers = rules?.flatMap((rule) => rule.headers) ?? [];
    const values = new Map(headers.map((header) => [header.key, header.value]));

    expect(values.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(values.get("Content-Security-Policy")).toContain(
      "object-src 'none'",
    );
    expect(values.get("X-Frame-Options")).toBe("DENY");
    expect(values.get("X-Content-Type-Options")).toBe("nosniff");
    expect(values.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(values.get("Permissions-Policy")).toContain("camera=()");
  });
});
