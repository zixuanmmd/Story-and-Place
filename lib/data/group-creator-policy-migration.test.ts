import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202607250003_group_creator_select_policy.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("群组创建者读取策略 migration", () => {
  it("只新增创建者读取自己群组的认证用户策略", () => {
    expect(migration).toContain(
      'create policy "group_creators_can_read_own_groups"',
    );
    expect(migration).toContain("as permissive");
    expect(migration).toContain("for select");
    expect(migration).toContain("to authenticated");
    expect(migration).toContain("created_by = (select auth.uid())");
  });

  it("可在已有数据库上确定性地重复应用策略定义", () => {
    expect(migration).toContain(
      'drop policy if exists "group_creators_can_read_own_groups"',
    );
    expect(migration).toContain(
      "to_regclass('public.groups') is null",
    );
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });

  it("不在本次增量中重复创建已有表、字段或索引", () => {
    expect(migration).not.toMatch(/\bcreate\s+table\b/i);
    expect(migration).not.toMatch(/\badd\s+column\b/i);
    expect(migration).not.toMatch(/\bcreate\s+(unique\s+)?index\b/i);
  });
});
