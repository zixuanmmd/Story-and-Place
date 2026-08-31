import { z } from "zod";

export const subscriptionStatusSchema = z.enum([
  "trialing",
  "active",
  "past_due",
  "canceled",
]);

export const commercialAccessRowSchema = z.object({
  plan_code: z.string().min(1).max(32),
  plan_name: z.string().min(1).max(80),
  plan_description: z.string().max(500),
  subscription_status: subscriptionStatusSchema.nullable(),
  current_period_end: z.string().nullable(),
  can_upload_media: z.boolean(),
  max_storage_bytes: z.number().int().nonnegative(),
  max_media_files: z.number().int().nonnegative(),
  max_story_routes: z.number().int().nonnegative(),
  advanced_export: z.boolean(),
  story_count: z.number().int().nonnegative(),
  active_route_count: z.number().int().nonnegative(),
  storage_bytes: z.number().int().nonnegative(),
  media_file_count: z.number().int().nonnegative(),
});

export type CommercialAccessRow = z.infer<typeof commercialAccessRowSchema>;

export type CommercialAccess = {
  plan: {
    code: string;
    name: string;
    description: string;
  };
  subscription: {
    status: z.infer<typeof subscriptionStatusSchema>;
    currentPeriodEnd: string | null;
  } | null;
  entitlements: {
    canUploadMedia: boolean;
    maxStorageBytes: number;
    maxMediaFiles: number;
    maxStoryRoutes: number;
    advancedExport: boolean;
  };
  usage: {
    storyCount: number;
    activeRouteCount: number;
    storageBytes: number;
    mediaFileCount: number;
  };
};

export function toCommercialAccess(row: CommercialAccessRow): CommercialAccess {
  return {
    plan: {
      code: row.plan_code,
      name: row.plan_name,
      description: row.plan_description,
    },
    subscription: row.subscription_status
      ? {
          status: row.subscription_status,
          currentPeriodEnd: row.current_period_end,
        }
      : null,
    entitlements: {
      canUploadMedia: row.can_upload_media,
      maxStorageBytes: row.max_storage_bytes,
      maxMediaFiles: row.max_media_files,
      maxStoryRoutes: row.max_story_routes,
      advancedExport: row.advanced_export,
    },
    usage: {
      storyCount: row.story_count,
      activeRouteCount: row.active_route_count,
      storageBytes: row.storage_bytes,
      mediaFileCount: row.media_file_count,
    },
  };
}
