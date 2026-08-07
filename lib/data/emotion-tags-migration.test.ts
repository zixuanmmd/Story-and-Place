import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202608040002_emotion_tags.sql",
    import.meta.url,
  ),
  "utf8",
);

function functionBody(name: string, nextName?: string) {
  const start = migration.indexOf(`function public.${name}`);
  const end = nextName
    ? migration.indexOf(`function public.${nextName}`, start + 1)
    : migration.length;
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("emotion tags migration contract", () => {
  it("promotes the curated emotions without replacing tag identities", () => {
    for (const [name, key] of [
      ["孤独", "loneliness"],
      ["重逢", "reunion"],
      ["成长", "growth"],
      ["遗憾", "regret"],
      ["失去", "loss"],
      ["希望", "hope"],
      ["恐惧", "fear"],
    ]) {
      expect(migration).toContain(`('${name}', public.normalize_tag_name('${name}'), 'emotion', '${key}', null)`);
    }
    expect(migration).toContain("on conflict (normalized_name) do update");
    expect(migration).not.toMatch(/delete\s+from\s+public\.tags/i);
  });

  it("keeps visible tag counts behind entry read permission", () => {
    for (const [name, next] of [
      ["get_visible_tags", "get_typed_tag_entries"],
      ["get_typed_tag_entries", "get_visible_tag_summary_v11"],
      ["get_visible_tag_summary_v11", "get_public_emotion_entries"],
    ] as const) {
      expect(functionBody(name, next)).toContain("public.can_read_entry(entry.id)");
    }
  });

  it("hard-limits public emotion pages to public entries", () => {
    for (const [name, next] of [
      ["get_public_emotion_entries", "get_public_emotion_summary"],
      ["get_public_emotion_summary", undefined],
    ] as const) {
      const body = functionBody(name, next);
      expect(body).toContain("tag.type = 'emotion'");
      expect(body).toContain("entry.visibility = 'public'");
      expect(body).toContain("public.can_read_entry(entry.id)");
    }
  });

  it("uses invoker rights, an empty search path and explicit grants", () => {
    for (const name of [
      "get_visible_tags",
      "get_typed_tag_entries",
      "get_visible_tag_summary_v11",
      "get_public_emotion_entries",
      "get_public_emotion_summary",
    ]) {
      const body = functionBody(name);
      expect(body).toContain("security invoker");
      expect(body).toContain("set search_path = ''");
      expect(migration).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\(`),
      );
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${name}\\(`),
      );
    }
  });

  it("retains the existing RLS boundary", () => {
    expect(migration).toContain("tags_visible_with_readable_entries");
    expect(migration).toContain("entry_tags_visible_with_entry");
    expect(migration).toContain("alter table public.tags enable row level security");
    expect(migration).toContain("alter table public.entry_tags enable row level security");
  });
});
