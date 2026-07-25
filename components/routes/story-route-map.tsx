"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import { getCategoryIcon, getCategoryLabel } from "@/lib/categories/registry";
import { offsetOverlappingRoutePoints, splitRouteAtAntimeridian } from "@/lib/routes/geometry";
import type { StoryRouteItemWithEntry } from "@/types/database";

function createNodeIcon(item: StoryRouteItemWithEntry, selected: boolean) {
  const entry = item.map_entries;
  const Icon = getCategoryIcon(entry?.place_category_slug);
  const icon = renderToStaticMarkup(<Icon aria-hidden="true" size={15} strokeWidth={2.2} />);
  const visibility = entry?.visibility ?? "private";
  return L.divIcon({
    className: "route-node-shell",
    html: `<span class="route-node route-node--${visibility}${selected ? " route-node--selected" : ""}"><span class="route-node__number">${item.position}</span><span class="route-node__icon">${icon}</span></span>`,
    iconSize: [42, 48],
    iconAnchor: [21, 43],
  });
}

function fitRoute(
  map: L.Map,
  points: Array<{ latitude: number; longitude: number }>,
) {
  if (!points.length) return;
    const baseLongitude = points[0].longitude;
    const adjusted = points.map((point) => {
      let longitude = point.longitude;
      while (longitude - baseLongitude > 180) longitude -= 360;
      while (longitude - baseLongitude < -180) longitude += 360;
      return L.latLng(point.latitude, longitude);
    });
  if (adjusted.length === 1) map.setView(adjusted[0], 11);
  else map.fitBounds(L.latLngBounds(adjusted), { padding: [44, 44], maxZoom: 13 });
}

function FitRoute({ points }: { points: Array<{ latitude: number; longitude: number }> }) {
  const map = useMap();
  useEffect(() => {
    fitRoute(map, points);
  }, [map, points]);
  return null;
}

function RouteMapActions({ points }: { points: Array<{ latitude: number; longitude: number }> }) {
  const map = useMap();
  return (
    <div className="map-actions" aria-label="路线地图操作">
      <button type="button" title="适配整条路线视野" aria-label="适配整条路线视野" disabled={!points.length} onClick={() => fitRoute(map, points)}>◎</button>
    </div>
  );
}

export function StoryRouteMap({
  items,
  selectedItemId,
  onSelect,
  onTileError,
}: {
  items: StoryRouteItemWithEntry[];
  selectedItemId: string | null;
  onSelect: (item: StoryRouteItemWithEntry) => void;
  onTileError: () => void;
}) {
  const visibleItems = useMemo(
    () => items.filter((item) => item.map_entries),
    [items],
  );
  const points = useMemo(
    () => offsetOverlappingRoutePoints(visibleItems.map((item) => ({
      latitude: item.map_entries?.latitude ?? 0,
      longitude: item.map_entries?.longitude ?? 0,
    }))),
    [visibleItems],
  );
  const segments = useMemo(() => splitRouteAtAntimeridian(points), [points]);

  return (
    <MapContainer center={[25, 15]} zoom={2} minZoom={2} worldCopyJump className="story-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        eventHandlers={{ tileerror: onTileError }}
      />
      <FitRoute points={points} />
      <RouteMapActions points={points} />
      {segments.map((segment, index) => (
        <Polyline
          key={`${index}:${segment.length}`}
          positions={segment.map((point) => [point.latitude, point.longitude])}
          pathOptions={{ color: "#6f5945", weight: 3, opacity: 0.78, dashArray: "8 7" }}
        />
      ))}
      {visibleItems.map((item, index) => {
        const entry = item.map_entries;
        if (!entry) return null;
        const point = points[index];
        return (
          <Marker
            key={item.id}
            position={[point.latitude, point.longitude]}
            icon={createNodeIcon(item, item.id === selectedItemId)}
            zIndexOffset={item.id === selectedItemId ? 1000 : 200 + item.position}
            eventHandlers={{ click: () => onSelect(item) }}
          >
            <Tooltip direction="top" offset={[0, -34]} opacity={0.96}>
              <strong>{item.position}. {entry.title}</strong><br />
              {getCategoryLabel(entry.place_category_slug)} · {entry.time_label}
            </Tooltip>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
