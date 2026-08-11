import { z } from "zod";
import { PLACE_CATEGORY_SLUGS, TIME_PRECISIONS, VISIBILITIES } from "@/lib/validation/entry";

const exportedTagSchema = z.object({
  name: z.string(),
  slug: z.string(),
  type: z.enum(["normal", "emotion", "theme", "character", "event"]),
  semantic_key: z.string().nullable(),
});

export const exportedEntrySchema = z.object({
  ownership: z.enum(["owner", "participant"]),
  id: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  place_name: z.string().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  occurred_at: z.string().nullable(),
  occurred_local: z.string().nullable(),
  occurred_timezone: z.string().nullable(),
  occurred_date: z.string().nullable(),
  occurred_year: z.number().int().nullable(),
  time_precision: z.enum(TIME_PRECISIONS),
  time_label: z.string(),
  visibility: z.enum(VISIBILITIES),
  group_id: z.string().uuid().nullable(),
  place_category_slug: z.enum(PLACE_CATEGORY_SLUGS),
  unlock_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  tags: z.array(exportedTagSchema),
});

const exportedRouteItemSchema = z.object({
  id: z.string().uuid(),
  entry_id: z.string().uuid(),
  position: z.number().int(),
  note: z.string(),
  relation_type: z.enum(["normal", "cause", "memory", "contrast", "turning_point"]),
  created_at: z.string(),
});

const exportedRouteSchema = z.object({
  id: z.string().uuid(),
  share_slug: z.string(),
  title: z.string(),
  description: z.string(),
  visibility: z.enum(VISIBILITIES),
  group_id: z.string().uuid().nullable(),
  published_at: z.string().nullable(),
  archived_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  items: z.array(exportedRouteItemSchema),
});

export const storyDataExportSchema = z.object({
  schema_version: z.literal(1),
  exported_at: z.string(),
  profile: z.object({
    id: z.string().uuid(),
    username: z.string(),
    display_name: z.string(),
    avatar_url: z.string().nullable(),
    bio: z.string().nullable(),
    created_at: z.string(),
  }),
  owned_entries: z.array(exportedEntrySchema),
  participant_entries: z.array(exportedEntrySchema),
  owned_routes: z.array(exportedRouteSchema),
});

export type StoryDataExport = z.infer<typeof storyDataExportSchema>;
export type ExportedEntry = z.infer<typeof exportedEntrySchema>;

const blockingGroupSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  role: z.enum(["owner", "admin"]),
});

export const accountDeletionImpactSchema = z.object({
  authenticated: z.literal(true),
  public_entries: z.number().int().nonnegative(),
  private_entries: z.number().int().nonnegative(),
  group_entries: z.number().int().nonnegative(),
  public_routes: z.number().int().nonnegative(),
  other_routes: z.number().int().nonnegative(),
  collaborations: z.number().int().nonnegative(),
  blocking_groups: z.array(blockingGroupSchema),
});

export type AccountDeletionImpact = z.infer<typeof accountDeletionImpactSchema>;

export const accountDeletionRequestSchema = z.object({
  mode: z.enum(["delete_all", "preserve_public"]),
  confirmation: z.literal("删除我的账号"),
});
