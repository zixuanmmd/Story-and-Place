import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  storyDataExportSchema,
  type ExportedEntry,
  type StoryDataExport,
} from "@/lib/validation/data-portability";

export async function exportMyStoryData(): Promise<StoryDataExport> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("export_my_story_data");
  if (error) throw error;
  const parsed = storyDataExportSchema.safeParse(data);
  if (!parsed.success) throw new Error("Invalid data export response.");
  return parsed.data;
}

export function allExportedEntries(data: StoryDataExport) {
  return [...data.owned_entries, ...data.participant_entries];
}

function escapeCsv(value: string | number | null) {
  const text = value === null ? "" : String(value);
  // Spreadsheet applications may interpret cells beginning with these
  // characters as formulas. Prefix user-controlled values so an exported
  // story cannot execute a formula when the CSV is opened.
  const safeText = /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function storyDataToCsv(data: StoryDataExport) {
  const headers = [
    "ownership", "id", "title", "content", "place_name", "latitude",
    "longitude", "time_label", "time_precision", "occurred_at",
    "occurred_local", "occurred_timezone", "occurred_date", "occurred_year",
    "visibility", "group_id", "place_category_slug", "unlock_at", "tags",
    "created_at", "updated_at",
  ];
  const rows = allExportedEntries(data).map((entry) => [
    entry.ownership, entry.id, entry.title, entry.content, entry.place_name,
    entry.latitude, entry.longitude, entry.time_label, entry.time_precision,
    entry.occurred_at, entry.occurred_local, entry.occurred_timezone,
    entry.occurred_date, entry.occurred_year, entry.visibility, entry.group_id,
    entry.place_category_slug, entry.unlock_at,
    entry.tags.map((tag) => `#${tag.name}`).join(" "),
    entry.created_at, entry.updated_at,
  ]);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n")}`;
}

function entryToGeoJsonFeature(entry: ExportedEntry) {
  return {
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [entry.longitude, entry.latitude],
    },
    properties: {
      id: entry.id,
      ownership: entry.ownership,
      title: entry.title,
      time: entry.time_label,
      visibility: entry.visibility,
      place_name: entry.place_name,
      category: entry.place_category_slug,
      tags: entry.tags.filter((tag) => tag.type !== "emotion").map((tag) => tag.name),
      emotions: entry.tags.filter((tag) => tag.type === "emotion").map((tag) => tag.name),
      unlock_at: entry.unlock_at,
    },
  };
}

export function storyDataToGeoJson(data: StoryDataExport) {
  return {
    type: "FeatureCollection" as const,
    features: allExportedEntries(data).map(entryToGeoJsonFeature),
  };
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
