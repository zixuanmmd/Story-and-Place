import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202607250002_group_membership_hardening.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("群组成员完整性加固 migration", () => {
  it("使用延迟约束保证群组始终保留有效群主", () => {
    expect(migration).toContain("ensure_group_has_active_owner");
    expect(migration).toContain("deferrable initially deferred");
    expect(migration).toContain("group must retain at least one active owner");
  });

  it("重复加入不会覆盖有效成员的角色", () => {
    expect(migration).toContain("if existing_status = 'active' then");
    expect(migration).not.toMatch(
      /on conflict\s*\(group_id,\s*user_id\)\s*do update[\s\S]*?role\s*=\s*'member'/i,
    );
  });

  it("明确撤销匿名用户对认证 RPC 的执行权限", () => {
    for (const signature of [
      "public.join_public_group(uuid)",
      "public.is_group_admin(uuid)",
      "public.can_interact_entry(uuid)",
      "public.get_social_feed(timestamptz, uuid, integer)",
    ]) {
      expect(migration).toContain(
        `revoke execute on function ${signature} from public, anon`,
      );
    }
  });
});
