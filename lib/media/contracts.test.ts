import { describe, expect, it } from "vitest";
import {
  detectImageMime,
  mediaListResponseSchema,
  STORY_MEDIA_MAX_FILES,
  STORY_MEDIA_MAX_SOURCE_BYTES,
} from "@/lib/media/contracts";

describe("story media contracts", () => {
  it("detects JPEG, PNG and WebP by magic bytes instead of extensions", () => {
    expect(detectImageMime(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(detectImageMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectImageMime(Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50,
    ]))).toBe("image/webp");
    expect(detectImageMime(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull();
  });

  it("keeps the public limits explicit", () => {
    expect(STORY_MEDIA_MAX_FILES).toBe(10);
    expect(STORY_MEDIA_MAX_SOURCE_BYTES).toBe(4 * 1024 * 1024);
  });

  it("rejects malformed signed media responses", () => {
    expect(mediaListResponseSchema.safeParse({ assets: [{ id: "not-a-uuid" }], usage: null }).success).toBe(false);
    expect(mediaListResponseSchema.safeParse({ assets: [], usage: null }).success).toBe(true);
  });
});
