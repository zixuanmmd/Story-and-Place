import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const socialSource = readFileSync(
  new URL("../../components/social/entry-social.tsx", import.meta.url),
  "utf8",
);
const detailSource = readFileSync(
  new URL("../../components/entries/entry-detail.tsx", import.meta.url),
  "utf8",
);

describe("记录社交状态隔离契约", () => {
  it("使用请求序号拒绝旧记录的晚到响应", () => {
    expect(socialSource).toContain("loadRequestSequence");
    expect(socialSource).toContain(
      "loadRequestSequence.current !== requestId",
    );
  });

  it("记录切换时重新挂载社交状态", () => {
    expect(detailSource).toContain(
      '<EntrySocial key={entry.id} entry={entry} />',
    );
  });
});
