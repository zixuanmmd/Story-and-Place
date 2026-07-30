import { z } from "zod";
import type { MapEntryWithProfile } from "@/types/database";

export const MAX_ENTRY_TAGS = 10;
export const MAX_TAG_LENGTH = 40;

export const tagInputSchema = z
  .string()
  .max(500, "标签输入过长。")
  .transform((value, context) => {
    const names = value
      .split(/[,，\n]+/)
      .map((name) => name.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    const unique = new Map<string, string>();
    for (const name of names) {
      if (name.length > MAX_TAG_LENGTH) {
        context.addIssue({
          code: "custom",
          message: `单个标签不能超过 ${MAX_TAG_LENGTH} 个字符。`,
        });
        return z.NEVER;
      }
      unique.set(name.toLocaleLowerCase("zh-CN"), name);
    }
    if (unique.size > MAX_ENTRY_TAGS) {
      context.addIssue({
        code: "custom",
        message: `每条记录最多添加 ${MAX_ENTRY_TAGS} 个标签。`,
      });
      return z.NEVER;
    }
    return [...unique.values()];
  });

export function parseTagInput(value: string) {
  return tagInputSchema.parse(value);
}

export function getEntryTagNames(entry: MapEntryWithProfile) {
  return (entry.entry_tags ?? [])
    .map((entryTag) => entryTag.tags?.name)
    .filter((name): name is string => Boolean(name));
}

export function formatEntryTagInput(entry: MapEntryWithProfile) {
  return getEntryTagNames(entry).join("，");
}
