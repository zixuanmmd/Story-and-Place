import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const welcome = readFileSync(
  new URL("../../components/onboarding/onboarding-view.tsx", import.meta.url),
  "utf8",
);
const firstStoryForm = readFileSync(
  new URL("../../components/onboarding/onboarding-entry-form.tsx", import.meta.url),
  "utf8",
);
const completion = readFileSync(
  new URL("../../components/onboarding/onboarding-complete-view.tsx", import.meta.url),
  "utf8",
);
const mapExperience = readFileSync(
  new URL("../../components/map/map-experience.tsx", import.meta.url),
  "utf8",
);

describe("launch onboarding UI contract", () => {
  it("offers the four optional interests and a skip path", () => {
    expect(welcome).toContain("记录人与地点、时间和故事之间的关系。");
    expect(welcome).toContain("ONBOARDING_INTERESTS.map");
    expect(welcome).toContain("暂时跳过");
    expect(welcome).toContain("skipOnboarding");
  });

  it("keeps the first story focused on place, time and content", () => {
    expect(firstStoryForm).toContain("已选择地图位置");
    expect(firstStoryForm).toContain("发生时间 *");
    expect(firstStoryForm).toContain("故事内容 *");
    expect(firstStoryForm).toContain("onboarding-advanced");
    expect(firstStoryForm).toContain('visibility: "private"');
    expect(firstStoryForm).not.toContain("service_role");
  });

  it("uses the existing map save path and then opens a completion page", () => {
    expect(mapExperience).toContain("<OnboardingEntryForm");
    expect(mapExperience).toContain("createEntry(values, tagNames)");
    expect(mapExperience).toContain("/onboarding/complete?entry=");
  });

  it("shows story feedback and three meaningful next actions", () => {
    expect(completion).toContain("你的第一个故事完成了。");
    expect(completion).toContain("创建更多故事");
    expect(completion).toContain("创建故事线路");
    expect(completion).toContain("邀请共同经历者");
    expect(completion).toContain("completeOnboarding(nextEntry.id)");
  });
});
