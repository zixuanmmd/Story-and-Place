import { z } from "zod";

export const routeSelectionDraftSchema = z.object({
  version: z.literal(1),
  entryIds: z.array(z.string().uuid()).max(200),
});

export const storyRouteItemSchema = z.object({
  entry_id: z.string().uuid(),
  position: z.number().int().min(1).max(200),
  note: z.string().max(500),
});

export const storyRouteSchema = z.object({
  id: z.string().uuid().nullable(),
  title: z.string().trim().min(1, "请填写路线标题。").max(100, "路线标题最多 100 个字符。"),
  description: z.string().max(2000, "路线说明最多 2000 个字符。"),
  visibility: z.enum(["public", "private", "group"]),
  group_id: z.string().uuid().nullable(),
  publish: z.boolean(),
  items: z.array(storyRouteItemSchema).min(1, "请至少选择一个故事节点。").max(200, "一条路线最多包含 200 个节点。"),
}).superRefine((value, context) => {
  if ((value.visibility === "group") !== Boolean(value.group_id)) {
    context.addIssue({ code: "custom", path: ["group_id"], message: "群组路线必须选择一个群组。" });
  }
  if (value.publish && value.items.length < 2) {
    context.addIssue({ code: "custom", path: ["items"], message: "发布路线至少需要两个节点。" });
  }
  if (new Set(value.items.map((item) => item.entry_id)).size !== value.items.length) {
    context.addIssue({ code: "custom", path: ["items"], message: "同一条记录不能重复加入路线。" });
  }
  if (new Set(value.items.map((item) => item.position)).size !== value.items.length) {
    context.addIssue({ code: "custom", path: ["items"], message: "路线节点顺序不能重复。" });
  }
});

export type StoryRouteValues = z.infer<typeof storyRouteSchema>;

export function parseRouteSelectionDraft(raw: string | null) {
  if (!raw) return [];
  try {
    const result = routeSelectionDraftSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data.entryIds : [];
  } catch {
    return [];
  }
}
