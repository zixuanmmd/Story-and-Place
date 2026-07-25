export const TEST_REGISTRATION_NOTICE =
  "当前为小范围测试环境，注册后无需验证邮箱。";

export function parseRequireEmailConfirmation(value: string | undefined) {
  return value !== "false";
}

export const requireEmailConfirmation = parseRequireEmailConfirmation(
  process.env.NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION,
);
