import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("请输入有效的邮箱地址。"),
  password: z.string().min(8, "密码至少需要 8 个字符。"),
});

export const registerSchema = loginSchema.extend({
  displayName: z
    .string()
    .trim()
    .min(1, "请输入显示名。")
    .max(80, "显示名不能超过 80 个字符。"),
});

// 登录请求不使用 displayName，但表单保留空字段以维持稳定的表单类型。
export const loginFormSchema = loginSchema.extend({
  displayName: z.string(),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
