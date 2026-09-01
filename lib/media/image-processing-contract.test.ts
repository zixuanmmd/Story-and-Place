import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./image-processing.ts", import.meta.url),
  "utf8",
);

describe("server image processing privacy contract", () => {
  it("normalizes orientation, rejects animation and emits WebP variants", () => {
    expect(source).toContain("(metadata.pages ?? 1) > 1");
    expect(source.match(/\.rotate\(\)/g)).toHaveLength(2);
    expect(source.match(/\.webp\(/g)).toHaveLength(2);
    expect(source).toContain("limitInputPixels: MAX_INPUT_PIXELS");
  });

  it("does not copy source metadata into either output", () => {
    expect(source).not.toContain("withMetadata");
    expect(source).not.toContain("keepExif");
    expect(source).not.toContain("withExif");
  });
});
