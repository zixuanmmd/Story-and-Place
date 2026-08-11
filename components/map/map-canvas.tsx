"use client";

import L from "leaflet";
import { useCallback, useEffect, useRef } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { MapEntryWithProfile } from "@/types/database";
import type { Coordinates, MapBoundsValue } from "@/types/map";
import { getMapViewKey } from "@/lib/map/view-state";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getCategoryIcon,
  getCategoryLabel,
  getVisibilityMarkerGlyph,
} from "@/lib/categories/registry";
import { ENTRY_AUDIENCE_PRESENTATION } from "@/lib/privacy/presentation";
import type { PlaceStoryCluster } from "@/lib/map/place-story-clusters";

export const DEFAULT_CENTER: [number, number] = [25, 15];
export const DEFAULT_ZOOM = 2;

const draftIcon = L.divIcon({
  className: "story-marker-shell",
  html: '<span class="story-marker story-marker--draft"><span>＋</span></span>',
  iconSize: [36, 44],
  iconAnchor: [18, 40],
});

function createEntryIcon(entry: MapEntryWithProfile, isSelected: boolean) {
  const stateClass = isSelected ? " story-marker--selected" : "";
  const Icon = getCategoryIcon(entry.place_category_slug);
  const categorySvg = renderToStaticMarkup(
    <Icon aria-hidden="true" size={18} strokeWidth={2.2} />,
  );
  const stateGlyph = getVisibilityMarkerGlyph(entry.visibility);
  const capsuleBadge = entry.unlock_at
    ? '<span class="story-marker__capsule" aria-hidden="true">T</span>'
    : "";
  const capsuleLabel = entry.unlock_at ? "，时间胶囊" : "";
  return L.divIcon({
    className: "story-marker-shell",
    html: `<span class="story-marker story-marker--${entry.visibility}${stateClass}" aria-label="${getCategoryLabel(entry.place_category_slug)}，${ENTRY_AUDIENCE_PRESENTATION[entry.visibility].shortLabel}${capsuleLabel}"><span class="story-marker__category">${categorySvg}</span><span class="story-marker__state" aria-hidden="true">${stateGlyph}</span>${capsuleBadge}</span>`,
    iconSize: [36, 44],
    iconAnchor: [18, 40],
  });
}

function createPlaceClusterIcon(cluster: PlaceStoryCluster, isSelected: boolean) {
  const stateClass = isSelected ? " story-marker--selected" : "";
  const categories = new Set(cluster.entries.map((entry) => entry.place_category_slug));
  const category = categories.size === 1
    ? cluster.entries[0].place_category_slug
    : "other";
  const Icon = getCategoryIcon(category);
  const categorySvg = renderToStaticMarkup(
    <Icon aria-hidden="true" size={19} strokeWidth={2.2} />,
  );
  return L.divIcon({
    className: "story-marker-shell",
    html: `<span class="story-marker story-marker--cluster${stateClass}" aria-label="同一地点，${cluster.entries.length} 个故事"><span class="story-marker__category">${categorySvg}</span><span class="story-marker__count" aria-hidden="true">${cluster.entries.length}</span></span>`,
    iconSize: [42, 48],
    iconAnchor: [21, 43],
  });
}

type MapCanvasProps = {
  scopeKey: string;
  entries?: MapEntryWithProfile[];
  clusters?: PlaceStoryCluster[];
  selectedEntryId: string | null;
  selectedClusterId?: string | null;
  draftCoordinates: Coordinates | null;
  onMapClick: (coordinates: Coordinates) => void;
  onEntryClick: (entry: MapEntryWithProfile) => void;
  onPlaceClusterClick?: (cluster: PlaceStoryCluster) => void;
  onTileError: () => void;
  onLocationError: (message: string) => void;
  onViewChange: (center: Coordinates, bounds: MapBoundsValue) => void;
};

function readMapState(map: L.Map) {
  const center = map.getCenter();
  const bounds = map.getBounds();
  return {
    center: { latitude: center.lat, longitude: center.lng },
    bounds: {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    },
  };
}

function MapEvents({
  onMapClick,
  onViewChange,
}: Pick<MapCanvasProps, "onMapClick" | "onViewChange">) {
  const map = useMap();
  const lastViewKey = useRef<string | null>(null);

  const emitViewChange = useCallback(() => {
    const state = readMapState(map);
    const viewKey = getMapViewKey(state.center, state.bounds);

    if (lastViewKey.current === viewKey) return;
    lastViewKey.current = viewKey;
    onViewChange(state.center, state.bounds);
  }, [map, onViewChange]);

  useMapEvents({
    click(event) {
      onMapClick({
        latitude: Number(event.latlng.lat.toFixed(6)),
        longitude: Number(event.latlng.lng.toFixed(6)),
      });
    },
    moveend() {
      emitViewChange();
    },
  });

  useEffect(() => {
    emitViewChange();
  }, [emitViewChange]);

  return null;
}

