import { z } from "zod";

export const groupFormSchema = z.object({
  name: z.string().trim().min(1, "请输入群组名称。").max(80, "群组名称不能超过 80 个字符。"),
  slug: z
    .string()
    .trim()
    .min(3, "群组地址至少需要 3 个字符。")
    .max(48, "群组地址不能超过 48 个字符。")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "只能使用小写字母、数字和单个连字符。"),
  description: z.string().trim().max(2000, "群组简介不能超过 2000 个字符。"),
  avatar_url: z
    .union([z.literal(""), z.url("请输入有效的头像网址。")])
    .refine((value) => value.length <= 2048, "头像网址过长。"),
  visibility: z.enum(["public", "private"]),
});

export type GroupFormValues = z.infer<typeof groupFormSchema>;

