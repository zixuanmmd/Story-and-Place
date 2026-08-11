import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202608110002_trigger_function_execute_hardening.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

describe("v1.3 trigger function execution hardening", () => {
  it("removes direct API execution from internal trigger functions", () => {
    expect(migration).toContain("public.add_group_owner_after_insert()");
    expect(migration).toContain("public.validate_entry_participant()");
    expect(migration.match(/from public, anon, authenticated;/g)).toHaveLength(2);
  });

  it("does not alter policies, triggers or business data", () => {
    expect(migration).not.toMatch(/\b(delete|truncate|update|insert)\b/);
    expect(migration).not.toMatch(/drop\s+(table|policy|trigger|schema)/);
    expect(migration).not.toMatch(/disable\s+row\s+level\s+security/);
  });
});
