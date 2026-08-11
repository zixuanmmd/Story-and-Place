import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("launch metadata routes", () => {
  it("keeps private account surfaces out of crawler paths", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const disallowed = rules.flatMap((rule) =>
      Array.isArray(rule.disallow) ? rule.disallow : rule.disallow ? [rule.disallow] : [],
    );

    expect(disallowed).toContain("/settings");
    expect(disallowed).toContain("/my-records");
    expect(disallowed).toContain("/entry-invitations");
    expect(result.sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it("publishes only stable, public discovery routes in the static sitemap", () => {
    const paths = sitemap().map((item) => new URL(item.url).pathname);

    expect(paths).toEqual(["/", "/explore", "/search", "/tags", "/groups"]);
    expect(paths).not.toContain("/settings");
    expect(paths).not.toContain("/my-records");
  });
});
