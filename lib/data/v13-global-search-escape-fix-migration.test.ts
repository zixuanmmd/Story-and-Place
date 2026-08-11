import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202608110001_v13_global_search_escape_fix.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

describe("v1.3 global search escape regression migration", () => {
  it("uses a one-character PostgreSQL LIKE escape", () => {
    expect(migration).toContain("escape '\\'");
    expect(migration).not.toContain("escape '\\\\'");
  });

  it("preserves permission filtering and locked-capsule exclusion", () => {
    expect(migration).toContain("public.can_read_entry(entry.id)");
    expect(migration).toContain("public.can_view_story_route(route.id)");
    expect(migration.match(/entry\.unlock_at is null or entry\.unlock_at <= now\(\)/g)?.length)
      .toBeGreaterThanOrEqual(2);
  });

  it("keeps the hardened signature and minimum grants", () => {
    expect(migration).toMatch(
      /function public\.search_story_and_place\([\s\S]*?security definer[\s\S]*?set search_path = ''/,
    );
    expect(migration).toContain("revoke all on function public.search_story_and_place(");
    expect(migration).toContain("to anon, authenticated;");
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });

  it("does not rewrite or delete business data", () => {
    expect(migration).not.toMatch(/\b(delete|truncate)\s+(from\s+)?public\./);
    expect(migration).not.toMatch(/disable\s+row\s+level\s+security/);
    expect(migration).not.toMatch(/drop\s+(table|policy|schema)/);
  });
});