function MapActions({ onLocationError }: Pick<MapCanvasProps, "onLocationError">) {
  const map = useMap();

  const locateUser = () => {
    if (!("geolocation" in navigator)) {
      onLocationError("当前浏览器不支持定位功能。");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => map.flyTo([coords.latitude, coords.longitude], 14),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          onLocationError("定位权限未开启，你可以在浏览器设置中允许后重试。");
        } else {
          onLocationError("暂时无法取得当前位置，请稍后重试。");
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="map-actions" aria-label="地图操作">
      <button type="button" title="回到默认视野" aria-label="回到默认视野" onClick={() => map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM)}>◎</button>
      <button type="button" title="定位到当前位置" aria-label="定位到当前位置" onClick={locateUser}>⌖</button>
    </div>
  );
}

function SelectedLocationController({
  location,
}: {
  location: Pick<MapEntryWithProfile, "latitude" | "longitude"> | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (location) {
      map.flyTo([location.latitude, location.longitude], Math.max(map.getZoom(), 8), {
        duration: 0.7,
      });
    }
  }, [location, map]);

  return null;
}

export function MapCanvas({
  scopeKey,
  entries = [],
  clusters,
  selectedEntryId,
  selectedClusterId = null,
  draftCoordinates,
  onMapClick,
  onEntryClick,
  onPlaceClusterClick,
  onTileError,
  onLocationError,
  onViewChange,
}: MapCanvasProps) {
  const renderedClusters = clusters ?? entries.map((entry) => ({
    id: `entry-${entry.id}`,
    placeName: entry.place_name,
    latitude: entry.latitude,
    longitude: entry.longitude,
    entries: [entry],
  }));
  const selectedEntry = renderedClusters
    .flatMap((cluster) => cluster.entries)
    .find((entry) => entry.id === selectedEntryId) ?? null;
  const selectedCluster = renderedClusters.find((cluster) => cluster.id === selectedClusterId) ?? null;

  return (
    <MapContainer
      key={scopeKey}
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      minZoom={2}
      worldCopyJump
      className="story-map"
      attributionControl
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        eventHandlers={{ tileerror: onTileError }}
      />
      <MapEvents onMapClick={onMapClick} onViewChange={onViewChange} />
      <MapActions onLocationError={onLocationError} />
      <SelectedLocationController location={selectedEntry ?? selectedCluster} />

      {renderedClusters.map((cluster) => {
        const entry = cluster.entries[0];
        const isCluster = cluster.entries.length > 1;
        const isSelected = cluster.id === selectedClusterId
          || cluster.entries.some((item) => item.id === selectedEntryId);
        return (
          <Marker
            key={cluster.id}
            position={[cluster.latitude, cluster.longitude]}
            icon={isCluster
              ? createPlaceClusterIcon(cluster, isSelected)
              : createEntryIcon(entry, isSelected)}
            zIndexOffset={isSelected ? 900 : isCluster ? 400 : entry.visibility === "private" ? 300 : entry.visibility === "group" ? 200 : 100}
            eventHandlers={{
              click(event) {
                L.DomEvent.stopPropagation(event.originalEvent);
                if (isCluster && onPlaceClusterClick) onPlaceClusterClick(cluster);
                else onEntryClick(entry);
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -30]} opacity={0.96}>
              {isCluster ? (
                <><strong>{cluster.placeName ?? "同一地点"}</strong><br />{cluster.entries.length} 个故事 · {cluster.entries[0].time_label} 起</>
              ) : (
                <><strong>{entry.title}</strong><br />{getCategoryLabel(entry.place_category_slug)} · {entry.time_label}{entry.unlock_at ? " · 时间胶囊" : ""}</>
              )}
            </Tooltip>
          </Marker>
        );
      })}

      {draftCoordinates ? (
        <Marker position={[draftCoordinates.latitude, draftCoordinates.longitude]} icon={draftIcon} zIndexOffset={1000}>
          <Tooltip direction="top" offset={[0, -30]} permanent>新记录位置</Tooltip>
        </Marker>
      ) : null}
    </MapContainer>
  );
}
