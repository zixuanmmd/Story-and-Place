import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  new URL("../../app/api/admin/session/route.ts", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../../app/admin/page.tsx", import.meta.url),
  "utf8",
);

describe("admin route protection contract", () => {
  it("builds the server session only from a verified bearer user and database role", () => {
    expect(route).toContain("getVerifiedRequestUser(accessToken)");
    expect(route).toContain('supabase.rpc("is_app_admin")');
    expect(route).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("keeps the short-lived admin credential HttpOnly and same-site", () => {
    expect(route).toContain("httpOnly: true");
    expect(route).toContain('sameSite: "strict"');
    expect(route).toContain('path: "/admin"');
    expect(route).toContain("maxAge: 60 * 60");
  });

  it("returns the same not-found boundary to non-admin visitors", () => {
    expect(page).toContain("await hasVerifiedAdminSession()");
    expect(page).toContain("notFound()");
    expect(page).toContain("index: false");
  });
});
