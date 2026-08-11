"use client";

import L from "leaflet";
import { MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import { getCategoryIcon, getCategoryLabel } from "@/lib/categories/registry";
import { ENTRY_AUDIENCE_PRESENTATION } from "@/lib/privacy/presentation";
import type { MapEntryWithProfile } from "@/types/database";

function createEntryIcon(entry: MapEntryWithProfile) {
  const Icon = getCategoryIcon(entry.place_category_slug);
  const icon = renderToStaticMarkup(
    <Icon aria-hidden="true" size={18} strokeWidth={2.2} />,
  );
  const audience = ENTRY_AUDIENCE_PRESENTATION[entry.visibility];
  return L.divIcon({
    className: "story-marker-shell",
    html: `<span class="story-marker story-marker--${entry.visibility} story-marker--selected" aria-label="${getCategoryLabel(entry.place_category_slug)}，${audience.shortLabel}"><span class="story-marker__category">${icon}</span><span class="story-marker__state" aria-hidden="true">${audience.glyph}</span></span>`,
    iconSize: [36, 44],
    iconAnchor: [18, 40],
  });
}

export function EntryMiniMap({
  entry,
  onTileError,
}: {
  entry: MapEntryWithProfile;
  onTileError: () => void;
}) {
  return (
    <MapContainer
      center={[entry.latitude, entry.longitude]}
      zoom={12}
      minZoom={2}
      worldCopyJump
      scrollWheelZoom={false}
      className="story-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        eventHandlers={{ tileerror: onTileError }}
      />
      <Marker position={[entry.latitude, entry.longitude]} icon={createEntryIcon(entry)}>
        <Tooltip direction="top" offset={[0, -30]} permanent>
          {entry.place_name ?? entry.title}
        </Tooltip>
      </Marker>
    </MapContainer>
  );
}
