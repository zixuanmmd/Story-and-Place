import { z } from "zod";

export const adminDashboardSchema = z.object({
  total_users: z.number().int().nonnegative(),
  recent_users_7d: z.number().int().nonnegative(),
  active_users_30d: z.number().int().nonnegative(),
  restricted_users: z.number().int().nonnegative(),
  total_entries: z.number().int().nonnegative(),
  public_entries: z.number().int().nonnegative(),
  private_entries: z.number().int().nonnegative(),
  group_entries: z.number().int().nonnegative(),
  moderated_entries: z.number().int().nonnegative(),
  story_routes: z.number().int().nonnegative(),
  groups: z.number().int().nonnegative(),
  pending_reports: z.number().int().nonnegative(),
}).strict();

export const adminUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  display_name: z.string(),
  avatar_url: z.string().nullable(),
  created_at: z.string(),
  last_sign_in_at: z.string().nullable(),
  account_status: z.enum(["active", "restricted"]),
  is_admin: z.boolean(),
  story_count: z.number().int().nonnegative(),
  route_count: z.number().int().nonnegative(),
  report_count: z.number().int().nonnegative(),
}).strict();

export const adminReportSchema = z.object({
  id: z.uuid(),
  target_type: z.enum(["entry", "comment", "user", "group", "route"]),
  target_id: z.uuid(),
  reason: z.string(),
  description: z.string(),
  status: z.enum(["pending", "reviewing", "resolved", "dismissed"]),
  created_at: z.string(),
  reviewed_at: z.string().nullable(),
  review_notes: z.string().nullable(),
  reporter_name: z.string().nullable(),
  target_label: z.string(),
  target_href: z.string(),
}).strict();

export const adminContentSchema = z.object({
  kind: z.enum(["entry", "route"]),
  id: z.uuid(),
  title: z.string(),
  author_name: z.string().nullable(),
  moderation_status: z.enum(["active", "restricted", "removed"]),
  featured: z.boolean(),
  created_at: z.string(),
  href: z.string(),
}).strict();

export const adminAuditSchema = z.object({
  id: z.uuid(),
  action: z.string(),
  target_type: z.enum(["entry", "route", "user", "report"]),
  target_id: z.uuid(),
  report_id: z.uuid().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  admin_name: z.string().nullable(),
}).strict();

function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), has_more: z.boolean() }).strict();
}

export const adminUserPageSchema = paginatedSchema(adminUserSchema);
export const adminReportPageSchema = paginatedSchema(adminReportSchema);
export const adminContentPageSchema = paginatedSchema(adminContentSchema);
export const adminAuditListSchema = z.array(adminAuditSchema);

const countSchema = z.number().int().nonnegative();
const rateSchema = z.number().nonnegative();

export const adminProductAnalyticsSchema = z.object({
  range: z.object({ start_at: z.string(), end_at: z.string() }).strict(),
  acquisition: z.object({
    signups: countSchema,
    tracked_active_users: countSchema,
  }).strict(),
  activation: z.object({
    cohort_users: countSchema,
    onboarding_completed: countSchema,
    onboarding_rate: rateSchema,
    first_story_created: countSchema,
    first_story_rate: rateSchema,
    second_story_created: countSchema,
    second_story_rate: rateSchema,
  }).strict(),
  engagement: z.object({
    stories_created: countSchema,
    story_creators: countSchema,
    stories_per_creator: rateSchema,
    route_creators: countSchema,
    route_adoption_rate: rateSchema,
    search_visitors: countSchema,
    explore_visitors: countSchema,
  }).strict(),
  activation_funnel: z.object({
    signup_completed: countSchema,
    onboarding_completed: countSchema,
    first_story_created: countSchema,
    second_story_created: countSchema,
    returned_within_7d: countSchema,
  }).strict(),
  explore_funnel: z.object({
    explore_opened: countSchema,
    public_story_opened: countSchema,
    public_profile_opened: countSchema,
    signup_completed: countSchema,
  }).strict(),
  retention: z.object({
    d1: z.object({ eligible: countSchema, retained: countSchema, rate: rateSchema }).strict(),
    d7: z.object({ eligible: countSchema, retained: countSchema, rate: rateSchema }).strict(),
    d30: z.object({ eligible: countSchema, retained: countSchema, rate: rateSchema }).strict(),
  }).strict(),
  daily: z.array(z.object({
    day: z.string(),
    signups: countSchema,
    active_users: countSchema,
    stories: countSchema,
  }).strict()).max(367),
}).strict();

export type AdminDashboard = z.infer<typeof adminDashboardSchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminReport = z.infer<typeof adminReportSchema>;
export type AdminContent = z.infer<typeof adminContentSchema>;
export type AdminAudit = z.infer<typeof adminAuditSchema>;
export type AdminProductAnalytics = z.infer<typeof adminProductAnalyticsSchema>;
