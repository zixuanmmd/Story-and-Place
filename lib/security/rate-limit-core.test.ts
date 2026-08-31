import { describe, expect, it } from "vitest";
import {
  getRequestClientIdentifier,
  hashRateLimitIdentifier,
} from "./rate-limit-core";

describe("server rate limit identifiers", () => {
  it("只使用受信代理链中的第一个地址", () => {
    const request = new Request("https://story.test/api", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    expect(getRequestClientIdentifier(request)).toBe("203.0.113.7");
  });

  it("没有代理地址时使用稳定的非敏感占位", () => {
    expect(getRequestClientIdentifier(new Request("https://story.test/api"))).toBe("unknown");
  });

  it("HMAC 不存储原始标识，并按 scope 隔离", () => {
    const secret = "test-secret-that-is-at-least-32-bytes-long";
    const first = hashRateLimitIdentifier("delete", "203.0.113.7", secret);
    const second = hashRateLimitIdentifier("report", "203.0.113.7", secret);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain("203.0.113.7");
    expect(first).not.toBe(second);
  });
});
