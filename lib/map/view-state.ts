import type { Coordinates, MapBoundsValue } from "@/types/map";

const MAP_VIEW_EPSILON = 0.000001;

export function coordinatesMatch(left: Coordinates, right: Coordinates) {
  return (
    Math.abs(left.latitude - right.latitude) < MAP_VIEW_EPSILON &&
    Math.abs(left.longitude - right.longitude) < MAP_VIEW_EPSILON
  );
}

export function boundsMatch(left: MapBoundsValue, right: MapBoundsValue) {
  return (
    Math.abs(left.north - right.north) < MAP_VIEW_EPSILON &&
    Math.abs(left.south - right.south) < MAP_VIEW_EPSILON &&
    Math.abs(left.east - right.east) < MAP_VIEW_EPSILON &&
    Math.abs(left.west - right.west) < MAP_VIEW_EPSILON
  );
}

export function getMapViewKey(center: Coordinates, bounds: MapBoundsValue) {
  return [
    center.latitude,
    center.longitude,
    bounds.north,
    bounds.south,
    bounds.east,
    bounds.west,
  ]
    .map((value) => value.toFixed(6))
    .join(":");
}
