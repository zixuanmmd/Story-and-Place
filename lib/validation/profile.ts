import { z } from "zod";
import {
  isDisplayNameLengthValid,
  normalizeDisplayNameForStorage,
} from "@/lib/profile/display-name";

export const profileSchema = z.object({
  display_name: z
    .string()
    .refine(
      (value) => normalizeDisplayNameForStorage(value).length > 0,
      "请输入显示名。",
    )
    .refine(
      (value) => isDisplayNameLengthValid(value),
      "显示名不能超过 80 个字符。",
    ),
  bio: z.string().trim().max(1000, "简介不能超过 1000 个字符。"),
  avatar_url: z
    .string()
    .trim()
    .max(2048, "头像链接过长。")
    .refine(
      (value) => !value || /^https:\/\//i.test(value),
      "头像链接必须使用 https:// 安全地址。",
    ),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
