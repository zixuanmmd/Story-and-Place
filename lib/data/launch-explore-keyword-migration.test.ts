import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/202608050006_launch_explore_keyword_lenses.sql", import.meta.url),
  "utf8",
);

describe("launch Explore keyword lenses migration", () => {
  it("discovers established compound tags without scanning story text", () => {
    expect(migration).toContain("tag.normalized_name like '%科幻%'");
    expect(migration).toContain("tag.normalized_name like '%文学%'");
    expect(migration).toContain("tag.normalized_name like '%旅行%'");
    expect(migration).not.toMatch(/entry\.(title|content)\s+(like|ilike)/i);
  });

  it("retains the public and unlocked boundary", () => {
    expect(migration).toContain("entry.visibility = 'public'");
    expect(migration).toContain("entry.unlock_at is null or entry.unlock_at <= now()");
    expect(migration).toContain("public.can_read_entry(entry.id)");
    expect(migration).not.toContain("entry.visibility = 'private'");
    expect(migration).not.toContain("entry.visibility = 'group'");
  });

  it("keeps invoker rights and the restricted normalizer private", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = ''");
    expect(migration).not.toContain("public.normalize_tag_name(");
    expect(migration).toContain("to anon, authenticated;");
  });
});
