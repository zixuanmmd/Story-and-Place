import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/202608290003_v14_commercial_foundation.sql", import.meta.url),
  "utf8",
).toLocaleLowerCase("en-US");
const assertions = readFileSync(
  new URL("../../supabase/tests/v14_commercial_foundation_rls_assertions.sql", import.meta.url),
  "utf8",
).toLocaleLowerCase("en-US");

describe("v1.4 commercial foundation migration contract", () => {
  it("creates typed plans, entitlements and private subscription state", () => {
    expect(migration).toContain("create table if not exists public.plans");
    expect(migration).toContain("create table if not exists public.plan_entitlements");
    expect(migration).toContain("create table if not exists public.user_subscriptions");
    expect(migration).toContain("value_type in ('boolean', 'integer')");
    expect(migration).toContain("status in ('trialing', 'active', 'past_due', 'canceled')");
  });

  it("enables RLS and keeps subscription writes away from browsers", () => {
    expect(migration).toContain("alter table public.plans enable row level security");
    expect(migration).toContain("alter table public.plan_entitlements enable row level security");
    expect(migration).toContain("alter table public.user_subscriptions enable row level security");
    expect(migration).toContain("grant select on table public.user_subscriptions to authenticated");
    expect(migration).not.toContain("grant insert on table public.user_subscriptions");
    expect(migration).not.toContain("grant update on table public.user_subscriptions");
  });

  it("hardens helpers and derives the public usage RPC identity from auth", () => {
    expect(migration).toContain("actor uuid := (select auth.uid())");
    expect(migration).toContain("create or replace function public.get_my_commercial_access()");
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("revoke all on function private.resolve_user_plan_code(uuid) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.get_my_commercial_access() to authenticated");
  });

  it("enforces media and route quotas inside serialized database writes", () => {
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(migration).toContain("story media storage quota reached");
    expect(migration).toContain("story media file quota reached");
    expect(migration).toContain("story route quota reached");
    expect(migration).toContain("story_routes_enforce_entitlement_quota");
  });

  it("ships executable multi-identity and quota assertions", () => {
    expect(assertions).toContain("b must not read a subscription");
    expect(assertions).toContain("authenticated browser unexpectedly changed a subscription");
    expect(assertions).toContain("second active route unexpectedly exceeded quota");
    expect(assertions).toContain("second media reservation unexpectedly exceeded file quota");
    expect(assertions).toContain("rollback;");
  });
});
