import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/202608280002_v14_story_media.sql", import.meta.url),
  "utf8",
).toLocaleLowerCase("en-US");
const assertions = readFileSync(
  new URL("../../supabase/tests/v14_story_media_rls_assertions.sql", import.meta.url),
  "utf8",
).toLocaleLowerCase("en-US");

describe("v1.4 story media migration contract", () => {
  it("uses a private bucket and limits stored output to processed WebP", () => {
    expect(migration).toContain("'story-media'");
    expect(migration).toContain("public = false");
    expect(migration).toContain("array['image/webp']::text[]");
    expect(migration).toContain("constraint entry_media_storage_path_shape");
  });

  it("applies parent-story ACL to asset rows and Storage objects", () => {
    expect(migration).toContain("alter table public.entry_media_assets enable row level security");
    expect(migration).toContain("alter table public.media_cleanup_queue enable row level security");
    expect(migration).toContain("on storage.objects for select to anon, authenticated");
    expect(migration).toContain("public.can_read_entry(asset.entry_id)");
    expect(migration).not.toContain("grant insert on table public.entry_media_assets to authenticated");
    expect(migration).not.toContain("grant update on table public.entry_media_assets to authenticated");
  });

  it("enforces owner reservations, ten images and a storage quota transactionally", () => {
    expect(migration).toContain("entry.user_id = actor");
    expect(migration).toContain(">= 10");
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(migration).toContain("524288000::bigint");
  });

  it("hardens RPC grants and leaves cleanup to service role", () => {
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("function public.reserve_entry_media_asset(uuid, uuid, text, bigint, bigint, integer, integer)\nto service_role");
    expect(migration).not.toContain("function public.reserve_entry_media_asset(uuid, uuid, text, bigint, bigint, integer, integer)\nto authenticated");
    expect(migration).toContain("function public.claim_story_media_cleanup(integer)\nto service_role");
    expect(migration).toContain("function public.complete_entry_media_asset_delete(uuid)\nto service_role");
    expect(migration).toContain("from public, anon, authenticated");
  });

  it("retains Storage cleanup paths across entry and account cascades", () => {
    expect(migration).toContain("function private.queue_deleted_entry_media_asset");
    expect(migration).toContain("before delete on public.entry_media_assets");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("asset.created_at < now() - interval '1 hour'");
  });

  it("ships executable multi-identity assertions", () => {
    expect(assertions).toContain("set local role anon");
    expect(assertions).toContain("group creation trigger already inserts a as owner");
    expect(assertions).toContain("group-entry validation derives the actor from the jwt");
    expect(assertions).toContain("request.jwt.claims");
    expect(assertions).toContain("a must read all four authorized media rows");
    expect(assertions).toContain("b must read public and active-group media only");
    expect(assertions).toContain("locked capsule media must not leak");
    expect(assertions).toContain("rollback;");
  });
});
