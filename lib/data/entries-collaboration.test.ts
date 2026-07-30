import { describe, expect, it } from "vitest";
import { getEntryUpdatePatch } from "@/lib/data/entries";
import type { EntryFormValues } from "@/lib/validation/entry";

const values: EntryFormValues = {
  title: "新的标题",
  content: "新的内容",
  place_name: "旧城",
  latitude: 31.23,
  longitude: 121.47,
  time_precision: "date",
  time_value: "2026-07-29",
  occurred_timezone: "",
  visibility: "group",
  group_id: "5b35cb8a-b1c3-4a63-8125-465d4c8f6efe",
  place_category_slug: "other",
  allow_comments: false,
};

describe("getEntryUpdatePatch", () => {
  it("keeps the owner's complete controlled payload", () => {
    expect(getEntryUpdatePatch(values)).toMatchObject({
      title: "新的标题",
      visibility: "group",
      group_id: values.group_id,
      allow_comments: false,
    });
  });

  it("sends only a participant's delegated field groups", () => {
    expect(getEntryUpdatePatch(values, ["content", "location"])).toEqual({
      content: "新的内容",
      latitude: 31.23,
      longitude: 121.47,
    });
  });

  it("never maps tag permission to map_entries access fields", () => {
    expect(getEntryUpdatePatch(values, ["tags"])).toEqual({});
  });
});
