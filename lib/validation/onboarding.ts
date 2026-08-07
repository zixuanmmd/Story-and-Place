import { z } from "zod";

export const ONBOARDING_INTERESTS = [
  { value: "life", label: "我的生活故事", description: "从成长、家人和日常记忆开始" },
  { value: "travel", label: "我的旅行经历", description: "收藏旅途中遇见的地点与时刻" },
  { value: "literature-city", label: "文学／城市地图", description: "把作品、街道和城市记忆放在一起" },
  { value: "fictional-world", label: "虚构世界设定", description: "为想象中的地点建立时间与故事" },
] as const;

export const onboardingInterestSchema = z.enum([
  "life",
  "travel",
  "literature-city",
  "fictional-world",
]);

export const onboardingInterestsSchema = z
  .array(onboardingInterestSchema)
  .max(4)
  .refine((values) => new Set(values).size === values.length, "兴趣不能重复。");

export type OnboardingInterest = z.infer<typeof onboardingInterestSchema>;

export function deriveFirstStoryTitle(content: string, placeName: string) {
  const compact = content.trim().replace(/\s+/g, " ");
  if (compact) {
    const firstSentence = compact.split(/[。！？!?\n]/, 1)[0]?.trim() ?? "";
    return [...firstSentence].slice(0, 36).join("") || "我的第一个故事";
  }
  const place = placeName.trim();
  return place ? `在${[...place].slice(0, 30).join("")}的故事` : "我的第一个故事";
}
