import { describe, expect, it } from "vitest";
import { boundsMatch, coordinatesMatch, getMapViewKey } from "./view-state";

const center = { latitude: 31.2304, longitude: 121.4737 };
const bounds = { north: 40, south: 20, east: 130, west: 110 };

describe("地图视野状态去重", () => {
  it("把浮点微小误差视为同一中心和边界", () => {
    expect(
      coordinatesMatch(center, {
        latitude: center.latitude + 0.0000001,
        longitude: center.longitude - 0.0000001,
      }),
    ).toBe(true);
    expect(
      boundsMatch(bounds, {
        ...bounds,
        north: bounds.north + 0.0000001,
      }),
    ).toBe(true);
  });

  it("相同视野生成稳定键，真实移动会生成新键", () => {
    const first = getMapViewKey(center, bounds);
    expect(
      getMapViewKey(
        {
          latitude: center.latitude + 0.00000001,
          longitude: center.longitude,
        },
        bounds,
      ),
    ).toBe(first);
    expect(
      getMapViewKey({ ...center, latitude: center.latitude + 0.01 }, bounds),
    ).not.toBe(first);
  });
});
