import { describe, expect, it } from "vitest";
import {
  isLocalSiteUrl,
  resolveServerSiteUrl,
  resolveShareBaseUrl,
} from "./site-url";

describe("site URL configuration", () => {
  it("recognizes loopback URLs", () => {
    expect(isLocalSiteUrl("http://localhost:3000")).toBe(true);
    expect(isLocalSiteUrl("http://127.0.0.1:3000")).toBe(true);
    expect(isLocalSiteUrl("https://stories.example")).toBe(false);
  });

  it("prefers an explicit production URL", () => {
    expect(
      resolveServerSiteUrl({
        publicSiteUrl: "https://stories.example",
        vercelProductionUrl: "preview.vercel.app",
      }).origin,
    ).toBe("https://stories.example");
  });

  it("replaces a local metadata URL when a deployment URL is available", () => {
    expect(
      resolveServerSiteUrl({
        publicSiteUrl: "http://localhost:3000",
        vercelProductionUrl: "stories.vercel.app",
      }).origin,
    ).toBe("https://stories.vercel.app");
  });

  it("falls back safely for local development and rejects unsupported protocols", () => {
    expect(resolveServerSiteUrl({ publicSiteUrl: "javascript:alert(1)" }).origin)
      .toBe("http://localhost:3000");
    expect(resolveShareBaseUrl(undefined, "http://localhost:3001").origin)
      .toBe("http://localhost:3001");
  });
});
