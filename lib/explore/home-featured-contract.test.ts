import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mapExperience = readFileSync(
  new URL("../../components/map/map-experience.tsx", import.meta.url),
  "utf8",
);
const data = readFileSync(
  new URL("../data/explore.ts", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

describe("homepage editorial pick contract", () => {
  it("requests only one RLS-filtered featured public story", () => {
    expect(mapExperience).toContain("listFeaturedPublicEntries(1)");
    expect(data).toContain('rpc("get_featured_public_entries"');
    expect(data).toContain('.eq("visibility", "public")');
  });

  it("links the featured story back into the existing map detail flow", () => {
    expect(mapExperience).toContain('aria-label="编辑精选"');
    expect(mapExperience).toContain("/?entry=${featuredHomeEntry.id}");
    expect(mapExperience).toContain("featuredHomeEntry.title");
  });

  it("keeps the callout compact and responsive without replacing the map", () => {
    expect(styles).toContain(".map-featured-callout");
    expect(styles).toContain("bottom: 72px");
    expect(mapExperience).toContain("<MapCanvas");
  });
});
