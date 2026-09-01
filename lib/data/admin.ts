import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  adminAuditListSchema,
  adminContentPageSchema,
  adminDashboardSchema,
  adminProductAnalyticsSchema,
  adminReportPageSchema,
  adminUserPageSchema,
} from "@/lib/validation/admin";
import type { ContentModerationStatus, ReportStatus } from "@/types/database";

export async function getAdminDashboard() {
  const { data, error } = await getSupabaseBrowserClient().rpc("admin_get_dashboard");
  if (error) throw error;
  return adminDashboardSchema.parse(data);
}

export async function getAdminProductAnalytics(days = 30) {
  const safeDays = Math.min(366, Math.max(1, Math.trunc(days)));
  const endAt = new Date();
  const startAt = new Date(endAt.getTime() - safeDays * 24 * 60 * 60 * 1000);
  const { data, error } = await getSupabaseBrowserClient().rpc(
    "admin_get_product_analytics",
    { p_start_at: startAt.toISOString(), p_end_at: endAt.toISOString() },
  );
  if (error) throw error;
  return adminProductAnalyticsSchema.parse(data);
}

export async function listAdminUsers(query = "", offset = 0) {
  const { data, error } = await getSupabaseBrowserClient().rpc("admin_list_users", {
    p_query: query || null,
    p_offset: offset,
    p_limit: 25,
  });
  if (error) throw error;
  return adminUserPageSchema.parse(data);
}

export async function listAdminReports(status: ReportStatus | null = null, offset = 0) {
  const { data, error } = await getSupabaseBrowserClient().rpc("admin_list_reports", {
    p_status: status,
    p_offset: offset,
    p_limit: 25,
  });
  if (error) throw error;
  return adminReportPageSchema.parse(data);
}

export async function listAdminContent(kind: "entry" | "route" | null = null, offset = 0) {
  const { data, error } = await getSupabaseBrowserClient().rpc("admin_list_public_content", {
    p_kind: kind,
    p_offset: offset,
    p_limit: 25,
  });
  if (error) throw error;
  return adminContentPageSchema.parse(data);
}

export async function listAdminAuditLogs() {
  const { data, error } = await getSupabaseBrowserClient().rpc("admin_list_audit_logs", { p_limit: 50 });
  if (error) throw error;
  return adminAuditListSchema.parse(data);
}

export async function setAccountRestriction(userId: string, restricted: boolean, reason: string) {
  const { error } = await getSupabaseBrowserClient().rpc("admin_set_account_restriction", {
    p_user_id: userId,
    p_restricted: restricted,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function moderateContent(
  kind: "entry" | "route",
  id: string,
  status: ContentModerationStatus,
  reason: string,
) {
  const supabase = getSupabaseBrowserClient();
  const result = kind === "entry"
    ? await supabase.rpc("admin_moderate_entry", { p_entry_id: id, p_status: status, p_reason: reason })
    : await supabase.rpc("admin_moderate_story_route", { p_route_id: id, p_status: status, p_reason: reason });
  if (result.error) throw result.error;
}

export async function setEntryFeatured(entryId: string, featured: boolean) {
  const { error } = await getSupabaseBrowserClient().rpc("admin_set_entry_featured", {
    p_entry_id: entryId,
    p_featured: featured,
  });
  if (error) throw error;
}

export async function reviewReport(reportId: string, status: Exclude<ReportStatus, "pending">, notes: string) {
  const { error } = await getSupabaseBrowserClient().rpc("admin_review_report", {
    p_report_id: reportId,
    p_status: status,
    p_notes: notes,
  });
  if (error) throw error;
}
