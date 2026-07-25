import { describe, expect, it } from "vitest";
import {
  EMAIL_ALREADY_REGISTERED_NOTICE,
  EMAIL_CONFIRMATION_CONFIGURATION_MISMATCH_NOTICE,
  EMAIL_CONFIRMATION_NOTICE,
  EMAIL_POSSIBLY_REGISTERED_NOTICE,
  hasValidEmailIdentity,
  isDuplicateEmailError,
  resolveRegistrationOutcome,
} from "./registration";
import {
  parseRequireEmailConfirmation,
  TEST_REGISTRATION_NOTICE,
} from "./config";

describe("email confirmation configuration", () => {
  it("只在值严格等于 false 时启用免验证测试模式", () => {
    expect(parseRequireEmailConfirmation("false")).toBe(false);
    expect(parseRequireEmailConfirmation("true")).toBe(true);
    expect(parseRequireEmailConfirmation(undefined)).toBe(true);
    expect(parseRequireEmailConfirmation("FALSE")).toBe(true);
  });

  it("为免验证测试模式提供低干扰提示", () => {
    expect(TEST_REGISTRATION_NOTICE).toBe(
      "当前为小范围测试环境，注册后无需验证邮箱。",
    );
  });
});

describe("registration outcome", () => {
  const emailUser = {
    identities: [
      {
        provider: "email",
        identity_data: { email: "new@example.test" },
      },
    ],
  };

  it.each([true, false])(
    "返回 session 时立即进入登录状态（require confirmation: %s）",
    (confirmationRequired) => {
      expect(
        resolveRegistrationOutcome({
          hasSession: true,
          user: emailUser,
          emailConfirmationRequired: confirmationRequired,
        }),
      ).toEqual({
        kind: "signed-in",
        notice: null,
        shouldNavigate: true,
      });
    },
  );

  it("确认模式没有 session 时提示验证邮箱", () => {
    expect(resolveRegistrationOutcome({
      hasSession: false,
      user: emailUser,
      emailConfirmationRequired: true,
    })).toEqual({
      kind: "confirmation-required",
      notice: EMAIL_CONFIRMATION_NOTICE,
      shouldNavigate: false,
    });
  });

  it("测试模式没有 session 时提示 Dashboard 配置不一致", () => {
    expect(resolveRegistrationOutcome({
      hasSession: false,
      user: emailUser,
      emailConfirmationRequired: false,
    })).toEqual({
      kind: "configuration-mismatch",
      notice: EMAIL_CONFIRMATION_CONFIGURATION_MISMATCH_NOTICE,
      shouldNavigate: false,
    });
  });

  it("没有 session 且用户没有有效 email identity 时按模糊重复注册处理", () => {
    expect(resolveRegistrationOutcome({
      hasSession: false,
      user: { identities: [] },
      emailConfirmationRequired: false,
    })).toEqual({
      kind: "possibly-registered",
      notice: EMAIL_POSSIBLY_REGISTERED_NOTICE,
      shouldNavigate: false,
    });
  });

  it("只把真实 email identity 视为有效", () => {
    expect(hasValidEmailIdentity(emailUser)).toBe(true);
    expect(
      hasValidEmailIdentity({
        identities: [{ provider: "email", email: "new@example.test" }],
      }),
    ).toBe(true);
    expect(hasValidEmailIdentity({ identities: [] })).toBe(false);
    expect(
      hasValidEmailIdentity({
        identities: [{ provider: "email", identity_data: {} }],
      }),
    ).toBe(false);
  });
});

describe("duplicate email detection", () => {
  it.each([
    { code: "email_exists", status: 422 },
    { code: "user_already_exists", status: 422 },
    { status: 422, message: "User already registered" },
  ])("识别 Supabase 重复邮箱错误 %#", (error) => {
    expect(isDuplicateEmailError(error)).toBe(true);
    expect(EMAIL_ALREADY_REGISTERED_NOTICE).toContain("直接登录");
  });

  it("未知错误不会误判为重复邮箱", () => {
    expect(
      isDuplicateEmailError({
        code: "unexpected_failure",
        status: 500,
        message: "Database error saving new user",
      }),
    ).toBe(false);
  });
});
