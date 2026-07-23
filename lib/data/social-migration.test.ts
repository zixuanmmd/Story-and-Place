import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/202607230001_groups_social_categories.sql", import.meta.url),
  "utf8",
);

describe("群组社交 migration 安全契约", () => {
  it("为所有新增敏感表启用 RLS", () => {
    for (const table of [
      "groups",
      "group_members",
      "group_invitations",
      "follows",
      "entry_likes",
      "entry_comments",
      "reports",
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("security definer 权限函数使用空 search_path", () => {
    for (const functionName of [
      "is_active_group_member",
      "is_group_admin",
      "can_read_entry",
      "can_interact_entry",
      "get_social_feed",
    ]) {
      const start = migration.indexOf(`function public.${functionName}`);
      expect(start).toBeGreaterThan(-1);
      expect(migration.slice(start, start + 900)).toContain("security definer");
      expect(migration.slice(start, start + 900)).toContain("set search_path = ''");
    }
  });

  it("成员表没有授予普通客户端直接写权限", () => {
    expect(migration).not.toMatch(/grant\s+(insert|update|delete)[^;]*public\.group_members/i);
    expect(migration).toContain("grant execute on function public.join_public_group");
  });

  it("群组可见性和地点分类由约束强制执行", () => {
    expect(migration).toContain("map_entries_group_visibility_consistency");
    expect(migration).toContain("visibility in ('public', 'private', 'group')");
    expect(migration).toContain("references public.place_categories(slug)");
  });
});
