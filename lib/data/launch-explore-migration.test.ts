import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXPLORE_CATEGORIES } from "@/lib/explore/categories";

const migration = readFileSync(
  new URL("../../supabase/migrations/202608050004_launch_explore.sql", import.meta.url),
  "utf8",
);

describe("launch Explore migration contract", () => {
  it("enforces a public and unlocked boundary before pagination", () => {
    const visibility = migration.indexOf("entry.visibility = 'public'");
    const unlocked = migration.indexOf("entry.unlock_at is null or entry.unlock_at <= now()");
    const canRead = migration.indexOf("public.can_read_entry(entry.id)");
    const limit = migration.lastIndexOf("limit least");
    expect(visibility).toBeGreaterThan(-1);
    expect(unlocked).toBeGreaterThan(visibility);
    expect(canRead).toBeGreaterThan(unlocked);
    expect(limit).toBeGreaterThan(canRead);
    expect(migration).not.toContain("entry.visibility = 'private'");
    expect(migration).not.toContain("entry.visibility = 'group'");
  });

  it("uses keyset ordering and a bounded page size", () => {
    expect(migration).toContain("entry.created_at < p_cursor_created_at");
    expect(migration).toContain("entry.id < p_cursor_id");
    expect(migration).toContain("order by entry.created_at desc, entry.id desc");
    expect(migration).toContain("least(greatest(coalesce(p_limit, 21), 1), 21)");
    expect(migration).not.toMatch(/\boffset\b/i);
  });

  it("keeps the UI lenses synchronized with the database allowlist", () => {
    for (const category of EXPLORE_CATEGORIES) {
      expect(migration).toContain(`'${category.value}'`);
      for (const tagName of category.tagNames) {
        expect(migration).toContain(`public.normalize_tag_name('${tagName}')`);
      }
    }
  });

  it("uses invoker rights, an empty search path and explicit ACL", () => {
    expect(migration).toMatch(
      /function public\.get_public_explore_entries\([\s\S]*?security invoker[\s\S]*?set search_path = ''/,
    );
    expect(migration).toContain("revoke all on function public.get_public_explore_entries(");
    expect(migration).toContain("to anon, authenticated;");
  });

  it("does not rewrite stories or weaken existing policies", () => {
    expect(migration).not.toMatch(/\b(update|delete|truncate)\s+(from\s+)?public\.map_entries\b/i);
    expect(migration).not.toMatch(/drop\s+policy/i);
    expect(migration).not.toMatch(/alter\s+table\s+public\.map_entries\s+disable\s+row\s+level\s+security/i);
  });
});
