import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202608050001_time_capsules.sql",
    import.meta.url,
  ),
  "utf8",
);

function body(name: string, nextName: string) {
  const start = migration.indexOf(`function public.${name}`);
  const end = migration.indexOf(`function public.${nextName}`, start + 1);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("time capsule migration contract", () => {
  it("makes the creator the only future-capsule reader", () => {
    const readBody = body("can_read_entry", "can_collaborate_entry");
    expect(readBody).toContain("entry.unlock_at > now()");
    expect(readBody).toContain("entry.user_id = (select auth.uid())");
    expect(readBody).toContain("entry.unlock_at is null or entry.unlock_at <= now()");
    expect(readBody).toContain("public.is_active_group_member(entry.group_id)");
  });

  it("does not let accepted participants collaborate before unlock", () => {
    for (const [name, next] of [
      ["can_collaborate_entry", "can_edit_entry_field"],
      ["can_edit_entry_field", "can_read_entry_edit_log"],
      ["can_read_entry_edit_log", "can_interact_entry"],
    ] as const) {
      const functionSql = body(name, next);
      expect(functionSql).toContain("entry.unlock_at is null or entry.unlock_at <= now()");
      expect(functionSql).toContain("participant.status = 'accepted'");
    }
  });

  it("reserves unlock changes for the owner and rejects past unlocks", () => {
    const updateBody = body("update_entry_v11", "get_social_feed_v11");
    expect(updateBody).toContain("existing.user_id <> actor");
    expect(updateBody).toContain("only the entry owner can change unlock time");
    expect(updateBody).toContain("target_unlock_at <= now()");
    expect(updateBody.indexOf("set unlock_at = target_unlock_at")).toBeLessThan(
      updateBody.indexOf("updated_entry := public.update_entry"),
    );
    expect(migration).toContain("unlock time must be in the future");
  });

  it("writes unlock_at in the initial insert instead of a later update", () => {
    const createBody = body("create_entry_v11", "update_entry_v11");
    expect(createBody).toContain("insert into public.map_entries");
    expect(createBody).toContain("allow_comments,\n    unlock_at");
    expect(createBody).not.toContain("created_entry := public.create_entry");
  });

  it("filters security-definer feed rows through canonical read permission", () => {
    const feedBody = body("get_social_feed_v11", "get_timeline_entries_v11");
    expect(feedBody).toContain("public.can_read_entry(entry.id)");
    expect(feedBody).toContain("entry.unlock_at");
  });

  it("supports normal, unlocked and future timeline states before pagination", () => {
    const timelineBody = body(
      "get_timeline_entries_v11",
      "protect_routes_for_time_capsule",
    );
    expect(timelineBody).toContain("p_capsule_state = 'current'");
    expect(timelineBody).toContain("p_capsule_state = 'past'");
    expect(timelineBody).toContain("p_capsule_state = 'future'");
    expect(timelineBody.indexOf("p_capsule_state = 'future'")).toBeLessThan(
      timelineBody.indexOf("offset greatest"),
    );
  });

  it("prevents routes from exposing locked capsule existence", () => {
    expect(migration).toContain("function public.protect_routes_for_time_capsule");
    expect(migration).toContain("visibility = 'private'");
    expect(migration).toContain("delete from public.story_route_items item");
    expect(migration).toContain("route.created_by <> new.user_id");
    expect(migration).toContain("function public.guard_capsule_story_route_item");
    expect(migration).toContain(
      "locked capsule is only eligible for its owner private route",
    );
  });

  it("keeps every new function on an empty search path with explicit ACL", () => {
    for (const name of [
      "create_entry_v11",
      "update_entry_v11",
      "get_social_feed_v11",
      "get_timeline_entries_v11",
      "protect_routes_for_time_capsule",
      "guard_capsule_story_route_item",
    ]) {
      expect(migration).toMatch(
        new RegExp(`function public\\.${name}\\([\\s\\S]*?set search_path = ''`),
      );
      expect(migration).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\(`),
      );
    }
  });
});
