import { z } from "zod";

export const commentSchema = z.object({
  content: z.string().trim().min(1, "评论不能为空。").max(1000, "评论不能超过 1000 个字符。"),
});

export const reportSchema = z.object({
  target_type: z.enum(["entry", "comment", "user", "group"]),
  target_id: z.uuid(),
  reason: z.enum(["spam", "harassment", "hate", "privacy", "misinformation", "other"]),
  description: z.string().trim().max(1000, "补充说明不能超过 1000 个字符。"),
});

export type CommentValues = z.infer<typeof commentSchema>;
export type ReportValues = z.infer<typeof reportSchema>;
