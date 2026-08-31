import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const usageView = readFileSync(
  new URL("../../components/settings/usage-view.tsx", import.meta.url),
  "utf8",
);
const settingsView = readFileSync(
  new URL("../../components/settings/settings-view.tsx", import.meta.url),
  "utf8",
);

describe("commercial usage UI contract", () => {
  it("protects the page and clears account-scoped state before reloading", () => {
    expect(usageView).toContain('nextPath="/settings/usage"');
    expect(usageView).toContain("activeScope.current = dataScope");
    expect(usageView).toContain("state.scope === dataScope");
    expect(usageView).toContain("requestSequence.current += 1");
  });

  it("shows real usage limits without pretending payments are live", () => {
    expect(usageView).toContain("资源使用量");
    expect(usageView).toContain("套餐升级和真实支付尚未开放");
    expect(usageView).not.toContain("立即购买");
    expect(usageView).not.toContain("立即升级");
    expect(settingsView).toContain('href="/settings/usage"');
  });
});
