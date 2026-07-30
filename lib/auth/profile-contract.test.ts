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
const appProviders = readFileSync(
  join(process.cwd(), "components/providers/app-providers.tsx"),
  "utf8",
);
const tagEntriesView = readFileSync(
  join(process.cwd(), "components/tags/tag-entries-view.tsx"),
  "utf8",
);
const appHeader = readFileSync(
  join(process.cwd(), "components/navigation/app-header.tsx"),
  "utf8",
);
const mapExperience = readFileSync(
  join(process.cwd(), "components/map/map-experience.tsx"),
  "utf8",
);
const mapCanvas = readFileSync(
  join(process.cwd(), "components/map/map-canvas.tsx"),
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

  it("退出过渡期间先阻止数据渲染，凭证清除后才进入匿名作用域", () => {
    const transitionStart = authProvider.indexOf("setSigningOut(true)");
    const remoteSignOut = authProvider.indexOf("supabase.auth.signOut()");
    const sessionClear = authProvider.indexOf("setSession(null)");
    const profileClear = authProvider.indexOf(
      "setProfileState({ userId: null, profile: null })",
    );
    const transitionEnd = authProvider.indexOf("setSigningOut(false)");

    expect(transitionStart).toBeGreaterThan(-1);
    expect(remoteSignOut).toBeGreaterThan(transitionStart);
    expect(sessionClear).toBeGreaterThan(remoteSignOut);
    expect(sessionClear).toBeGreaterThan(-1);
    expect(profileClear).toBeGreaterThan(sessionClear);
    expect(transitionEnd).toBeGreaterThan(profileClear);
    expect(authProvider).toContain('dataScope = signingOut');
    expect(authProvider).toContain("dataReady = !loading && !signingOut");
    expect(authProvider).toContain('"story-map-pending-entry"');
    expect(authProvider).toContain('"story-route-selection-v1"');
  });

  it("认证数据边界在身份变化时重挂载客户端树并清空页面状态", () => {
    expect(appProviders).toContain("if (!dataReady)");
    expect(appProviders).toContain("<AuthScopedTree key={dataScope}>");
  });

  it("退出后不使用保留客户端状态的刷新，并按认证作用域重建地图", () => {
    expect(appHeader).not.toContain("router.refresh()");
    expect(mapExperience).toContain("scopeKey={scope}");
    expect(mapExperience).toContain("key={scope}");
    expect(mapCanvas).toContain("key={scopeKey}");
  });

  it("标签聚合按认证作用域重挂载并拒绝过期请求回写", () => {
    expect(tagEntriesView).toContain(
      'key={`${dataScope}:${slug}`}',
    );
    expect(tagEntriesView).toContain("requestSequence.current !== requestId");
    expect(tagEntriesView).toContain("requestSequence.current += 1");
  });
});
