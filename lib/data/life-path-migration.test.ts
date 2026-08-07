import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202608050002_life_paths.sql",
    import.meta.url,
  ),
  "utf8",
);

function body(name: string, nextName?: string) {
  const start = migration.indexOf(`function public.${name}`);
  const end = nextName
    ? migration.indexOf(`function public.${nextName}`, start + 1)
    : migration.length;
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("Life Path migration contract", () => {
  it("backfills a stable unique username without deleting profiles", () => {
    expect(migration).toContain("add column if not exists username text");
    expect(migration).toContain("profiles_username_uidx");
    expect(migration).toContain("profiles_username_format");
    expect(migration).toContain("traveler-' || replace(profile.id::text");
    expect(migration).not.toMatch(/\b(delete|truncate)\s+(from\s+)?public\.profiles\b/i);
  });

  it("keeps the username database-controlled for ordinary clients", () => {
    expect(migration).not.toMatch(/grant\s+(insert|update)[^;]*username/i);
    expect(migration).toContain("Existing column-level INSERT/UPDATE grants intentionally remain unchanged");
  });

  it("derives path nodes only from unlocked public entries before pagination", () => {
    const functionSql = body(
      "get_public_life_path_entries",
      "get_public_life_path_summary",
    );
    expect(functionSql).toContain("entry.visibility = 'public'");
    expect(functionSql).toContain("entry.unlock_at is null or entry.unlock_at <= now()");
    expect(functionSql).toContain("public.can_read_entry(entry.id)");
    expect(functionSql.indexOf("entry.visibility = 'public'")).toBeLessThan(
      functionSql.indexOf("offset greatest"),
    );
    expect(functionSql).not.toContain("entry.visibility = 'private'");
  });

  it("uses exactly the same public boundary for aggregate statistics", () => {
    const functionSql = body("get_public_life_path_summary");
    expect(functionSql).toContain("entry.visibility = 'public'");
    expect(functionSql).toContain("entry.unlock_at is null or entry.unlock_at <= now()");
    expect(functionSql).toContain("public.can_read_entry(entry.id)");
    expect(functionSql).toContain("count(distinct (visible.latitude, visible.longitude))");
  });

  it("uses invoker rights, an empty search path and explicit execute ACL", () => {
    for (const name of [
      "resolve_public_profile",
      "get_public_life_path_entries",
      "get_public_life_path_summary",
    ]) {
      expect(migration).toMatch(
        new RegExp(`function public\\.${name}\\([\\s\\S]*?security invoker[\\s\\S]*?set search_path = ''`),
      );
      expect(migration).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\(`),
      );
    }
  });
});
