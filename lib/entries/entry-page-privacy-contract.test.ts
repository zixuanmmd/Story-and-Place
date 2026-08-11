import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  new URL("../../app/entries/[id]/page.tsx", import.meta.url),
  "utf8",
);

describe("independent entry page privacy contract", () => {
  it("generates public metadata only for public and unlocked stories", () => {
    expect(pageSource).toContain('.eq("visibility", "public")');
    expect(pageSource).toContain("unlock_at.is.null,unlock_at.lte.");
    expect(pageSource).toContain("robots: { index: false, follow: false }");
  });

  it("does not place private fallback content in metadata", () => {
    expect(pageSource).toContain("一个受权限保护的地点故事。");
    expect(pageSource).not.toContain("service_role");
  });
});
