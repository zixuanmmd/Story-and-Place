import { afterEach, describe, expect, it, vi } from "vitest";
import { getFriendlyError, reportOperationalError } from "./errors";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("friendly error mapping", () => {
  it.each([
    [{ code: "invalid_credentials" }, "邮箱或密码不正确。"],
    [
      { code: "email_address_not_authorized" },
      "当前 Supabase 邮件服务不能向这个邮箱发送验证邮件。测试环境可以关闭 Confirm Email，正式环境需要配置自定义 SMTP。",
    ],
    [
      { code: "over_email_send_rate_limit" },
      "验证邮件发送次数过多，请稍后再试。",
    ],
    [
      { code: "email_exists" },
      "这个邮箱已经注册过了，请直接登录或使用其他邮箱。",
    ],
    [
      { code: "user_already_exists" },
      "这个邮箱已经注册过了，请直接登录或使用其他邮箱。",
    ],
    [{ code: "signup_disabled" }, "当前项目没有开启邮箱注册。"],
    [{ code: "email_provider_disabled" }, "当前项目没有开启邮箱注册。"],
    [{ code: "23514" }, "提交的数据不符合要求，请检查后重试。"],
    [{ code: "42501" }, "你没有权限执行这个操作。"],
    [{ code: "55000" }, "当前状态不允许这个操作，请刷新后重试。"],
    [{ code: "42P01" }, "数据库尚未完成最新升级，请联系项目维护者。"],
    [
      { code: "PGRST205" },
      "数据库功能尚未完成初始化，请联系项目维护者。",
    ],
    [{ status: 401 }, "登录状态已过期，请重新登录。"],
    [{ message: "Failed to fetch" }, "网络连接失败，请检查网络后重试。"],
  ])("把已知错误映射成安全中文提示", (error, expected) => {
    expect(getFriendlyError(error)).toBe(expected);
  });

  it("邮箱未确认错误根据当前前端模式提供不同提示", () => {
    expect(
      getFriendlyError({ code: "email_not_confirmed" }, undefined, {
        requireEmailConfirmation: false,
      }),
    ).toBe(
      "这个账户仍处于未确认状态。请检查 Supabase 的 Confirm Email 设置，或使用新的测试账户注册。",
    );
    expect(
      getFriendlyError({ code: "email_not_confirmed" }, undefined, {
        requireEmailConfirmation: true,
      }),
    ).toBe("请先完成邮箱验证，再登录。");
  });

  it.each([
    [
      { code: "23514", message: "published route requires at least two items" },
      "发布路线至少需要两个地点节点。",
    ],
    [
      { code: "42501", message: "one or more route items are not eligible" },
      "部分路线节点已无权使用，或与路线可见性不兼容。",
    ],
    [
      { code: "42501", message: "route cannot be edited" },
      "这条路线已归档，或你没有编辑权限。",
    ],
    [
      { code: "23514", message: "story route quota reached" },
      "故事线路数量已达到当前上限。你可以先归档不再使用的线路。",
    ],
    [
      { code: "23514", message: "story media storage quota reached" },
      "图片存储空间已达到当前上限。",
    ],
  ])("路线错误映射成不泄露数据库细节的提示", (error, expected) => {
    expect(getFriendlyError(error)).toBe(expected);
  });

  it("错误码优先于模糊的英文消息和状态码", () => {
    expect(
      getFriendlyError({
        code: "invalid_credentials",
        status: 429,
        message: "internal relation auth.users",
      }),
    ).toBe("邮箱或密码不正确。");
  });

  it("未知后端错误不暴露表名、SQL、约束或内部消息", () => {
    const technical =
      'relation "map_entries" violates constraint map_entries_private_sql';
    const result = getFriendlyError({ message: technical });
    expect(result).toBe("操作没有成功，请稍后重试。");
    expect(result).not.toContain("map_entries");
    expect(result).not.toContain("constraint");
  });

  it("允许调用方提供安全的场景文案", () => {
    expect(getFriendlyError({ message: "internal" }, "保存失败，请稍后重试。")).toBe(
      "保存失败，请稍后重试。",
    );
  });

  it("开发日志只记录白名单错误字段，不记录密码或 token", () => {
    const consoleWarning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    reportOperationalError(
      {
        code: "auth_failure",
        status: 400,
        message: "safe message",
        password: "never-log-this",
        access_token: "never-log-this",
        refresh_token: "never-log-this",
      },
      "auth:test",
    );

    expect(consoleWarning).toHaveBeenCalledTimes(1);
    const metadata = consoleWarning.mock.calls[0]?.[1];
    expect(metadata).toEqual({
      code: "auth_failure",
      status: 400,
      message: "safe message",
      details: undefined,
      hint: undefined,
    });
    expect(JSON.stringify(metadata)).not.toContain("never-log-this");
  });
});
