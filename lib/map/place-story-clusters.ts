import type { MapEntryWithProfile } from "@/types/database";
import { getEntryPlaybackYear } from "@/lib/map/time-playback";

export const NAMED_PLACE_CLUSTER_RADIUS_METERS = 60;
export const UNNAMED_PLACE_CLUSTER_RADIUS_METERS = 5;

export type PlaceStoryCluster = {
  id: string;
  placeName: string | null;
  latitude: number;
  longitude: number;
  entries: MapEntryWithProfile[];
};

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(value: number) {
  return value * Math.PI / 180;
}

export function distanceBetweenCoordinates(
  first: Pick<MapEntryWithProfile, "latitude" | "longitude">,
  second: Pick<MapEntryWithProfile, "latitude" | "longitude">,
) {
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);
  const latitudeDelta = secondLatitude - firstLatitude;
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude)
      * Math.cos(secondLatitude)
      * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function normalizePlaceName(value: string | null) {
  if (!value) return "";
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function timeSortToken(entry: MapEntryWithProfile) {
  if (entry.occurred_local) return entry.occurred_local;
  if (entry.occurred_date) return `${entry.occurred_date}T00:00`;
  if (entry.occurred_at) return entry.occurred_at;
  const year = getEntryPlaybackYear(entry);
  return year ? `${String(year).padStart(4, "0")}-99-99T99:99` : null;
}

export function sortPlaceStories(entries: MapEntryWithProfile[]) {
  return [...entries].sort((left, right) => {
    const leftToken = timeSortToken(left);
    const rightToken = timeSortToken(right);
    if (leftToken === null && rightToken !== null) return 1;
    if (leftToken !== null && rightToken === null) return -1;
    const timeComparison = (leftToken ?? "").localeCompare(rightToken ?? "");
    if (timeComparison) return timeComparison;
    const createdComparison = left.created_at.localeCompare(right.created_at);
    if (createdComparison) return createdComparison;
    return left.id.localeCompare(right.id);
  });
}

type MutablePlaceCluster = PlaceStoryCluster & { normalizedName: string };

export function clusterEntriesByPlace(
  entries: MapEntryWithProfile[],
): PlaceStoryCluster[] {
  const orderedEntries = [...entries].sort((left, right) => {
    const nameComparison = normalizePlaceName(left.place_name)
      .localeCompare(normalizePlaceName(right.place_name), "zh-CN");
    if (nameComparison) return nameComparison;
    const latitudeComparison = left.latitude - right.latitude;
    if (latitudeComparison) return latitudeComparison;
    const longitudeComparison = left.longitude - right.longitude;
    if (longitudeComparison) return longitudeComparison;
    return left.id.localeCompare(right.id);
  });
  const clusters: MutablePlaceCluster[] = [];

  for (const entry of orderedEntries) {
    const normalizedName = normalizePlaceName(entry.place_name);
    const radius = normalizedName
      ? NAMED_PLACE_CLUSTER_RADIUS_METERS
      : UNNAMED_PLACE_CLUSTER_RADIUS_METERS;
    let nearest: MutablePlaceCluster | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const cluster of clusters) {
      if (cluster.normalizedName !== normalizedName) continue;
      const distance = distanceBetweenCoordinates(cluster, entry);
      if (distance <= radius && distance < nearestDistance) {
        nearest = cluster;
        nearestDistance = distance;
      }
    }

    if (nearest) {
      nearest.entries.push(entry);
      continue;
    }

    clusters.push({
      id: `place-${entry.id}`,
      normalizedName,
      placeName: entry.place_name?.trim() || null,
      latitude: entry.latitude,
      longitude: entry.longitude,
      entries: [entry],
    });
  }

  return clusters.map((cluster) => ({
    id: cluster.id,
    placeName: cluster.placeName,
    latitude: cluster.latitude,
    longitude: cluster.longitude,
    entries: sortPlaceStories(cluster.entries),
  }));
}
