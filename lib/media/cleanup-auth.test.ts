import { describe, expect, it } from "vitest";
import {
  isMediaCleanupRequestAuthorized,
  mediaCleanupSecretMatches,
} from "@/lib/media/cleanup-auth";

const mediaSecret = "m".repeat(64);
const cronSecret = "c".repeat(64);

describe("media cleanup authorization", () => {
  it("rejects missing, short and incorrect secrets", () => {
    expect(mediaCleanupSecretMatches(null, mediaSecret)).toBe(false);
    expect(mediaCleanupSecretMatches("short", "short")).toBe(false);
    expect(mediaCleanupSecretMatches("x".repeat(64), mediaSecret)).toBe(false);
  });

  it("accepts the controlled POST header only for POST", () => {
    const request = new Request("https://example.com/api/media/cleanup", {
      method: "POST",
      headers: { "x-media-cleanup-secret": mediaSecret },
    });
    expect(
      isMediaCleanupRequestAuthorized(request, {
        mediaCleanupSecret: mediaSecret,
        cronSecret,
      }),
    ).toBe(true);
  });

  it("accepts Vercel Cron bearer authentication only for GET", () => {
    const request = new Request("https://example.com/api/media/cleanup", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(
      isMediaCleanupRequestAuthorized(request, {
        mediaCleanupSecret: mediaSecret,
        cronSecret,
      }),
    ).toBe(true);
  });

  it("does not let the manual cleanup secret impersonate the cron", () => {
    const request = new Request("https://example.com/api/media/cleanup", {
      headers: { authorization: `Bearer ${mediaSecret}` },
    });
    expect(
      isMediaCleanupRequestAuthorized(request, {
        mediaCleanupSecret: mediaSecret,
        cronSecret,
      }),
    ).toBe(false);
  });
});
