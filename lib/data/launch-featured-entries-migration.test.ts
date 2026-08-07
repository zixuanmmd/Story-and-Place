import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202608070001_launch_featured_entries.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

describe("launch featured entries migration", () => {
  it("adds an indexed operational field without changing old migrations", () => {
    expect(migration).toContain("add column if not exists featured_at timestamptz");
    expect(migration).toContain("map_entries_public_featured_idx");
    expect(migration).not.toMatch(/delete\s+from\s+public\.map_entries/);
  });

  it("automatically removes ineligible stories from featured discovery", () => {
    expect(migration).toContain("function public.maintain_map_entry_featured_state");
    expect(migration).toContain("new.visibility <> 'public'");
    expect(migration).toContain("new.unlock_at > now()");
    expect(migration).toContain("new.featured_at := null");
  });

  it("returns only featured, unlocked and public stories", () => {
    expect(migration).toContain("function public.get_featured_public_entries");
    expect(migration).toContain("entry.featured_at is not null");
    expect(migration).toContain("entry.visibility = 'public'");
    expect(migration).toContain("entry.unlock_at <= now()");
    expect(migration).toContain("public.can_read_entry(entry.id)");
    expect(migration).toContain("to anon, authenticated");
  });

  it("does not let an authenticated browser feature its own story", () => {
    expect(migration).toContain("revoke update (featured_at)");
    expect(migration).toContain("revoke insert (featured_at)");
    expect(migration).not.toMatch(/grant\s+update\s*\(featured_at\)/);
  });
});
