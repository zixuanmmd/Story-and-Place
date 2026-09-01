import { describe, expect, it } from "vitest";
import {
  commercialAccessRowSchema,
  toCommercialAccess,
} from "@/lib/validation/commercial";

const validRow = {
  plan_code: "free",
  plan_name: "Free",
  plan_description: "基础能力",
  subscription_status: null,
  current_period_end: null,
  can_upload_media: true,
  max_storage_bytes: 524288000,
  max_media_files: 1000,
  max_story_routes: 100,
  advanced_export: true,
  story_count: 3,
  active_route_count: 2,
  storage_bytes: 1024,
  media_file_count: 1,
};

describe("commercial access validation", () => {
  it("validates and converts the database result", () => {
    const parsed = commercialAccessRowSchema.parse(validRow);
    expect(toCommercialAccess(parsed)).toMatchObject({
      plan: { code: "free", name: "Free" },
      subscription: null,
      entitlements: { maxStoryRoutes: 100, canUploadMedia: true },
      usage: { storyCount: 3, storageBytes: 1024 },
    });
  });

  it("rejects negative usage and unknown subscription states", () => {
    expect(() => commercialAccessRowSchema.parse({
      ...validRow,
      storage_bytes: -1,
    })).toThrow();
    expect(() => commercialAccessRowSchema.parse({
      ...validRow,
      subscription_status: "unknown",
    })).toThrow();
  });
});
