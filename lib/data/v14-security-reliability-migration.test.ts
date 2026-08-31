import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../supabase/migrations/202608270001_v14_security_reliability.sql", import.meta.url),
  "utf8",
).toLocaleLowerCase("en-US");
const assertions = readFileSync(
  new URL("../../supabase/tests/v14_security_reliability_assertions.sql", import.meta.url),
  "utf8",
).toLocaleLowerCase("en-US");
const clockFixSql = readFileSync(
  new URL(
    "../../supabase/migrations/20260828102358_v14_rate_limit_clock_fix.sql",
    import.meta.url,
  ),
  "utf8",
).toLocaleLowerCase("en-US");
const builtinFixSql = readFileSync(
  new URL(
    "../../supabase/migrations/20260828102558_v14_rate_limit_builtin_fix.sql",
    import.meta.url,
  ),
  "utf8",
).toLocaleLowerCase("en-US");

describe("v1.4 security reliability migration", () => {
  it("使用私有且启用 RLS 的持久化桶，不存储原始 IP", () => {
    expect(sql).toContain("create table if not exists private.rate_limit_buckets");
    expect(sql).toContain("alter table private.rate_limit_buckets enable row level security");
    expect(sql).toContain("key_hash text not null");
    expect(sql).not.toContain("ip_address");
    expect(sql).not.toContain("email_address");
  });

  it("原子函数使用空 search_path 且仅向 service_role 授权", () => {
    expect(sql).toContain("function public.consume_server_rate_limit");
    expect(sql).toContain("security definer\nset search_path = ''");
    expect(sql).toContain("on conflict (scope, key_hash) do update");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).not.toMatch(/grant execute[\s\S]*to (anon|authenticated)/);
  });

  it("提供可执行的本地权限与原子限流断言", () => {
    expect(assertions).toContain("set local role service_role");
    expect(assertions).toContain("has_function_privilege('anon'");
    expect(assertions).toContain("has_function_privilege('authenticated'");
    expect(assertions).toContain("blocked_result.allowed is not false");
    expect(assertions).toContain("rollback;");
  });

  it("在 PostgreSQL 17 中避免 current_time 关键字与变量名冲突", () => {
    expect(clockFixSql).toContain("v_now timestamptz := clock_timestamp()");
    expect(clockFixSql).toContain("values (p_scope, p_key_hash, v_now, 1, v_now)");
    expect(clockFixSql).toContain("existing.window_started_at <= v_now - window_duration");
    expect(clockFixSql).not.toMatch(/\bcurrent_time\s+timestamptz/);
    expect(assertions).toContain("'search_path=\"\"'");
  });

  it("不把 greatest 特殊表达式误当成 pg_catalog 函数", () => {
    expect(builtinFixSql).toContain(
      "remaining := greatest(p_limit - bucket.request_count, 0)",
    );
    expect(builtinFixSql).not.toContain("pg_catalog.greatest");
    expect(builtinFixSql).toContain("security definer\nset search_path = ''");
  });
});
