import { describe, expect, it } from "vitest";
import { passwordRecoverySchema, passwordResetSchema } from "@/lib/validation/auth";

describe("password recovery validation", () => {
  it("要求有效邮箱", () => {
    expect(passwordRecoverySchema.safeParse({ email: "person@example.com" }).success).toBe(true);
    expect(passwordRecoverySchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("要求至少八位且两次密码一致", () => {
    expect(passwordResetSchema.safeParse({
      password: "new-password-123",
      confirmPassword: "new-password-123",
    }).success).toBe(true);
    expect(passwordResetSchema.safeParse({
      password: "short",
      confirmPassword: "short",
    }).success).toBe(false);
    expect(passwordResetSchema.safeParse({
      password: "new-password-123",
      confirmPassword: "another-password",
    }).success).toBe(false);
  });
});
