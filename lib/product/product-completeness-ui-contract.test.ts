import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const providers = read("../../components/providers/app-providers.tsx");
const feedback = read("../../components/feedback/global-feedback.tsx");
const authForm = read("../../components/auth/auth-form.tsx");
const status = read("../../components/status/status-view.tsx");
const healthRoute = read("../../app/api/health/route.ts");

describe("product completeness UI contract", () => {
  it("places a privacy-bounded feedback entry in the global app tree", () => {
    expect(providers).toContain("<GlobalFeedback />");
    expect(feedback).toContain("不会自动收集故事正文、密码、登录令牌或截图");
    expect(feedback).toContain('aria-haspopup="dialog"');
    expect(feedback).toContain('event.key === "Escape"');
    expect(feedback).toContain("onClose={() => triggerRef.current?.focus()}");
    expect(feedback).not.toContain("window.location.search");
  });

  it("links registration to clearly marked legal drafts", () => {
    expect(authForm).toContain('href="/terms"');
    expect(authForm).toContain('href="/privacy"');
    expect(authForm).toContain('href="/community-guidelines"');
    for (const path of ["terms", "privacy", "community-guidelines"]) {
      expect(read(`../../app/${path}/page.tsx`)).toContain("draft");
    }
  });

  it("shows current component health without claiming historical SLA", () => {
    expect(status).toContain("Web App");
    expect(status).toContain("Database");
    expect(status).toContain("Media");
    expect(status).toContain("不提供或伪造历史 SLA");
    expect(status).toContain("AbortSignal.timeout(6_000)");
    expect(healthRoute).toContain("resolveWithinTimeout(checkMedia())");
  });
});
