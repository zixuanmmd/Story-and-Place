import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202607250001_timelines_story_routes.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("story route migration safety contract", () => {
  it("stores only entry references, order and note in route items", () => {
    const tableStart = migration.indexOf("create table public.story_route_items");
    const tableEnd = migration.indexOf(");", tableStart);
    const definition = migration.slice(tableStart, tableEnd);
    expect(definition).toContain("entry_id uuid");
    expect(definition).toContain("position integer");
    expect(definition).toContain("note varchar(500)");
    expect(definition).not.toMatch(/\b(latitude|longitude|content|place_name)\b/);
  });

  it("enables RLS and does not grant clients direct node writes", () => {
    expect(migration).toContain("alter table public.story_routes enable row level security");
    expect(migration).toContain("alter table public.story_route_items enable row level security");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete)[^;]*story_route_items/i);
  });

  it("checks both route permission and source entry permission", () => {
    expect(migration).toContain("function public.can_view_story_route");
    expect(migration).toContain("function public.can_read_story_route_item");
    expect(migration).toContain("public.can_read_entry(p_entry_id)");
  });

  it("uses secured RPCs and automatically downgrades affected public routes", () => {
    for (const name of [
      "save_story_route",
      "archive_story_route",
      "feature_story_route",
      "protect_public_story_routes_on_entry_change",
    ]) {
      const start = migration.indexOf(`function public.${name}`);
      expect(start).toBeGreaterThan(-1);
      expect(migration.slice(start, start + 1000)).toContain("security definer");
      expect(migration.slice(start, start + 1000)).toContain("set search_path = ''");
    }
    expect(migration).toContain("set visibility = 'private'");
    expect(migration).toContain("privacy_downgraded_at = now()");
  });

  it("limits a published route to two or more and every route to 200 nodes", () => {
    expect(migration).toContain("item_count < 1 or item_count > 200");
    expect(migration).toContain("p_publish and item_count < 2");
    expect(migration).toContain("story_route_items_route_entry_unique");
    expect(migration).toContain("story_route_items_route_position_unique");
  });
});
