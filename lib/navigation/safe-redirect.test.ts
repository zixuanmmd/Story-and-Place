import { describe, expect, it } from "vitest";
import { getAuthPageHref, getSafeRedirectPath } from "./safe-redirect";

const ORIGIN = "https://stories.example";

describe("getSafeRedirectPath", () => {
  it.each([
    ["/", "/"],
    ["/my-records", "/my-records"],
    ["/settings", "/settings"],
    ["/?restoreDraft=1", "/?restoreDraft=1"],
    ["/groups", "/groups"],
    ["/groups/new", "/groups/new"],
    ["/groups/invitations", "/groups/invitations"],
    ["/groups/story-circle", "/groups/story-circle"],
    ["/groups/story-circle/settings", "/groups/story-circle/settings"],
    [
      "/users/914ce3f9-cff8-4168-b8e6-51ee89a576ed",
      "/users/914ce3f9-cff8-4168-b8e6-51ee89a576ed",
    ],
    [
      "/users/914ce3f9-cff8-4168-b8e6-51ee89a576ed/timeline",
      "/users/914ce3f9-cff8-4168-b8e6-51ee89a576ed/timeline",
    ],
    ["/users/zixuan-story", "/users/zixuan-story"],
    ["/users/zixuan-story/timeline", "/users/zixuan-story/timeline"],
    ["/feed", "/feed"],
    ["/explore", "/explore"],
    ["/timeline", "/timeline"],
    ["/entry-invitations", "/entry-invitations"],
    ["/tags", "/tags"],
    ["/tags/0123456789abcdefabcd", "/tags/0123456789abcdefabcd"],
    ["/emotions/loneliness", "/emotions/loneliness"],
    ["/emotions/turning-point", "/emotions/turning-point"],
    ["/onboarding", "/onboarding"],
    ["/?onboarding=1", "/?onboarding=1"],
    [
      "/?onboarding=1&template=travel",
      "/?onboarding=1&template=travel",
    ],
    [
      "/?restoreDraft=1&onboarding=1&template=fictional-world",
      "/?restoreDraft=1&onboarding=1&template=fictional-world",
    ],
    ["/?restoreDraft=1&onboarding=1", "/?restoreDraft=1&onboarding=1"],
    [
      "/onboarding/complete?entry=0ea21e54-763a-4bbf-a72d-a7600046f921",
      "/onboarding/complete?entry=0ea21e54-763a-4bbf-a72d-a7600046f921",
    ],
    ["/routes", "/routes"],
    ["/routes/new", "/routes/new"],
    ["/routes/0123456789abcdefabcd", "/routes/0123456789abcdefabcd"],
    [
      "/routes/0123456789abcdefabcd/edit",
      "/routes/0123456789abcdefabcd/edit",
    ],
    [
      "/?entry=0ea21e54-763a-4bbf-a72d-a7600046f921",
      "/?entry=0ea21e54-763a-4bbf-a72d-a7600046f921",
    ],
    [
      "/?entry=0ea21e54-763a-4bbf-a72d-a7600046f921&edit=1",
      "/?entry=0ea21e54-763a-4bbf-a72d-a7600046f921&edit=1",
    ],
    [
      "/?group=41000000-0000-4000-8000-000000000001",
      "/?group=41000000-0000-4000-8000-000000000001",
    ],
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
    "/groups/UPPERCASE",
    "/groups/story-circle/unknown",
    "/users/-invalid-handle",
    `/users/${"a".repeat(49)}`,
    "/routes/too-short",
    "/emotions/孤独",
    "/emotions/UPPERCASE",
    "/emotions/hope/extra",
    "/onboarding/complete",
    "/onboarding/complete?entry=not-a-uuid",
    "/?onboarding=2",
    "/?onboarding=1&template=unknown",
    "/?template=travel",
    "/?onboarding=1&template=travel&template=life-memory",
    "/?onboarding=1&template=travel&next=https://evil.example",
    "/?entry=not-a-uuid",
    "/?group=not-a-uuid",
    "/?entry=0ea21e54-763a-4bbf-a72d-a7600046f921&next=https://evil.example",
  ])("拒绝恶意或不在白名单内的路径 %s", (candidate) => {
    expect(getSafeRedirectPath(candidate, ORIGIN)).toBe("/");
  });

  it("登录和注册切换时只保留已经验证的 next", () => {
    expect(
      getAuthPageHref(
        "/register",
        "/groups/new",
        ORIGIN,
      ),
    ).toBe("/register?next=%2Fgroups%2Fnew");
    expect(
      getAuthPageHref(
        "/login",
        "/users/914ce3f9-cff8-4168-b8e6-51ee89a576ed",
        ORIGIN,
        "person@example.test",
      ),
    ).toBe(
      "/login?next=%2Fusers%2F914ce3f9-cff8-4168-b8e6-51ee89a576ed&email=person%40example.test",
    );
    expect(
      getAuthPageHref("/register", "https://evil.example", ORIGIN),
    ).toBe("/register?next=%2F");
  });
});
