import { z } from "zod";

export const profileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, "请输入显示名。")
    .max(80, "显示名不能超过 80 个字符。"),
  bio: z.string().trim().max(1000, "简介不能超过 1000 个字符。"),
  avatar_url: z
    .string()
    .trim()
    .max(2048, "头像链接过长。")
    .refine((value) => !value || /^https?:\/\//i.test(value), "头像链接必须以 http:// 或 https:// 开头。"),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
