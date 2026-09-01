import { describe, expect, it } from "vitest";
import { entryToFormValues, entryValuesToPayload } from "./entry";
import type { MapEntry } from "../../types/database";

const exactEntry: MapEntry = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  title: "凌晨的站台",
  content: "当地时间必须保持不变。",
  place_name: "车站",
  latitude: 31.2,
  longitude: 121.4,
  occurred_at: null,
  occurred_local: "2024-02-29T08:05",
  occurred_timezone: "Asia/Shanghai",
  occurred_date: "2024-02-29",
  occurred_year: 2024,
  time_precision: "exact",
  time_label: "2024 年 2 月 29 日 08:05",
  visibility: "private",
  group_id: "",
  place_category_slug: "other",
  allow_comments: true,
  unlock_at: null,
  featured_at: null,
  moderation_status: "active",
  moderated_at: null,
  moderated_by: null,
  moderation_reason: "",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("exact time roundtrip", () => {
  it("编辑往返不会根据查看者当前时区改变当地时间", () => {
    const formValues = entryToFormValues(exactEntry);
    expect(formValues.time_value).toBe("2024-02-29T08:05");
    expect(formValues.occurred_timezone).toBe("Asia/Shanghai");

    const payload = entryValuesToPayload(formValues);
    expect(payload.occurred_local).toBe("2024-02-29T08:05");
    expect(payload.occurred_timezone).toBe("Asia/Shanghai");
    expect("occurred_at" in payload).toBe(false);
  });

  it("旧记录不猜测时区，只使用可验证的旧显示文本", () => {
    const legacy = {
      ...exactEntry,
      occurred_at: "2024-02-29T00:05:00Z",
      occurred_local: null,
      occurred_timezone: null,
    };
    const values = entryToFormValues(legacy);
    expect(values.time_value).toBe("2024-02-29T08:05");
    expect(values.occurred_timezone).toBe("");
  });
});
