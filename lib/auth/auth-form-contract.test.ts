import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authForm = readFileSync(
  new URL("../../components/auth/auth-form.tsx", import.meta.url),
  "utf8",
);
const settingsView = readFileSync(
  new URL("../../components/settings/settings-view.tsx", import.meta.url),
  "utf8",
);

describe("registration UI contracts", () => {
  it("注册和设置页共用数据库昵称可用性 RPC", () => {
    expect(authForm).toContain("isDisplayNameAvailable(displayName)");
    expect(settingsView).toContain("isDisplayNameAvailable(displayName)");
  });

  it("重复邮箱保留邮箱、清空密码并提供登录入口", () => {
    expect(authForm).toContain('form.resetField("password"');
    expect(authForm).toContain("getAuthPageHref(");
    expect(authForm).toContain('form.getValues("email")');
    expect(authForm).toContain("前往登录");
    expect(authForm).not.toMatch(
      /(localStorage|sessionStorage).*password|password.*(localStorage|sessionStorage)/,
    );
  });

  it("注册前先检查昵称，再调用邮箱密码 signUp", () => {
    expect(authForm.indexOf("isDisplayNameAvailable(displayName)")).toBeLessThan(
      authForm.indexOf("supabase.auth.signUp"),
    );
  });
});
