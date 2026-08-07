import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/202608050003_launch_onboarding.sql", import.meta.url),
  "utf8",
);

describe("launch onboarding migration contract", () => {
  it("keeps preferences outside public profiles and owner-only", () => {
    expect(migration).toContain("create table if not exists public.user_experience_preferences");
    expect(migration).toContain("alter table public.user_experience_preferences enable row level security");
    expect(migration).toContain("user_id = (select auth.uid())");
    expect(migration).not.toMatch(/alter table public\.profiles[\s\S]*add column[^;]*(interest|onboarding)/i);
    expect(migration).not.toContain("grant select on public.user_experience_preferences to anon");
  });

  it("allows only stable optional interest values", () => {
    for (const interest of ["'life'", "'travel'", "'literature-city'", "'fictional-world'"]) {
      expect(migration).toContain(interest);
    }
    expect(migration).toContain("cardinality(interests) <= 4");
  });

  it("completes onboarding only with a story owned by auth.uid", () => {
    const start = migration.indexOf("function public.complete_onboarding");
    const body = migration.slice(start);
    expect(body).toContain("entry.user_id = actor");
    expect(body).toContain("owned story required");
    expect(body).toContain("onboarding_status = 'completed'");
  });

  it("uses security definer functions with empty search paths and explicit ACL", () => {
    for (const name of ["set_onboarding_preferences", "complete_onboarding"]) {
      expect(migration).toMatch(new RegExp(`function public\\.${name}\\([\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`));
      expect(migration).toMatch(new RegExp(`revoke all on function public\\.${name}\\(`));
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${name}\\(`));
    }
  });

  it("does not delete or rewrite existing users and stories", () => {
    expect(migration).not.toMatch(/\b(delete|truncate)\s+(from\s+)?public\.(profiles|map_entries)\b/i);
    expect(migration).not.toContain("drop table public.");
  });
});
