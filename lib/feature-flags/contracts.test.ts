import { describe, expect, it } from "vitest";
import {
  defaultFeatureFlags,
  toFeatureFlagRecord,
} from "@/lib/feature-flags/contracts";

describe("feature flag contracts", () => {
  it("defaults every local feature to safely disabled", () => {
    expect(defaultFeatureFlags).toEqual({
      media_upload: false,
      notifications: false,
      subscriptions: false,
      creator_features: false,
    });
  });

  it("maps evaluated booleans and ignores future well-formed keys", () => {
    expect(toFeatureFlagRecord([
      { flag_key: "media_upload", enabled: true },
      { flag_key: "future_feature", enabled: true },
    ])).toEqual({
      ...defaultFeatureFlags,
      media_upload: true,
    });
  });

  it("rejects malformed database output", () => {
    expect(() => toFeatureFlagRecord([
      { flag_key: "../../token", enabled: true },
    ])).toThrow();
  });
});
