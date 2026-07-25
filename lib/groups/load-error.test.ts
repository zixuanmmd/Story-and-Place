import { describe, expect, it } from "vitest";
import {
  classifyGroupLoadError,
  getGroupDirectoryViewMode,
} from "./load-error";

describe("group loading error classification", () => {
  it.each(["42P01", "42883", "PGRST202", "PGRST205"])(
    "把 %s 识别为数据库未初始化",
    (code) => {
      expect(classifyGroupLoadError({ code }).kind).toBe("initialization");
    },
  );

  it("区分关系、权限、登录状态、网络和未知错误", () => {
    expect(classifyGroupLoadError({ code: "PGRST200" }).kind).toBe(
      "relationship",
    );
    expect(classifyGroupLoadError({ code: "42501" }).kind).toBe("permission");
    expect(classifyGroupLoadError({ status: 401 }).kind).toBe("session");
    expect(
      classifyGroupLoadError({ message: "Failed to fetch" }).kind,
    ).toBe("network");
    expect(classifyGroupLoadError({ code: "unexpected" }).kind).toBe(
      "unknown",
    );
  });

  it("失败状态与空数据内容互斥", () => {
    const error = classifyGroupLoadError({ code: "42501" });
    expect(getGroupDirectoryViewMode(true, error)).toBe("loading");
    expect(getGroupDirectoryViewMode(false, error)).toBe("error");
    expect(getGroupDirectoryViewMode(false, null)).toBe("content");
  });
});
