import { z } from "zod";

export const STORY_MEDIA_BUCKET = "story-media";
export const STORY_MEDIA_MAX_FILES = 10;
export const STORY_MEDIA_MAX_SOURCE_BYTES = 4 * 1024 * 1024;
export const STORY_MEDIA_SIGNED_URL_SECONDS = 300;

export const sourceImageMimeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type SourceImageMime = z.infer<typeof sourceImageMimeSchema>;

export const mediaAssetViewSchema = z.object({
  id: z.string().uuid(),
  entryId: z.string().uuid(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sizeBytes: z.number().int().positive(),
  sortOrder: z.number().int().min(0).max(9),
  isCover: z.boolean(),
  fullUrl: z.string().url(),
  thumbnailUrl: z.string().url(),
  createdAt: z.string(),
});

export const mediaUsageSchema = z.object({
  usedBytes: z.number().int().nonnegative(),
  quotaBytes: z.number().int().positive(),
  fileCount: z.number().int().nonnegative(),
});

export const mediaListResponseSchema = z.object({
  assets: z.array(mediaAssetViewSchema).max(STORY_MEDIA_MAX_FILES),
  usage: mediaUsageSchema.nullable(),
});

export type MediaAssetView = z.infer<typeof mediaAssetViewSchema>;
export type MediaUsage = z.infer<typeof mediaUsageSchema>;

export function detectImageMime(bytes: Uint8Array): SourceImageMime | null {
  if (
    bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff
  ) return "image/jpeg";
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) return "image/png";
  if (
    bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  ) return "image/webp";
  return null;
}
