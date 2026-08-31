import { z } from "zod";

export const featureFlagKeySchema = z.enum([
  "media_upload",
  "notifications",
  "subscriptions",
  "creator_features",
]);

export type FeatureFlagKey = z.infer<typeof featureFlagKeySchema>;

export const evaluatedFeatureFlagSchema = z.object({
  flag_key: z.string().min(2).max(64).regex(/^[a-z][a-z0-9_]+$/),
  enabled: z.boolean(),
});

export const defaultFeatureFlags: Record<FeatureFlagKey, boolean> = {
  media_upload: false,
  notifications: false,
  subscriptions: false,
  creator_features: false,
};

export function toFeatureFlagRecord(value: unknown) {
  const rows = z.array(evaluatedFeatureFlagSchema).parse(value);
  const flags = { ...defaultFeatureFlags };
  for (const row of rows) {
    if (Object.hasOwn(flags, row.flag_key)) {
      flags[row.flag_key as FeatureFlagKey] = row.enabled;
    }
  }
  return flags;
}
