import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rebuildQuery = readFileSync(
  new URL(
    "../../supabase/rebuild/current_schema_rebuild.sql",
    import.meta.url,
  ),
  "utf8",
);

const migrationNames = [
  "202607220001_initial_schema.sql",
  "202607220002_privacy_time_integrity.sql",
  "202607230001_groups_social_categories.sql",
  "202607240001_unique_display_names_and_schema_refresh.sql",
  "202607250001_timelines_story_routes.sql",
  "202607250002_group_membership_hardening.sql",
  "202607250003_group_creator_select_policy.sql",
  "202607260001_entry_participants_tags.sql",
];

describe("Supabase 完整重建 Query", () => {
  it("在单一事务中重建 public schema", () => {
    expect(rebuildQuery).toContain("begin;");
    expect(rebuildQuery).toContain("drop schema if exists public cascade;");
    expect(rebuildQuery).toContain("create schema public authorization postgres;");
    expect(rebuildQuery).toContain("commit;");
    expect(rebuildQuery.indexOf("begin;")).toBeLessThan(
      rebuildQuery.indexOf("drop schema if exists public cascade;"),
    );
    expect(rebuildQuery.lastIndexOf("commit;")).toBeGreaterThan(
      rebuildQuery.indexOf("AUTH PROFILE BACKFILL"),
    );
  });

  it("按版本顺序包含当前全部 migration", () => {
    let previousIndex = -1;
    for (const migrationName of migrationNames) {
      const markerIndex = rebuildQuery.indexOf(
        `MIGRATION: ${migrationName}`,
      );
      expect(markerIndex).toBeGreaterThan(previousIndex);
      previousIndex = markerIndex;
    }
  });

  it("保留 Auth 账户并在重建后恢复 profiles", () => {
    expect(rebuildQuery).toContain("from auth.users as auth_user");
    expect(rebuildQuery).toContain("insert into public.profiles");
    expect(rebuildQuery).not.toMatch(/\b(delete|truncate)\s+(from\s+)?auth\.users\b/i);
    expect(rebuildQuery).not.toContain("drop schema auth");
  });

  it("包含最终对象与 profile 恢复摘要", () => {
    for (const relation of [
      "public.profiles",
      "public.map_entries",
      "public.groups",
      "public.story_routes",
      "public.entry_participants",
      "public.tags",
    ]) {
      expect(rebuildQuery).toContain(`to_regclass('${relation}')`);
    }
    expect(rebuildQuery).toContain("restored_profile_count");
  });
});
