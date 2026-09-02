import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202609020001_v14_post_launch_fk_indexes.sql",
    import.meta.url,
  ),
  "utf8",
).toLocaleLowerCase("en-US");
const assertions = readFileSync(
  new URL(
    "../../supabase/tests/v14_post_launch_hardening_assertions.sql",
    import.meta.url,
  ),
  "utf8",
).toLocaleLowerCase("en-US");

describe("v1.4 post-launch foreign-key index migration", () => {
  it("adds all 22 advisor-reported foreign-key indexes idempotently", () => {
    expect(migration.match(/create index if not exists/g)).toHaveLength(22);
    expect(migration).toContain("set lock_timeout = '5s'");
    expect(migration).toContain("set statement_timeout = '10min'");
    expect(migration).toContain("entry_comments_user_id_idx");
    expect(migration).toContain("group_invitations_inviter_id_idx");
    expect(migration).toContain("notifications_actor_id_idx");
    expect(migration).toContain(
      "user_experience_preferences_first_story_id_idx",
    );
  });

  it("uses partial indexes for nullable audit and lifecycle references", () => {
    expect(migration.match(/where [a-z_]+ is not null;/g)).toHaveLength(19);
    expect(migration).toContain(
      "on public.map_entries (moderated_by)\n  where moderated_by is not null",
    );
    expect(migration).toContain(
      "on public.story_routes (featured_by)\n  where featured_by is not null",
    );
  });

  it("ships a read-only catalog assertion for every expected index", () => {
    expect(assertions).toContain("catalog-only assertion");
    expect(assertions).toContain("not index_metadata.indisvalid");
    expect(assertions).toContain("not index_metadata.indisready");
    expect(assertions).toContain("rollback;");
    expect(assertions).not.toMatch(/insert into|update public\.|delete from/);
  });
});
