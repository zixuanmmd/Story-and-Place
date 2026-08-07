import { describe, expect, it } from "vitest";
import { entryFormSchema } from "./entry";

const validEntry = {
  title: "夏天的火车站",
  content: "那天下午，我们在旧站台告别。",
  place_name: "旧火车站",
  latitude: 31.2304,
  longitude: 121.4737,
  time_precision: "date",
  time_value: "2008-07-15",
  occurred_timezone: "",
  visibility: "private",
  group_id: "",
  place_category_slug: "other",
  allow_comments: true,
  unlock_at: "",
};

describe("entryFormSchema", () => {
  it("接受合法记录", () => {
    expect(entryFormSchema.safeParse(validEntry).success).toBe(true);
  });

  it("拒绝空标题", () => {
    expect(entryFormSchema.safeParse({ ...validEntry, title: "   " }).success).toBe(false);
  });

  it("拒绝空内容", () => {
    expect(entryFormSchema.safeParse({ ...validEntry, content: "" }).success).toBe(false);
  });

  it("拒绝非法纬度", () => {
    expect(entryFormSchema.safeParse({ ...validEntry, latitude: 90.1 }).success).toBe(false);
  });

  it("拒绝非法经度", () => {
    expect(entryFormSchema.safeParse({ ...validEntry, longitude: -180.1 }).success).toBe(false);
  });

  it("拒绝非法可见性", () => {
    expect(entryFormSchema.safeParse({ ...validEntry, visibility: "friends" }).success).toBe(false);
  });

  it("拒绝非法时间精度", () => {
    expect(entryFormSchema.safeParse({ ...validEntry, time_precision: "season" }).success).toBe(false);
  });

  it("群组记录必须关联有效群组 ID", () => {
    expect(
      entryFormSchema.safeParse({
        ...validEntry,
        visibility: "group",
        group_id: "",
      }).success,
    ).toBe(false);
    expect(
      entryFormSchema.safeParse({
        ...validEntry,
        visibility: "group",
        group_id: "41000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(true);
  });

  it("拒绝不存在的地点分类", () => {
    expect(
      entryFormSchema.safeParse({
        ...validEntry,
        place_category_slug: "invented",
      }).success,
    ).toBe(false);
  });

  it("拒绝不存在的日期", () => {
    expect(entryFormSchema.safeParse({ ...validEntry, time_value: "2025-02-30" }).success).toBe(false);
  });

  it("接受不带虚假精确值的大致时间", () => {
    expect(
      entryFormSchema.safeParse({
        ...validEntry,
        time_precision: "approximate",
        time_value: "童年时期",
      }).success,
    ).toBe(true);
  });

  it.each([
    "2025-02-30T12:00",
    "2025-02-29T12:00",
    "2024-13-01T12:00",
    "2024-02-29T24:00",
    "2024-02-29T23:60",
  ])("拒绝非法精确时间 %s", (timeValue) => {
    expect(
      entryFormSchema.safeParse({
        ...validEntry,
        time_precision: "exact",
        time_value: timeValue,
      }).success,
    ).toBe(false);
  });

  it("接受合法闰年精确时间", () => {
    expect(
      entryFormSchema.safeParse({
        ...validEntry,
        time_precision: "exact",
        time_value: "2024-02-29T12:00",
        occurred_timezone: "Asia/Shanghai",
      }).success,
    ).toBe(true);
  });

  it("严格校验时间胶囊解锁时间", () => {
    expect(entryFormSchema.safeParse({
      ...validEntry,
      unlock_at: "2035-02-30T12:00",
    }).success).toBe(false);
    expect(entryFormSchema.safeParse({
      ...validEntry,
      unlock_at: "2035-01-01T12:00",
    }).success).toBe(true);
  });
});
