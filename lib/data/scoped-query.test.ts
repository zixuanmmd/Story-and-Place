import { describe, expect, it } from "vitest";
import {
  createScopedQueryState,
  getRenderableSelectedEntry,
  getRenderableEntries,
  scopedQueryReducer,
  type ScopedQueryState,
} from "./scoped-query";

type TestEntry = {
  id: string;
  user_id: string;
  visibility: "public" | "private" | "group";
};

const privateA: TestEntry = {
  id: "private-a",
  user_id: "user-a",
  visibility: "private",
};
const privateB: TestEntry = {
  id: "private-b",
  user_id: "user-b",
  visibility: "private",
};

function loaded(scope: string, entry: TestEntry, requestId = 1) {
  let state = createScopedQueryState<TestEntry>(scope);
  state = scopedQueryReducer(state, {
    type: "request-started",
    scope,
    requestId,
  });
  return scopedQueryReducer(state, {
    type: "request-succeeded",
    scope,
    requestId,
    result: { entries: [entry], truncated: false },
  });
}

describe("scoped query privacy isolation", () => {
  it("退出后立即隐藏 A 的私密数据，匿名查询失败也不会恢复", () => {
    const accountA = loaded("user-a", privateA);
    expect(getRenderableEntries(accountA, "anon")).toEqual([]);

    let anonymous = scopedQueryReducer(accountA, {
      type: "scope-changed",
      scope: "anon",
    });
    anonymous = scopedQueryReducer(anonymous, {
      type: "request-started",
      scope: "anon",
      requestId: 2,
    });
    anonymous = scopedQueryReducer(anonymous, {
      type: "request-failed",
      scope: "anon",
      requestId: 2,
      error: "匿名查询失败",
    });

    expect(anonymous.entries).toEqual([]);
    expect(getRenderableEntries(anonymous, "anon")).toEqual([]);
  });

  it("从 A 切换到 B 时不渲染 A 的记录", () => {
    const accountA = loaded("user-a", privateA);
    expect(getRenderableEntries(accountA, "user-b")).toEqual([]);

    const accountB = scopedQueryReducer(accountA, {
      type: "scope-changed",
      scope: "user-b",
    });
    expect(accountB.entries).toEqual([]);
  });

  it("A 的旧请求晚于 B 返回时不能覆盖 B", () => {
    let state: ScopedQueryState<TestEntry> = createScopedQueryState("user-a");
    state = scopedQueryReducer(state, {
      type: "request-started",
      scope: "user-a",
      requestId: 1,
    });
    state = scopedQueryReducer(state, { type: "scope-changed", scope: "user-b" });
    state = scopedQueryReducer(state, {
      type: "request-started",
      scope: "user-b",
      requestId: 2,
    });
    state = scopedQueryReducer(state, {
      type: "request-succeeded",
      scope: "user-b",
      requestId: 2,
      result: { entries: [privateB], truncated: false },
    });
    state = scopedQueryReducer(state, {
      type: "request-succeeded",
      scope: "user-a",
      requestId: 1,
      result: { entries: [privateA], truncated: false },
    });

    expect(getRenderableEntries(state, "user-b")).toEqual([privateB]);
  });

  it("身份不匹配的数据永远不参与渲染", () => {
    expect(getRenderableEntries(loaded("user-a", privateA), "user-b")).toEqual([]);
    expect(getRenderableEntries(loaded("user-a", privateA), "anon")).toEqual([]);
  });

  it("退出后已选中的私密详情立即关闭", () => {
    expect(getRenderableSelectedEntry(privateA, "user-a")).toBe(privateA);
    expect(getRenderableSelectedEntry(privateA, null)).toBeNull();
    expect(getRenderableSelectedEntry(privateA, "user-b")).toBeNull();
  });

  it("accepted 私密参与者可以渲染已由数据库授权的选中记录", () => {
    expect(getRenderableSelectedEntry(privateA, "user-b", true)).toBe(privateA);
    expect(getRenderableSelectedEntry(privateA, null, true)).toBeNull();
  });

  it("退出后已选中的群组详情立即关闭", () => {
    const groupEntry: TestEntry = {
      id: "group-a",
      user_id: "user-a",
      visibility: "group",
    };
    expect(getRenderableSelectedEntry(groupEntry, "user-b")).toBe(groupEntry);
    expect(getRenderableSelectedEntry(groupEntry, null)).toBeNull();
  });
});
