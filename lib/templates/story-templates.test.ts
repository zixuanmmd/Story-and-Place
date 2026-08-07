import { describe, expect, it } from "vitest";
import type { EntryFormValues } from "@/lib/validation/entry";
import {
  STORY_TEMPLATES,
  addTemplateTag,
  applyStoryTemplateDefaults,
  getStoryTemplate,
  getTemplateForInterests,
  parseStoryTemplateId,
} from "./story-templates";

const BASE_VALUES: EntryFormValues = {
  title: "",
  content: "",
  place_name: "",
  latitude: 30,
  longitude: 104,
  time_precision: "date",
  time_value: "",
  occurred_timezone: "Asia/Shanghai",
  visibility: "private",
  group_id: "",
  place_category_slug: "other",
  allow_comments: true,
  unlock_at: "",
};

describe("story templates", () => {
  it("提供四种稳定模板和完整写作提示", () => {
    expect(STORY_TEMPLATES.map((template) => template.id)).toEqual([
      "life-memory",
      "travel",
      "literary-map",
      "fictional-world",
    ]);
    expect(STORY_TEMPLATES.every((template) => template.prompts.length === 4)).toBe(true);
  });

  it("只接受注册表中的模板 id", () => {
    expect(parseStoryTemplateId("travel")).toBe("travel");
    expect(parseStoryTemplateId("unknown")).toBeNull();
    expect(parseStoryTemplateId(null)).toBeNull();
    expect(getStoryTemplate("literary-map")?.label).toBe("文学地图");
  });

  it("根据首次兴趣选择默认模板", () => {
    expect(getTemplateForInterests(["travel", "life"])).toBe("travel");
    expect(getTemplateForInterests(["fictional-world"])).toBe("fictional-world");
    expect(getTemplateForInterests([])).toBeNull();
  });

  it("仅为空白记录补充分类与时间精度，不伪造故事正文", () => {
    const result = applyStoryTemplateDefaults(BASE_VALUES, "travel");
    expect(result.place_category_slug).toBe("travel");
    expect(result.time_precision).toBe("date");
    expect(result.content).toBe("");
    expect(result.title).toBe("");
  });

  it("不会覆盖用户已经选择的分类或有值的时间", () => {
    const result = applyStoryTemplateDefaults(
      {
        ...BASE_VALUES,
        place_category_slug: "street",
        time_precision: "year",
        time_value: "2020",
        content: "已经写下的故事",
      },
      "life-memory",
    );
    expect(result.place_category_slug).toBe("street");
    expect(result.time_precision).toBe("year");
    expect(result.time_value).toBe("2020");
    expect(result.content).toBe("已经写下的故事");
  });

  it("添加建议标签时保留现有标签并忽略大小写重复", () => {
    expect(addTemplateTag("城市", "travel")).toBe("城市，旅行");
    expect(addTemplateTag("#旅行", "travel")).toBe("#旅行");
    expect(addTemplateTag("旅行", "travel")).toBe("旅行");
  });
});
