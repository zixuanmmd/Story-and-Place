import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202607300002_entry_rls_helper_execute.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("entry RLS helper execute migration", () => {
  it("limits edit-log policy evaluation to authenticated users", () => {
    expect(migration).toMatch(
      /revoke all on function public\.can_read_entry_edit_log\(uuid, timestamptz\)\s+from public, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.can_read_entry_edit_log\(uuid, timestamptz\)\s+to authenticated;/,
    );
  });

  it("allows both policy target roles to evaluate readable tags", () => {
    expect(migration).toMatch(
      /revoke all on function public\.can_read_tag\(uuid\)\s+from public, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.can_read_tag\(uuid\)\s+to anon, authenticated;/,
    );
  });

  it("does not widen any other internal function privilege", () => {
    const grants = migration.match(/grant execute on function/gi) ?? [];
    expect(grants).toHaveLength(2);
    expect(migration).not.toMatch(
      /\b(drop table|drop column|truncate|create policy|alter policy)\b/i,
    );
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });
});
