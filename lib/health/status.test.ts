import { describe, expect, it } from "vitest";
import { resolveHealthStatus } from "./status";

describe("health status", () => {
  it("数据库可达时返回 ok", () => {
    expect(resolveHealthStatus(true, true)).toEqual({
      status: "ok",
      checks: { app: "ok", database: "ok", media: "ok" },
    });
  });

  it("任一依赖不可达时只返回 degraded，不泄露内部配置", () => {
    const status = resolveHealthStatus(false, true);
    expect(status.status).toBe("degraded");
    expect(status.checks.media).toBe("ok");
    expect(JSON.stringify(status)).not.toContain("SUPABASE");
    expect(JSON.stringify(status)).not.toContain("postgres");
  });

  it("媒体服务异常时保持应用和数据库的独立状态", () => {
    expect(resolveHealthStatus(true, false)).toEqual({
      status: "degraded",
      checks: { app: "ok", database: "ok", media: "degraded" },
    });
  });
});
