import { describe, expect, it } from "vitest";
import { getRouteShareUrl } from "./share";

describe("route sharing", () => {
  it("uses the configured public site URL", () => {
    expect(getRouteShareUrl("quiet-road", "https://stories.example/"))
      .toBe("https://stories.example/routes/quiet-road");
  });

  it("falls back to local development safely", () => {
    expect(getRouteShareUrl("a/b")).toBe("http://localhost:3000/routes/a%2Fb");
  });

  it("uses the current deployment origin instead of a stale localhost setting", () => {
    expect(
      getRouteShareUrl(
        "quiet-road",
        "http://localhost:3000",
        "https://stories.example",
      ),
    ).toBe("https://stories.example/routes/quiet-road");
  });

  it("does not replace an explicitly configured production origin", () => {
    expect(
      getRouteShareUrl(
        "quiet-road",
        "https://canonical.example",
        "https://preview.example",
      ),
    ).toBe("https://canonical.example/routes/quiet-road");
  });
});
