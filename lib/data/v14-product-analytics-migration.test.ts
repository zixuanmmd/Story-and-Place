import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/202608290002_v14_product_analytics.sql", import.meta.url),
  "utf8",
).toLocaleLowerCase("en-US");
const assertions = readFileSync(
  new URL("../../supabase/tests/v14_product_analytics_rls_assertions.sql", import.meta.url),
  "utf8",
).toLocaleLowerCase("en-US");

describe("v1.4 product analytics migration contract", () => {
  it("creates a private RLS table without direct browser privileges", () => {
    expect(migration).toContain("create table if not exists public.product_events");
    expect(migration).toContain("alter table public.product_events enable row level security");
    expect(migration).toContain("using (false)");
    expect(migration).toContain("revoke all on table public.product_events from public, anon, authenticated");
    expect(migration).not.toContain("grant select on public.product_events to authenticated");
    expect(migration).not.toContain("grant insert on public.product_events to authenticated");
  });

  it("derives the user from auth and accepts no user-id parameter", () => {
    expect(migration).toContain("actor uuid := (select auth.uid())");
    expect(migration).not.toContain("p_user_id uuid");
    expect(migration).toContain("on conflict (id) do nothing");
  });

  it("hardens and minimally grants both RPCs", () => {
    expect(migration.match(/security definer\nset search_path = ''/g)).toHaveLength(2);
    expect(migration).toContain("revoke all on function public.track_product_event");
    expect(migration).toContain("grant execute on function public.track_product_event(uuid, uuid, text, jsonb)\n  to anon, authenticated");
    expect(migration).toContain("grant execute on function public.admin_get_product_analytics(timestamptz, timestamptz)\n  to authenticated");
    expect(migration).toContain("perform private.assert_app_admin()");
  });

  it("uses allowlisted scalar properties and bounds ingestion", () => {
    expect(migration).toContain("unsafe analytics properties");
    expect(migration).toContain("jsonb_typeof(property.value) not in ('string', 'number', 'boolean', 'null')");
    expect(migration).toContain("analytics rate limit exceeded");
    expect(migration).toContain("pg_advisory_xact_lock");
  });

  it("ships executable multi-identity permission assertions", () => {
    expect(assertions).toContain("anonymous event must not have a user id");
    expect(assertions).toContain("authenticated event must derive user id from auth.uid");
    expect(assertions).toContain("non-admin unexpectedly read aggregate analytics");
    expect(assertions).toContain("raw event table privileges are too broad");
    expect(assertions).toContain("rollback;");
  });
});
