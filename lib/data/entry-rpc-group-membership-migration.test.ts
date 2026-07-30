import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202607300001_entry_rpc_group_membership.sql",
    import.meta.url,
  ),
  "utf8",
);

function functionBody(name: "create_entry" | "update_entry") {
  const start = migration.indexOf(
    `create or replace function public.${name}(`,
  );
  expect(start).toBeGreaterThan(-1);
  const nextFunction = migration.indexOf(
    "create or replace function public.",
    start + 1,
  );
  return migration.slice(
    start,
    nextFunction === -1 ? migration.length : nextFunction,
  );
}

describe("entry RPC target-group hardening migration", () => {
  it("is additive and defines an internal active-target assertion", () => {
    expect(migration).toContain(
      "function public.assert_entry_rpc_group_target",
    );
    expect(migration).toContain("target_group.archived_at is null");
    expect(migration).toContain(
      "public.is_active_group_member(p_group_id)",
    );
    expect(migration).toContain("active target group membership required");
    expect(migration).not.toMatch(
      /\b(drop table|drop column|truncate)\b/i,
    );
  });

  it("validates create_entry's requested target before inserting", () => {
    const body = functionBody("create_entry");
    expect(body).toContain("target_visibility :=");
    expect(body).toContain("target_group_id :=");
    expect(body).toContain("public.assert_entry_rpc_group_target");
    expect(body.indexOf("public.assert_entry_rpc_group_target")).toBeLessThan(
      body.indexOf("insert into public.map_entries"),
    );
  });

  it("validates update_entry's resulting target before updating", () => {
    const body = functionBody("update_entry");
    expect(body).toContain("else existing.visibility");
    expect(body).toContain("else existing.group_id");
    expect(body).toContain("public.assert_entry_rpc_group_target");
    expect(body.indexOf("public.assert_entry_rpc_group_target")).toBeLessThan(
      body.indexOf("update public.map_entries"),
    );
  });

  it("keeps the assertion unavailable to direct API roles", () => {
    expect(migration).toMatch(
      /revoke all on function public\.assert_entry_rpc_group_target\(text, uuid\)\s+from public, anon, authenticated;/,
    );
  });
});
