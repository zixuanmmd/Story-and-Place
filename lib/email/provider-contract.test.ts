import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const providerSource = readFileSync(
  new URL("./provider.ts", import.meta.url),
  "utf8",
);

describe("notification email provider contract", () => {
  it("stays server-only and does not pretend the development stub sent email", () => {
    expect(providerSource).toContain('import "server-only"');
    expect(providerSource).toContain('status: "skipped"');
    expect(providerSource).toContain('reason: "provider_not_configured"');
    expect(providerSource).not.toContain("console.log");
    expect(providerSource).not.toContain("NEXT_PUBLIC_");
  });
});
