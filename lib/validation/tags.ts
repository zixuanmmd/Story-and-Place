import { z } from "zod";
import type { MapEntryWithProfile, Tag, TagType } from "@/types/database";

export const MAX_ENTRY_TAGS = 10;
export const MAX_TAG_LENGTH = 40;

export const tagTypeSchema = z.enum([
  "normal",
  "emotion",
  "theme",
  "character",
  "event",
]);

export const emotionSemanticKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(48)
  .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, "情绪标识格式无效。");

export const TAG_TYPE_OPTIONS: ReadonlyArray<{
  value: TagType;
  label: string;
}> = [
  { value: "normal", label: "普通" },
  { value: "emotion", label: "情绪" },
  { value: "theme", label: "主题" },
  { value: "character", label: "人物" },
  { value: "event", label: "事件" },
];

export function getTagTypeLabel(type: TagType) {
  return TAG_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? "普通";
}

export function getTagHref(
  tag: Pick<Tag, "slug" | "type" | "semantic_key">,
) {
  return tag.type === "emotion" && tag.semantic_key
    ? `/emotions/${tag.semantic_key}`
    : `/tags/${tag.slug}`;
}

export const tagInputSchema = z
  .string()
  .max(500, "标签输入过长。")
  .transform((value, context) => {
    const names = value
      .split(/[,，\n]+/)
      .map((name) => name.trim().replace(/^#+/, "").trim().replace(/\s+/g, " "))
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
