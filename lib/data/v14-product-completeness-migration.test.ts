import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/202608290004_v14_product_completeness.sql", import.meta.url),
  "utf8",
).toLocaleLowerCase("en-US");
const assertions = readFileSync(
  new URL("../../supabase/tests/v14_product_completeness_rls_assertions.sql", import.meta.url),
  "utf8",
).toLocaleLowerCase("en-US");
const feedbackApi = readFileSync(
  new URL("../../app/api/feedback/route.ts", import.meta.url),
  "utf8",
).toLocaleLowerCase("en-US");

describe("v1.4 product completeness migration contract", () => {
  it("creates bounded feedback and feature flag tables with RLS", () => {
    for (const table of ["product_feedback", "feature_flags", "feature_flag_overrides"]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
    }
    expect(migration).toContain("category in ('bug', 'feature', 'content', 'other')");
    expect(migration).toContain("char_length(btrim(message)) between 1 and 2000");
  });

  it("evaluates flags from auth identity without exposing override rows", () => {
    expect(migration).toContain("create or replace function public.get_evaluated_feature_flags()");
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("select auth.uid() as user_id");
    expect(migration).toContain("grant execute on function public.get_evaluated_feature_flags()\nto anon, authenticated");
    expect(migration).not.toContain("p_user_id");
  });

  it("keeps feedback behind a bounded, rate-limited server route", () => {
    expect(feedbackApi).toContain('scope: "product-feedback-ip"');
    expect(feedbackApi).toContain('scope: "product-feedback-user"');
    expect(feedbackApi).toContain("getverifiedrequestuser");
    expect(feedbackApi).toContain("getsupabaseserveradminclient");
    expect(feedbackApi).not.toContain("service_role_key");
    expect(feedbackApi).not.toContain("access_token:");
  });

  it("ships executable identity-isolation assertions", () => {
    expect(assertions).toContain("anonymous unexpectedly read raw feature flags");
    expect(assertions).toContain("authenticated browser unexpectedly inserted feedback directly");
    expect(assertions).toContain("b must not inherit a feature flag override");
    expect(assertions).toContain("rollback;");
  });
});
