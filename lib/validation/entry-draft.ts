import { z } from "zod";
import { PLACE_CATEGORY_SLUGS, TIME_PRECISIONS, VISIBILITIES } from "@/lib/validation/entry";
import type { EntryDraft, Json } from "@/types/database";
import type { EntryFormValues } from "@/lib/validation/entry";

const draftValuesSchema = z.object({
  title: z.string().max(100),
  content: z.string().max(5000),
  place_name: z.string().max(200),
  latitude: z.number().finite().min(-90).max(90).nullable(),
  longitude: z.number().finite().min(-180).max(180).nullable(),
  time_precision: z.enum(TIME_PRECISIONS),
  time_value: z.string().max(120),
  occurred_timezone: z.string().max(100),
  visibility: z.enum(VISIBILITIES),
  group_id: z.string().max(36),
  place_category_slug: z.enum(PLACE_CATEGORY_SLUGS),
  allow_comments: z.boolean(),
  unlock_at: z.string().max(32),
}).strict();

export const entryDraftPayloadSchema = z.object({
  version: z.literal(1),
  values: draftValuesSchema,
}).strict();

export type EntryDraftPayload = z.infer<typeof entryDraftPayloadSchema>;

export function createEntryDraftPayload(values: EntryFormValues): EntryDraftPayload {
  return {
    version: 1,
    values: {
      ...values,
      latitude: Number.isFinite(values.latitude) ? values.latitude : null,
      longitude: Number.isFinite(values.longitude) ? values.longitude : null,
    },
  };
}

export function parseEntryDraftPayload(value: Json | null): EntryDraftPayload | null {
  const parsed = entryDraftPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function draftPayloadToFormValues(
  payload: EntryDraftPayload,
  fallback: Pick<EntryFormValues, "latitude" | "longitude">,
): EntryFormValues {
  return {
    ...payload.values,
    latitude: payload.values.latitude ?? fallback.latitude,
    longitude: payload.values.longitude ?? fallback.longitude,
  };
}

export function getEntryDraftLabel(draft: EntryDraft) {
  const payload = parseEntryDraftPayload(draft.payload);
  if (!payload) return "无法恢复的草稿";
  const title = payload.values.title.trim();
  const place = payload.values.place_name.trim();
  return title || place || "未命名故事";
}
