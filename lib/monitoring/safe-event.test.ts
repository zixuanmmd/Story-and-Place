import { describe, expect, it } from "vitest";
import {
  containsSensitiveMonitoringFields,
  createSafeMonitoringEvent,
  normalizeMonitoringRoute,
  safeMonitoringEventSchema,
} from "./safe-event";

describe("privacy-safe monitoring events", () => {
  it("只保留白名单元数据，不包含正文、坐标、消息、堆栈或凭据", () => {
    const event = createSafeMonitoringEvent({
      name: "PostgrestError",
      code: "42501",
      status: 403,
      message: "private story body",
      stack: "secret stack",
      access_token: "token",
      latitude: 30.67,
    }, "entry:read", "/entries/abc?token=secret");

    expect(safeMonitoringEventSchema.parse(event)).toEqual(event);
    expect(event.route).toBe("/entries/abc");
    expect(containsSensitiveMonitoringFields(event)).toBe(false);
    expect(JSON.stringify(event)).not.toContain("private story body");
    expect(JSON.stringify(event)).not.toContain("secret");
  });

  it("拒绝可能包含查询或控制字符的路由与上下文", () => {
    expect(normalizeMonitoringRoute("javascript:alert(1)")).toBeNull();
    const event = createSafeMonitoringEvent(new Error("hidden"), "bad context with spaces");
    expect(event.context).toBe("unknown");
  });
});
