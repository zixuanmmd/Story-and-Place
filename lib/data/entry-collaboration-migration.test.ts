import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202607260001_entry_participants_tags.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("entry collaboration and tags migration contract", () => {
  it("creates the four additive tables with RLS", () => {
    for (const table of [
      "entry_participants",
      "entry_edit_logs",
      "tags",
      "entry_tags",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
  });

  it("requires accepted status for private participant reads", () => {
    const readFunction = migration.slice(
      migration.indexOf("function public.can_read_entry(p_entry_id uuid)"),
      migration.indexOf(
        "function public.can_read_entry_edit_log",
      ),
    );
    expect(readFunction).toContain("entry.visibility = 'private'");
    expect(readFunction).toContain("participant.status = 'accepted'");
  });

  it("keeps group membership as an additional collaboration requirement", () => {
    const collaboratorFunction = migration.slice(
      migration.indexOf("function public.can_collaborate_entry"),
      migration.indexOf("function public.can_edit_entry_field"),
    );
    expect(collaboratorFunction).toContain(
      "public.is_active_group_member(entry.group_id)",
    );
    expect(migration).toContain(
      "invitee must be an active group member",
    );
  });

  it("blocks participant access and comment-setting changes in the RPC", () => {
    const updateFunction = migration.slice(
      migration.indexOf("function public.update_entry("),
      migration.indexOf("function public.set_entry_tags"),
    );
    for (const field of ["visibility", "group_id", "allow_comments"]) {
      expect(updateFunction).toContain(field);
    }
    expect(updateFunction).toContain(
      "participants cannot change entry access or comment settings",
    );
    expect(migration).not.toMatch(
      /create policy[\s\S][^;]*entry_participants[^;]+for delete/i,
    );
  });

  it("generates logs in the database and exposes no direct log writes", () => {
    expect(migration).toContain("function public.log_map_entry_edit");
    expect(migration).toContain("create trigger map_entries_log_edit");
    expect(migration).not.toMatch(
      /grant\s+(insert|update|delete)[^;]*entry_edit_logs/i,
    );
  });

  it("filters tag aggregation through entry-read permission", () => {
    for (const name of ["get_tag_entries", "get_visible_tag_summary"]) {
      const start = migration.indexOf(`function public.${name}`);
      expect(start).toBeGreaterThan(-1);
      expect(migration.slice(start, start + 1500)).toContain(
        "public.can_read_entry(entry.id)",
      );
    }
  });

  it("publishes collaboration changes for Realtime refresh", () => {
    for (const table of [
      "map_entries",
      "entry_participants",
      "entry_tags",
      "entry_edit_logs",
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain("alter publication supabase_realtime add table");
  });
});
