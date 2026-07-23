import { describe, expect, it } from "vitest";
import { settleAction } from "./settle-action";

describe("settleAction", () => {
  it("保存失败被转换为结果，不产生未处理的 Promise rejection", async () => {
    const failure = new Error("technical backend detail");
    await expect(
      settleAction(async () => {
        throw failure;
      }),
    ).resolves.toEqual({ ok: false, error: failure });
  });
});
