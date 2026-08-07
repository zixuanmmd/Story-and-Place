import { describe, expect, it } from "vitest";
import { parseEntryDraft, serializeEntryDraft } from "./entry-draft";
import type { EntryFormValues } from "../validation/entry";

const valid: EntryFormValues = {
  title: "雨夜",
  content: "桥下躲雨。",
  place_name: "旧桥",
  latitude: 30,
  longitude: 120,
  time_precision: "exact",
  time_value: "2024-02-29T20:30",
  occurred_timezone: "Asia/Shanghai",
  visibility: "private",
  group_id: "",
  place_category_slug: "other",
  allow_comments: true,
  unlock_at: "",
};

describe("entry draft", () => {
  it("保存并恢复带版本号的合法草稿", () => {
    expect(parseEntryDraft(serializeEntryDraft(valid))).toEqual(valid);
  });

  it("损坏 JSON 和非法坐标均被安全拒绝", () => {
    expect(parseEntryDraft("{broken")).toBeNull();
    expect(
      parseEntryDraft(
        JSON.stringify({ version: 1, values: { ...valid, latitude: 999 } }),
      ),
    ).toBeNull();
  });

  it("兼容没有版本号和时区字段的旧草稿", () => {
    const legacy: Record<string, unknown> = { ...valid };
    delete legacy.occurred_timezone;
    delete legacy.unlock_at;
    expect(parseEntryDraft(JSON.stringify(legacy))).toEqual({
      ...valid,
      occurred_timezone: "",
      unlock_at: "",
    });
  });

  it("未知版本不会绕过 schema", () => {
    expect(
      parseEntryDraft(JSON.stringify({ version: 999, values: valid })),
    ).toBeNull();
  });
});
