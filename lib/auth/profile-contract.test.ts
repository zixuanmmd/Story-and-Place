import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const initialMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202607220001_initial_schema.sql"),
  "utf8",
);
const supabaseClient = readFileSync(
  join(process.cwd(), "lib/supabase/client.ts"),
  "utf8",
);
const authProvider = readFileSync(
  join(process.cwd(), "components/providers/auth-provider.tsx"),
  "utf8",
);

describe("registration and session contracts", () => {
  it("注册触发器以 auth user id 和显示名创建公开资料且不写入邮箱", () => {
    expect(initialMigration).toContain("after insert on auth.users");
    expect(initialMigration).toContain("new.raw_user_meta_data ->> 'display_name'");
    expect(initialMigration).toContain(
      "insert into public.profiles (id, display_name)",
    );
    expect(initialMigration).toContain("new.id");
    expect(initialMigration).not.toContain(
      "insert into public.profiles (id, display_name, email)",
    );
  });

  it("浏览器客户端持久化并自动刷新真实 Supabase session", () => {
    expect(supabaseClient).toContain("persistSession: true");
    expect(supabaseClient).toContain("autoRefreshToken: true");
  });

  it("退出时先清空本地 session 和 profile 再调用 Supabase signOut", () => {
    const sessionClear = authProvider.indexOf("setSession(null)");
    const profileClear = authProvider.indexOf(
      "setProfileState({ userId: null, profile: null })",
    );
    const remoteSignOut = authProvider.indexOf("supabase.auth.signOut()");

    expect(sessionClear).toBeGreaterThan(-1);
    expect(profileClear).toBeGreaterThan(sessionClear);
    expect(remoteSignOut).toBeGreaterThan(profileClear);
  });
});
