import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../supabase/migrations/202608080003_v13_data_portability_account_deletion.sql", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../../app/api/account/delete/route.ts", import.meta.url),
  "utf8",
);

describe("v1.3 data portability and account deletion", () => {
  it("导出 RPC 明确选择业务字段且不读取 auth schema", () => {
    expect(sql).toContain("function public.export_my_story_data()");
    expect(sql).toContain("'ownership', 'owner'");
    expect(sql).toContain("'ownership', 'participant'");
    expect(sql).toContain("public.can_read_entry(entry.id)");
    expect(sql).not.toContain("from auth.users");
    expect(sql).not.toMatch(/access_token|refresh_token|raw_user_meta_data/);
  });

  it("浏览器只能开始自己的删除请求，最终清理仅授予 service_role", () => {
    expect(sql).toContain("function public.begin_account_deletion");
    expect(sql).toContain("actor uuid := (select auth.uid())");
    expect(sql).toContain("function public.finalize_account_deletion");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.finalize_account_deletion(uuid, uuid) to service_role");
  });

  it("群主和管理员职责会阻止账号删除", () => {
    expect(sql.match(/membership\.role in \('owner', 'admin'\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("group responsibilities must be resolved");
  });

  it("服务端要求 bearer 身份、密码复核并使用 Auth soft delete", () => {
    expect(route).toContain("auth.getUser(accessToken)");
    expect(route).toContain("signInWithPassword");
    expect(route).toContain("passwordData.user?.id !== user.id");
    expect(route).toContain("auth.admin.deleteUser(user.id, true)");
    expect(route).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(route).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
  });
});
