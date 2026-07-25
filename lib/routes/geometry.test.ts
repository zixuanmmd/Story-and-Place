import { describe, expect, it } from "vitest";
import { offsetOverlappingRoutePoints, splitRouteAtAntimeridian } from "./geometry";

describe("story route geometry", () => {
  it("keeps ordinary segments together", () => {
    expect(splitRouteAtAntimeridian([
      { latitude: 20, longitude: 100 },
      { latitude: 30, longitude: 120 },
    ])).toHaveLength(1);
  });

  it("splits a line crossing the international date line", () => {
    const segments = splitRouteAtAntimeridian([
      { latitude: 10, longitude: 179 },
      { latitude: 12, longitude: -179 },
    ]);
    expect(segments).toHaveLength(2);
    expect(segments[0].at(-1)?.longitude).toBe(180);
    expect(segments[1][0].longitude).toBe(-180);
  });

  it("gives overlapping nodes a small deterministic visual offset", () => {
    const points = offsetOverlappingRoutePoints([
      { latitude: 31, longitude: 121 },
      { latitude: 31, longitude: 121 },
    ]);
    expect(points[0]).toEqual({ latitude: 31, longitude: 121 });
    expect(points[1]).not.toEqual(points[0]);
  });
});
