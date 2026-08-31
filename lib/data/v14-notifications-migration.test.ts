import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/202608280001_v14_notifications.sql", import.meta.url),
  "utf8",
).toLocaleLowerCase("en-US");
const assertions = readFileSync(
  new URL("../../supabase/tests/v14_notifications_rls_assertions.sql", import.meta.url),
  "utf8",
).toLocaleLowerCase("en-US");

describe("v1.4 notification migration contract", () => {
  it("enables RLS and keeps browser roles away from notification creation and outbox", () => {
    for (const table of [
      "public.notifications",
      "public.notification_preferences",
      "public.notification_email_outbox",
    ]) {
      expect(migration).toContain(`alter table ${table} enable row level security`);
    }
    expect(migration).toContain("grant select on table public.notifications to authenticated");
    expect(migration).toContain("revoke all on table public.notification_email_outbox from anon, authenticated");
    expect(migration).not.toContain("grant insert on table public.notifications to authenticated");
  });

  it("hardens privileged functions and grants only minimal RPC access", () => {
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("function public.mark_notification_read(uuid) to authenticated");
    expect(migration).toContain("function public.claim_notification_email_outbox(integer) to service_role");
    expect(migration).toContain("function public.finish_notification_email_outbox(uuid, boolean, text) to service_role");
    expect(migration).toContain("function private.enqueue_user_notification");
    expect(migration).toContain("from public, anon, authenticated");
  });

  it("does not copy story bodies, coordinates, email addresses, or tokens into notification payloads", () => {
    expect(migration).not.toMatch(/jsonb_build_object\([\s\S]{0,300}'content'/);
    expect(migration).not.toMatch(/jsonb_build_object\([\s\S]{0,300}'latitude'/);
    expect(migration).not.toMatch(/jsonb_build_object\([\s\S]{0,300}'longitude'/);
    expect(migration).not.toContain("access_token");
    expect(migration).not.toContain("refresh_token");
    expect(migration).not.toContain("email_address");
  });

  it("deduplicates deliveries and keeps time-capsule synchronization owner scoped", () => {
    expect(migration).toContain("notifications_user_dedupe_idx");
    expect(migration).toContain("notification_email_outbox_user_dedupe_idx");
    expect(migration).toContain("private.sync_due_capsules_for_user(actor, p_limit)");
    expect(migration).toContain("entry.user_id = p_user_id");
    expect(migration).toContain("entry.unlock_at <= now()");
  });

  it("removes private notification data when account deletion completes", () => {
    expect(migration).toContain("function private.handle_account_deletion_notification_data");
    expect(migration).toContain("delete from public.notification_email_outbox where user_id = new.user_id");
    expect(migration).toContain("delete from public.notifications where user_id = new.user_id");
    expect(migration).toContain("delete from public.notification_preferences where user_id = new.user_id");
  });

  it("ships executable local RLS assertions", () => {
    expect(assertions).toContain("set local role anon");
    expect(assertions).toContain("set local role authenticated");
    expect(assertions).toContain("a must not read b notifications");
    expect(assertions).toContain("security preference must reject off");
    expect(assertions).toContain("rollback;");
  });
});
