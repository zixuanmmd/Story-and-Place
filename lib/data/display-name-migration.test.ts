import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202607240001_unique_display_names_and_schema_refresh.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("display-name uniqueness migration", () => {
  it("要求群组 migration 先完成并请求 PostgREST 刷新", () => {
    expect(migration).toContain("to_regclass('public.groups')");
    expect(migration).toContain(
      "apply 202607230001_groups_social_categories.sql before this migration",
    );
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });

  it("数据库规范化规则覆盖 trim、连续空白和大小写", () => {
    expect(migration).toContain("btrim(coalesce(value, ''))");
    expect(migration).toContain("'[[:space:]]+'");
    expect(migration).toContain("lower(public.format_display_name(value))");
  });

  it("处理历史重复后创建表达式唯一索引", () => {
    expect(migration).toContain("row_number() over");
    expect(migration).toContain("duplicate_profile.duplicate_rank > 1");
    expect(migration).toContain(
      "create unique index profiles_display_name_normalized_uidx",
    );
  });

  it("注册触发器只写用户 id 和显示名，不查询或公开邮箱", () => {
    expect(migration).toContain(
      "insert into public.profiles (id, display_name)",
    );
    expect(migration).not.toMatch(
      /insert into public\.profiles[^;]*email/i,
    );
    expect(migration).not.toMatch(/(update|delete)\s+auth\.users/i);
  });

  it("可用性 RPC 只接收候选昵称并返回 boolean", () => {
    expect(migration).toContain(
      "function public.is_display_name_available(candidate text)",
    );
    expect(migration).toContain("returns boolean");
    expect(migration).not.toContain(
      "is_display_name_available(candidate text, p_user_id uuid)",
    );
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain(
      "grant execute on function public.is_display_name_available(text)",
    );
  });
});
