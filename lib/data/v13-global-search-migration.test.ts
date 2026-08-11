import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/202608080001_v13_global_search.sql", import.meta.url),
  "utf8",
).toLowerCase();

describe("v1.3 global search migration", () => {
  it("uses canonical entry and route permissions", () => {
    expect(migration).toContain("public.can_read_entry(entry.id)");
    expect(migration).toContain("public.can_view_story_route(route.id)");
    expect(migration).toContain("entry.unlock_at is null or entry.unlock_at <= now()");
  });

  it("does not expose locked capsules through routes, tags or counts", () => {
    expect(migration).toContain("entry.unlock_at > now()");
    expect(migration.match(/entry\.unlock_at is null or entry\.unlock_at <= now\(\)/g)?.length)
      .toBeGreaterThanOrEqual(2);
    expect(migration).toContain("count(*) over () as total_count");
  });

  it("hardens the definer function and grants only execution", () => {
    expect(migration).toMatch(
      /function public\.search_story_and_place\([\s\S]*?security definer[\s\S]*?set search_path = ''/,
    );
    expect(migration).toContain("revoke all on function public.search_story_and_place(");
    expect(migration).toContain("to anon, authenticated;");
  });

  it("bounds input and pagination instead of allowing profile enumeration", () => {
    expect(migration).toContain("char_length(query) between 2 and 100");
    expect(migration).toContain("least(greatest(coalesce(p_limit, 21), 1), 51)");
    expect(migration).toContain("offset greatest(coalesce(p_offset, 0), 0)");
    expect(migration).not.toContain("offset criteria.result_offset");
    expect(migration).toContain("content_types <@ array[");
  });

  it("supports an author-only story and route filter", () => {
    expect(migration).toContain("criteria.query is not null or p_author_id is not null");
    expect(migration).toContain("criteria.query is null\n        or route.title ilike");
  });

  it("adds indexes without rewriting or weakening business data", () => {
    expect(migration).toContain("create extension if not exists pg_trgm");
    expect(migration).toContain("map_entries_global_search_trgm_idx");
    expect(migration).not.toMatch(/\b(delete|truncate)\s+(from\s+)?public\./);
    expect(migration).not.toMatch(/disable\s+row\s+level\s+security/);
    expect(migration).not.toMatch(/drop\s+policy/);
  });
});
