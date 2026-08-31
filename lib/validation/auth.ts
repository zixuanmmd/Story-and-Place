import { z } from "zod";
import {
  isDisplayNameLengthValid,
  normalizeDisplayNameForStorage,
} from "@/lib/profile/display-name";

export const loginSchema = z.object({
  email: z.email("请输入有效的邮箱地址。"),
  password: z.string().min(8, "密码至少需要 8 个字符。"),
});

export const passwordRecoverySchema = z.object({
  email: z.email("请输入有效的邮箱地址。"),
});

export const passwordResetSchema = z
  .object({
    password: z.string().min(8, "密码至少需要 8 个字符。"),
    confirmPassword: z.string().min(1, "请再次输入新密码。"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "两次输入的密码不一致。",
    path: ["confirmPassword"],
  });

export const registerSchema = loginSchema.extend({
  displayName: z
    .string()
    .refine(
      (value) => normalizeDisplayNameForStorage(value).length > 0,
      "请输入显示名。",
    )
    .refine(
      (value) => isDisplayNameLengthValid(value),
      "显示名不能超过 80 个字符。",
    ),
});

// 登录请求不使用 displayName，但表单保留空字段以维持稳定的表单类型。
export const loginFormSchema = loginSchema.extend({
  displayName: z.string(),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type PasswordRecoveryValues = z.infer<typeof passwordRecoverySchema>;
export type PasswordResetValues = z.infer<typeof passwordResetSchema>;
