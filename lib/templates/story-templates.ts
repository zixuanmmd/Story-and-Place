import type {
  PlaceCategorySlug,
  TimePrecision,
} from "@/types/database";
import type { EntryFormValues } from "@/lib/validation/entry";

export const STORY_TEMPLATE_IDS = [
  "life-memory",
  "travel",
  "literary-map",
  "fictional-world",
] as const;

export type StoryTemplateId = (typeof STORY_TEMPLATE_IDS)[number];

export type StoryTemplate = {
  id: StoryTemplateId;
  label: string;
  summary: string;
  prompts: readonly string[];
  contentPlaceholder: string;
  suggestedCategory: PlaceCategorySlug;
  suggestedPrecision: TimePrecision;
  suggestedTag: string;
};

export const STORY_TEMPLATES: readonly StoryTemplate[] = [
  {
    id: "life-memory",
    label: "人生记忆",
    summary: "从一个人与一段仍然清晰的日常开始",
    prompts: ["地点", "时间", "人物", "情绪"],
    contentPlaceholder:
      "那时和谁在一起？\n这个地方发生了什么？\n多年以后，你还记得怎样的感受？",
    suggestedCategory: "home",
    suggestedPrecision: "approximate",
    suggestedTag: "人生记忆",
  },
  {
    id: "travel",
    label: "旅行记录",
    summary: "收藏旅途中真正想留下的一个瞬间",
    prompts: ["地点", "日期", "照片线索", "见闻"],
    contentPlaceholder:
      "为什么来到这里？\n你看见、听见或遇见了什么？\n如果有一张照片，它记录了怎样的画面？",
    suggestedCategory: "travel",
    suggestedPrecision: "date",
    suggestedTag: "旅行",
  },
  {
    id: "literary-map",
    label: "文学地图",
    summary: "让作品中的文字和真实地点彼此照见",
    prompts: ["作品", "作者", "章节", "引用"],
    contentPlaceholder:
      "作品与作者：\n这一地点出现在哪个章节或段落？\n它与真实城市产生了怎样的联系？\n可在正文中写下短引用与出处。",
    suggestedCategory: "landmark",
    suggestedPrecision: "approximate",
    suggestedTag: "文学地图",
  },
  {
    id: "fictional-world",
    label: "虚构世界",
    summary: "为想象中的地点建立时间、人物与事件",
    prompts: ["地点", "年份", "事件", "人物"],
    contentPlaceholder:
      "这个地点在世界中的位置是什么？\n这一年发生了什么事件？\n哪些人物来到这里，地点因此发生了怎样的变化？",
    suggestedCategory: "other",
    suggestedPrecision: "year",
    suggestedTag: "虚构世界",
  },
] as const;

const TEMPLATE_BY_ID = new Map(
  STORY_TEMPLATES.map((template) => [template.id, template]),
);

const INTEREST_TEMPLATE_MAP: Record<string, StoryTemplateId> = {
  life: "life-memory",
  travel: "travel",
  "literature-city": "literary-map",
  "fictional-world": "fictional-world",
};

export function parseStoryTemplateId(
  candidate: string | null | undefined,
): StoryTemplateId | null {
  return STORY_TEMPLATE_IDS.includes(candidate as StoryTemplateId)
    ? (candidate as StoryTemplateId)
    : null;
}

export function getStoryTemplate(
  candidate: string | null | undefined,
): StoryTemplate | null {
  const id = parseStoryTemplateId(candidate);
  return id ? TEMPLATE_BY_ID.get(id) ?? null : null;
}

export function getTemplateForInterests(
  interests: readonly string[],
): StoryTemplateId | null {
  for (const interest of interests) {
    const template = INTEREST_TEMPLATE_MAP[interest];
    if (template) return template;
  }
  return null;
}

export function applyStoryTemplateDefaults(
  values: EntryFormValues,
  candidate: StoryTemplateId | null,
): EntryFormValues {
  const template = getStoryTemplate(candidate);
  if (!template) return values;

  return {
    ...values,
    place_category_slug:
      values.place_category_slug === "other"
        ? template.suggestedCategory
        : values.place_category_slug,
    time_precision:
      values.time_value.trim() === ""
        ? template.suggestedPrecision
        : values.time_precision,
  };
}

export function addTemplateTag(
  tagInput: string,
  candidate: StoryTemplateId | null,
) {
  const template = getStoryTemplate(candidate);
  if (!template) return tagInput;
  const existing = tagInput
    .split(/[，,]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const normalizedSuggestion = template.suggestedTag.toLocaleLowerCase();
  if (
    existing.some(
      (value) => value.replace(/^#/, "").toLocaleLowerCase() === normalizedSuggestion,
    )
  ) {
    return tagInput;
  }
  return [...existing, template.suggestedTag].join("，");
}
