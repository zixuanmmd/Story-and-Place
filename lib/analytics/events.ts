import { z } from "zod";

export const PRODUCT_EVENT_NAMES = [
  "session_started",
  "signup_started",
  "signup_completed",
  "onboarding_started",
  "onboarding_completed",
  "onboarding_skipped",
  "story_create_started",
  "story_created",
  "story_published",
  "draft_created",
  "draft_resumed",
  "route_created",
  "search_used",
  "search_result_opened",
  "explore_opened",
  "public_story_opened",
  "public_profile_opened",
  "story_shared",
  "invitation_sent",
  "invitation_accepted",
  "export_started",
  "export_completed",
] as const;

export const productEventNameSchema = z.enum(PRODUCT_EVENT_NAMES);

const productEventSourceSchema = z.enum([
  "auth-provider",
  "register-form",
  "welcome",
  "first-story",
  "entry-autosave",
  "map-draft-url",
  "map",
  "onboarding",
  "route-builder",
  "route-detail",
  "global-search",
  "search-map",
  "search-list",
  "explore-page",
  "entry-share",
  "public-profile",
  "settings",
  "entry-participants",
  "entry-invitations",
  "group-members",
  "group-invitations",
]);

export const productEventPropertiesSchema = z.object({
  source: productEventSourceSchema.optional(),
  format: z.enum(["json", "csv", "geojson"]).optional(),
  result_type: z.enum(["entry", "profile", "route", "tag", "emotion"]).optional(),
  content_type: z.enum(["entry", "route", "draft"]).optional(),
  invitation_type: z.enum(["entry", "group"]).optional(),
  visibility: z.enum(["public", "private", "group"]).optional(),
  outcome: z.enum(["success", "failed", "completed", "skipped"]).optional(),
  result_count_bucket: z.enum(["zero", "one_to_five", "six_to_twenty", "over_twenty"]).optional(),
  story_ordinal: z.number().int().min(1).max(1000).optional(),
}).strict();

export const productEventEnvelopeSchema = z.object({
  eventId: z.uuid(),
  anonymousSessionId: z.uuid(),
  name: productEventNameSchema,
  properties: productEventPropertiesSchema,
}).strict();

export type ProductEventName = z.infer<typeof productEventNameSchema>;
export type ProductEventProperties = z.infer<typeof productEventPropertiesSchema>;
export type ProductEventEnvelope = z.infer<typeof productEventEnvelopeSchema>;

export function bucketResultCount(count: number): NonNullable<ProductEventProperties["result_count_bucket"]> {
  if (count <= 0) return "zero";
  if (count <= 5) return "one_to_five";
  if (count <= 20) return "six_to_twenty";
  return "over_twenty";
}
