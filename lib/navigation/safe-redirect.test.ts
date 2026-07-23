import { describe, expect, it } from "vitest";
import { getSafeRedirectPath } from "./safe-redirect";

const ORIGIN = "https://stories.example";

describe("getSafeRedirectPath", () => {
  it.each([
    ["/", "/"],
    ["/my-records", "/my-records"],
    ["/settings", "/settings"],
    ["/?restoreDraft=1", "/?restoreDraft=1"],
  ])("允许白名单内的站内路径 %s", (candidate, expected) => {
    expect(getSafeRedirectPath(candidate, ORIGIN)).toBe(expected);
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "/%5Cevil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "/%E0%A4%A",
    "/my-records%0Aevil",
    "/settings?next=https://evil.example",
    "/not-allowed",
  ])("拒绝恶意或不在白名单内的路径 %s", (candidate) => {
    expect(getSafeRedirectPath(candidate, ORIGIN)).toBe("/");
  });
});
