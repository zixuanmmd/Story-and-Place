import { describe, expect, it } from "vitest";
import {
  createEntryDraftPayload,
  draftPayloadToFormValues,
  entryDraftPayloadSchema,
  parseEntryDraftPayload,
} from "./entry-draft";
import type { EntryFormValues } from "./entry";

const values: EntryFormValues = {
  title: "尚未写完的故事",
  content: "先保存在这里。",
  place_name: "人民公园",
  latitude: 30.66,
  longitude: 104.06,
  time_precision: "year",
  time_value: "2026",
  occurred_timezone: "",
  visibility: "private",
  group_id: "",
  place_category_slug: "nature",
  allow_comments: true,
  unlock_at: "",
};

describe("entry draft payload", () => {
  it("以版本化结构无损往返完整表单", () => {
    const payload = createEntryDraftPayload(values);
    expect(parseEntryDraftPayload(payload)).toEqual(payload);
    expect(draftPayloadToFormValues(payload, { latitude: 0, longitude: 0 })).toEqual(values);
  });

  it("把表单输入过程中的 NaN 坐标安全保存为 null", () => {
    const payload = createEntryDraftPayload({ ...values, latitude: Number.NaN });
    expect(payload.values.latitude).toBeNull();
    expect(draftPayloadToFormValues(payload, { latitude: 25, longitude: 15 }).latitude).toBe(25);
  });

  it("拒绝旧版本、缺失字段和额外字段", () => {
    expect(parseEntryDraftPayload({ version: 2, values: {} })).toBeNull();
    expect(entryDraftPayloadSchema.safeParse({ version: 1, values: { title: "x" } }).success).toBe(false);
    expect(entryDraftPayloadSchema.safeParse({ ...createEntryDraftPayload(values), secret: true }).success).toBe(false);
  });

  it("草稿允许尚未完成的必填文字，但继续限制长度和坐标", () => {
    expect(entryDraftPayloadSchema.safeParse(createEntryDraftPayload({ ...values, title: "", content: "" })).success).toBe(true);
    expect(entryDraftPayloadSchema.safeParse({
      ...createEntryDraftPayload(values),
      values: { ...createEntryDraftPayload(values).values, latitude: 91 },
    }).success).toBe(false);
  });
});
