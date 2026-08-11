import { describe, expect, it } from "vitest";
import { getEntryShareDescription, getEntryShareUrl } from "./share";

describe("entry sharing", () => {
  it("builds a canonical entry path with the configured site URL", () => {
    expect(getEntryShareUrl(
      "3e6c9b0d-2277-4b0c-9e76-1a646a8dba22",
      "https://stories.example",
    )).toBe("https://stories.example/entries/3e6c9b0d-2277-4b0c-9e76-1a646a8dba22");
  });

  it("prefers a deployed origin over stale localhost configuration", () => {
    expect(getEntryShareUrl(
      "3e6c9b0d-2277-4b0c-9e76-1a646a8dba22",
      "http://localhost:3000",
      "https://preview.example",
    )).toBe("https://preview.example/entries/3e6c9b0d-2277-4b0c-9e76-1a646a8dba22");
  });

  it("normalizes and bounds a share excerpt", () => {
    const description = getEntryShareDescription("  很长的\n故事 ".repeat(30), "成都");
    expect(description.startsWith("成都｜很长的 故事")).toBe(true);
    expect(description.endsWith("…")).toBe(true);
    expect(description.length).toBeLessThanOrEqual(154);
  });
});
