import { describe, expect, it } from "vitest";
import { getFriendlyError } from "./errors";

describe("friendly error mapping", () => {
  it.each([
    [{ code: "invalid_credentials" }, "邮箱或密码不正确。"],
    [{ code: "23514" }, "提交的数据不符合要求，请检查后重试。"],
    [{ code: "42501" }, "你没有权限执行这个操作。"],
    [{ code: "55000" }, "当前状态不允许这个操作，请刷新后重试。"],
    [{ code: "42P01" }, "数据库尚未完成最新升级，请联系项目维护者。"],
    [{ status: 401 }, "登录状态已过期，请重新登录。"],
    [{ message: "Failed to fetch" }, "网络连接失败，请检查网络后重试。"],
  ])("把已知错误映射成安全中文提示", (error, expected) => {
    expect(getFriendlyError(error)).toBe(expected);
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
});
