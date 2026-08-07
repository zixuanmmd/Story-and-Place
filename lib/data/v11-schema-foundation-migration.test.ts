import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202608040001_v11_schema_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("v1.1 schema foundation migration", () => {
  it("fails closed when the stable production schema is incomplete", () => {
    for (const prerequisite of [
      "to_regclass('public.tags')",
      "to_regclass('public.map_entries')",
      "to_regclass('public.story_route_items')",
      "to_regprocedure('public.can_read_entry(uuid)')",
      "public.save_story_route(uuid,text,text,text,uuid,boolean,jsonb)",
    ]) {
      expect(migration).toContain(prerequisite);
    }
    expect(migration).toContain("errcode = '55000'");
  });

  it("adds typed tags without changing legacy tag behavior", () => {
    expect(migration).toContain("add column type text not null default 'normal'");
    expect(migration).toContain("add column semantic_key text");
    expect(migration).toContain(
      "type in ('normal', 'emotion', 'theme', 'character', 'event')",
    );
    expect(migration).toContain("tags_type_semantic_key_uidx");
    expect(migration).toContain("where semantic_key is not null");
  });

  it("adds a nullable indexed capsule unlock time", () => {
    expect(migration).toContain("add column unlock_at timestamptz");
    expect(migration).toContain("map_entries_unlock_at_idx");
    expect(migration).toContain("where unlock_at is not null");
    expect(migration).not.toContain("unlock_at timestamptz not null");
  });

  it("keeps every existing route node on the normal relation", () => {
    expect(migration).toContain(
      "add column relation_type text not null default 'normal'",
    );
    for (const relation of [
      "'normal'",
      "'cause'",
      "'memory'",
      "'contrast'",
      "'turning_point'",
    ]) {
      expect(migration).toContain(relation);
    }
  });

  it("does not activate unfinished permissions or mutate production rows", () => {
    expect(migration).not.toMatch(/create\s+or\s+replace\s+function/i);
    expect(migration).not.toMatch(/create\s+policy/i);
    expect(migration).not.toMatch(/grant\s+(insert|update|delete)/i);
    expect(migration).not.toMatch(/\b(update|delete|truncate)\s+public\./i);
    expect(migration).not.toMatch(/drop\s+(table|schema)/i);
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });
});
