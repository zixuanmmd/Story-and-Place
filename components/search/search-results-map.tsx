"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import { getCategoryIcon, getCategoryLabel } from "@/lib/categories/registry";
import { ENTRY_AUDIENCE_PRESENTATION } from "@/lib/privacy/presentation";
import type { GlobalSearchResult } from "@/types/database";

type SearchMapResult = GlobalSearchResult & {
  result_type: "entry";
  latitude: number;
  longitude: number;
};

function isMappableEntry(result: GlobalSearchResult): result is SearchMapResult {
  return result.result_type === "entry"
    && result.latitude !== null
    && result.longitude !== null;
}

function createSearchIcon(result: SearchMapResult) {
  const Icon = getCategoryIcon(result.place_category_slug ?? "other");
  const icon = renderToStaticMarkup(
    <Icon aria-hidden="true" size={17} strokeWidth={2.2} />,
  );
  const audience = result.visibility
    ? ENTRY_AUDIENCE_PRESENTATION[result.visibility]
    : ENTRY_AUDIENCE_PRESENTATION.public;
  return L.divIcon({
    className: "story-marker-shell",
    html: `<span class="story-marker story-marker--${result.visibility ?? "public"}" aria-label="${getCategoryLabel(result.place_category_slug ?? "other")}，${audience.shortLabel}"><span class="story-marker__category">${icon}</span><span class="story-marker__state" aria-hidden="true">${audience.glyph}</span></span>`,
    iconSize: [36, 44],
    iconAnchor: [18, 40],
  });
}

function FitSearchResults({ results }: { results: SearchMapResult[] }) {
  const map = useMap();
  useEffect(() => {
    if (!results.length) return;
    if (results.length === 1) {
      map.setView([results[0].latitude, results[0].longitude], 11);
      return;
    }
    map.fitBounds(
      L.latLngBounds(results.map((result) => [result.latitude, result.longitude])),
      { padding: [42, 42], maxZoom: 12 },
    );
  }, [map, results]);
  return null;
}

export function SearchResultsMap({
  results,
  onSelect,
  onTileError,
}: {
  results: GlobalSearchResult[];
  onSelect: (result: GlobalSearchResult) => void;
  onTileError: () => void;
}) {
  const entries = useMemo(() => results.filter(isMappableEntry), [results]);
  return (
    <MapContainer center={[25, 15]} zoom={2} minZoom={2} worldCopyJump className="story-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        eventHandlers={{ tileerror: onTileError }}
      />
      <FitSearchResults results={entries} />
      {entries.map((result) => (
        <Marker
          key={result.result_id}
          position={[result.latitude, result.longitude]}
          icon={createSearchIcon(result)}
          eventHandlers={{ click: () => onSelect(result) }}
        >
          <Tooltip direction="top" offset={[0, -30]} opacity={0.96}>
            <strong>{result.title}</strong><br />
            {result.time_label ?? result.subtitle}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
