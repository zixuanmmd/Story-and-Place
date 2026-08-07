export const EXPLORE_CATEGORIES = [
  {
    value: "all",
    label: "全部",
    description: "最近公开的地点故事",
    tagNames: [],
  },
  {
    value: "literature",
    label: "文学",
    description: "作品、诗歌与真实地点之间的回声",
    tagNames: ["文学", "文学地图", "小说", "诗歌", "作品"],
  },
  {
    value: "city-memory",
    label: "城市记忆",
    description: "街道、故乡和日常生活留下的城市切片",
    tagNames: ["城市记忆", "城市", "老街", "故乡", "记忆"],
  },
  {
    value: "travel",
    label: "旅行",
    description: "旅途中遇见的人、风景与瞬间",
    tagNames: ["旅行", "旅途", "游记"],
  },
  {
    value: "science-fiction",
    label: "科幻",
    description: "未来、技术和另一种世界的地点想象",
    tagNames: ["科幻", "sci-fi", "scifi", "science fiction"],
  },
  {
    value: "fictional-world",
    label: "虚构世界",
    description: "为架空世界建立地点、人物与历史",
    tagNames: ["虚构世界", "世界观", "虚构", "架空"],
  },
] as const;

export type ExploreCategory = (typeof EXPLORE_CATEGORIES)[number]["value"];

export function parseExploreCategory(
  candidate: string | null | undefined,
): ExploreCategory {
  return EXPLORE_CATEGORIES.some((category) => category.value === candidate)
    ? (candidate as ExploreCategory)
    : "all";
}

export function getExploreCategory(category: ExploreCategory) {
  return EXPLORE_CATEGORIES.find((option) => option.value === category)
    ?? EXPLORE_CATEGORIES[0];
}
