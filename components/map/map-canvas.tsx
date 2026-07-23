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
  return L.divIcon({
    className: "story-marker-shell",
    html: `<span class="story-marker story-marker--${entry.visibility}${stateClass}" aria-label="${getCategoryLabel(entry.place_category_slug)}，${entry.visibility === "public" ? "公开" : entry.visibility === "private" ? "私密" : "群组"}"><span class="story-marker__category">${categorySvg}</span><span class="story-marker__state" aria-hidden="true">${stateGlyph}</span></span>`,
    iconSize: [36, 44],
    iconAnchor: [18, 40],
  });
}

type MapCanvasProps = {
  entries: MapEntryWithProfile[];
  selectedEntryId: string | null;
  draftCoordinates: Coordinates | null;
  onMapClick: (coordinates: Coordinates) => void;
  onEntryClick: (entry: MapEntryWithProfile) => void;
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

function SelectedEntryController({ entry }: { entry: MapEntryWithProfile | null }) {
  const map = useMap();

  useEffect(() => {
    if (entry) {
      map.flyTo([entry.latitude, entry.longitude], Math.max(map.getZoom(), 8), {
        duration: 0.7,
      });
    }
  }, [entry, map]);

  return null;
}

export function MapCanvas({
  entries,
  selectedEntryId,
  draftCoordinates,
  onMapClick,
  onEntryClick,
  onTileError,
  onLocationError,
  onViewChange,
}: MapCanvasProps) {
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? null;

  return (
    <MapContainer
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
      <SelectedEntryController entry={selectedEntry} />

      {entries.map((entry) => (
        <Marker
          key={entry.id}
          position={[entry.latitude, entry.longitude]}
          icon={createEntryIcon(entry, entry.id === selectedEntryId)}
          zIndexOffset={entry.id === selectedEntryId ? 900 : entry.visibility === "private" ? 300 : entry.visibility === "group" ? 200 : 100}
          eventHandlers={{
            click(event) {
              L.DomEvent.stopPropagation(event.originalEvent);
              onEntryClick(entry);
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -30]} opacity={0.96}>
            <strong>{entry.title}</strong><br />{getCategoryLabel(entry.place_category_slug)} · {entry.time_label}
          </Tooltip>
        </Marker>
      ))}

      {draftCoordinates ? (
        <Marker position={[draftCoordinates.latitude, draftCoordinates.longitude]} icon={draftIcon} zIndexOffset={1000}>
          <Tooltip direction="top" offset={[0, -30]} permanent>新记录位置</Tooltip>
        </Marker>
      ) : null}
    </MapContainer>
  );
}
