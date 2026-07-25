import { describe, expect, it } from "vitest";
import { profileSchema } from "./profile";

const baseProfile = {
  display_name: "山音",
  bio: "",
  avatar_url: "",
};

describe("公开资料校验", () => {
  it("头像仅接受空值或 HTTPS 地址", () => {
    expect(profileSchema.safeParse(baseProfile).success).toBe(true);
    expect(
      profileSchema.safeParse({
        ...baseProfile,
        avatar_url: "https://images.example/avatar.jpg",
      }).success,
    ).toBe(true);
    expect(
      profileSchema.safeParse({
        ...baseProfile,
        avatar_url: "http://images.example/avatar.jpg",
      }).success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({
        ...baseProfile,
        avatar_url: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });
});
