import { describe, expect, it } from "vitest";
import {
  deriveFirstStoryTitle,
  onboardingInterestsSchema,
} from "./onboarding";

describe("onboarding validation", () => {
  it("accepts an optional, unique interest selection", () => {
    expect(onboardingInterestsSchema.safeParse([]).success).toBe(true);
    expect(onboardingInterestsSchema.safeParse(["life", "travel"]).success).toBe(true);
  });

  it("rejects unknown or duplicate interests", () => {
    expect(onboardingInterestsSchema.safeParse(["unknown"]).success).toBe(false);
    expect(onboardingInterestsSchema.safeParse(["life", "life"]).success).toBe(false);
  });

  it("derives a short title from the story without splitting Chinese characters", () => {
    expect(deriveFirstStoryTitle("第一次来到成都。后来常常想起。", "成都")).toBe("第一次来到成都");
    expect([...deriveFirstStoryTitle("很长".repeat(40), "")]).toHaveLength(36);
  });

  it("falls back to a place or a safe default", () => {
    expect(deriveFirstStoryTitle("", " 外婆家的院子 ")).toBe("在外婆家的院子的故事");
    expect(deriveFirstStoryTitle("", "")).toBe("我的第一个故事");
  });
});
