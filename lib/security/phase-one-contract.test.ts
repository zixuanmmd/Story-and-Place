import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("v1.4 phase one application contract", () => {
  it("账号删除同时受 IP 和用户持久化限流保护", () => {
    const route = source("app/api/account/delete/route.ts");
    expect(route).toContain('scope: "account-delete-ip"');
    expect(route).toContain('scope: "account-delete-user"');
    expect(route).toContain('"retry-after"');
  });

  it("密码找回不泄露邮箱是否存在，重置页不允许索引", () => {
    const recovery = source("components/auth/password-recovery-form.tsx");
    const resetPage = source("app/reset-password/page.tsx");
    expect(recovery).toContain("如果该邮箱已注册");
    expect(recovery).not.toContain("auth.users");
    expect(resetPage).toContain("index: false");
  });

  it("灾备检查为本地只读 dry-run", () => {
    const output = execFileSync(process.execPath, [
      new URL("../../scripts/validate-disaster-recovery.mjs", import.meta.url).pathname,
    ], { encoding: "utf8" });
    expect(output).toContain("DR dry-run validation passed");
    expect(output).toContain("No database connection or remote mutation");
  });
});
