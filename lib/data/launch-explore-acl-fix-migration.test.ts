import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/202608050005_launch_explore_acl_fix.sql", import.meta.url),
  "utf8",
);

describe("launch Explore ACL fix migration", () => {
  it("keeps invoker rights without calling the restricted normalizer", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = ''");
    expect(migration).not.toContain("public.normalize_tag_name(");
    expect(migration).not.toContain("grant execute on function public.normalize_tag_name");
  });

  it("retains the public, unlocked and readable boundary", () => {
    expect(migration).toContain("entry.visibility = 'public'");
    expect(migration).toContain("entry.unlock_at is null or entry.unlock_at <= now()");
    expect(migration).toContain("public.can_read_entry(entry.id)");
    expect(migration).not.toContain("entry.visibility = 'private'");
    expect(migration).not.toContain("entry.visibility = 'group'");
  });

  it("restores execute only for browser roles and refreshes the schema cache", () => {
    expect(migration).toContain("revoke all on function public.get_public_explore_entries(");
    expect(migration).toContain("to anon, authenticated;");
    expect(migration).toContain("notify pgrst, 'reload schema';");
  });
});
