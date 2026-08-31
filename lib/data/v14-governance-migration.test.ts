import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/202608290001_v14_governance.sql", import.meta.url),
  "utf8",
).toLocaleLowerCase("en-US");
const assertions = readFileSync(
  new URL("../../supabase/tests/v14_governance_rls_assertions.sql", import.meta.url),
  "utf8",
).toLocaleLowerCase("en-US");
const notificationFix = readFileSync(
  new URL(
    "../../supabase/migrations/20260830085143_v14_governance_notification_entity_fix.sql",
    import.meta.url,
  ),
  "utf8",
).toLocaleLowerCase("en-US");

describe("v1.4 governance migration contract", () => {
  it("creates private governance tables with RLS and no browser writes", () => {
    for (const table of ["app_admins", "account_moderation", "moderation_audit_logs"]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("revoke all on table public.app_admins from public, anon, authenticated");
    expect(migration).not.toContain("grant insert on public.app_admins to authenticated");
  });

  it("hardens every admin RPC and grants only authenticated execution", () => {
    for (const name of [
      "admin_get_dashboard", "admin_list_users", "admin_list_reports",
      "admin_list_public_content", "admin_list_audit_logs",
      "admin_set_account_restriction", "admin_moderate_entry",
      "admin_moderate_story_route", "admin_set_entry_featured", "admin_review_report",
    ]) {
      expect(migration).toContain(`function public.${name}`);
    }
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("perform private.assert_app_admin()");
    expect(migration).toContain("from public, anon");
  });

  it("keeps admin moderation to public content and preserves private-body boundaries", () => {
    expect(assertions).toContain("admin must not read another user private story");
    expect(migration).toContain("entry.visibility = 'public'");
    expect(migration).toContain("route.visibility = 'public'");
    expect(migration).toContain("评论（正文不在审核列表展示）");
    expect(migration).not.toContain("auth_user.email");
    expect(migration).not.toContain("access_token");
    expect(migration).not.toContain("refresh_token");
  });

  it("extends reports to routes and records moderation actions", () => {
    expect(migration).toContain("'group', 'route'");
    expect(migration).toContain("'copyright', 'inappropriate'");
    expect(migration).toContain("insert into public.moderation_audit_logs");
    expect(migration).toContain("reports_open_queue_idx");
  });

  it("keeps account-moderation notifications compatible with the entity constraint", () => {
    expect(migration).toContain("'profile', p_user_id");
    expect(notificationFix).toContain("'account', 'profile', 'export'");
    expect(notificationFix).toContain("validate constraint notifications_entity_values");
    expect(notificationFix).toContain("notify pgrst, 'reload schema'");
  });

  it("explicitly grants policy helpers to API roles", () => {
    expect(migration).toContain("grant execute on function public.is_app_admin() to anon, authenticated");
    expect(migration).toContain("grant execute on function public.is_account_restricted(uuid) to anon, authenticated");
  });

  it("ships transactional multi-identity RLS assertions", () => {
    expect(assertions).toContain("a must not be an admin");
    expect(assertions).toContain("admin must not read another user private story");
    expect(assertions).toContain("anonymous must not read restricted public story");
    expect(assertions).toContain("restricted account public story must disappear");
    expect(assertions).toContain("restricted account unexpectedly created ugc");
    expect(assertions).toContain("rollback;");
  });
});
