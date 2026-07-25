export type RoutePoint = {
  latitude: number;
  longitude: number;
};

function samePoint(left: RoutePoint, right: RoutePoint) {
  return left.latitude === right.latitude && left.longitude === right.longitude;
}

export function offsetOverlappingRoutePoints(points: RoutePoint[]) {
  const seen = new Map<string, number>();
  return points.map((point) => {
    const key = `${point.latitude.toFixed(6)}:${point.longitude.toFixed(6)}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    if (occurrence === 0) return point;
    const angle = occurrence * 2.399963229728653;
    const radius = Math.min(0.00012 * Math.ceil(occurrence / 6), 0.0006);
    return {
      latitude: point.latitude + Math.sin(angle) * radius,
      longitude: point.longitude + Math.cos(angle) * radius,
    };
  });
}

export function splitRouteAtAntimeridian(points: RoutePoint[]) {
  if (points.length < 2) return points.length ? [points] : [];
  const segments: RoutePoint[][] = [[points[0]]];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (samePoint(previous, current)) {
      segments.at(-1)?.push(current);
      continue;
    }
    const delta = current.longitude - previous.longitude;
    if (Math.abs(delta) <= 180) {
      segments.at(-1)?.push(current);
      continue;
    }
    const adjustedCurrent = current.longitude + (delta > 180 ? -360 : 360);
    const boundary = delta > 180 ? -180 : 180;
    const ratio = (boundary - previous.longitude) / (adjustedCurrent - previous.longitude);
    const latitude = previous.latitude + (current.latitude - previous.latitude) * ratio;
    segments.at(-1)?.push({ latitude, longitude: boundary });
    segments.push([{ latitude, longitude: -boundary }, current]);
  }
  return segments;
}
