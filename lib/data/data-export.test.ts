import { describe, expect, it } from "vitest";
import { storyDataExportSchema } from "@/lib/validation/data-portability";
import { storyDataToCsv, storyDataToGeoJson } from "./data-export";

const fixture = storyDataExportSchema.parse({
  schema_version: 1,
  exported_at: "2026-08-10T10:00:00Z",
  profile: {
    id: "10000000-0000-4000-8000-000000000001",
    username: "story-owner",
    display_name: "故事主人",
    avatar_url: null,
    bio: null,
    created_at: "2026-01-01T00:00:00Z",
  },
  owned_entries: [{
    ownership: "owner",
    id: "20000000-0000-4000-8000-000000000002",
    title: "带逗号,与引号\"的故事",
    content: "正文",
    place_name: "成都",
    latitude: 30.66,
    longitude: 104.06,
    occurred_at: null,
    occurred_local: null,
    occurred_timezone: null,
    occurred_date: "2026-01-01",
    occurred_year: 2026,
    time_precision: "year",
    time_label: "2026 年",
    visibility: "public",
    group_id: null,
    place_category_slug: "street",
    unlock_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    tags: [
      { name: "旅行", slug: "aaaaaaaaaaaaaaaaaaaa", type: "normal", semantic_key: null },
      { name: "希望", slug: "bbbbbbbbbbbbbbbbbbbb", type: "emotion", semantic_key: "hope" },
    ],
  }],
  participant_entries: [],
  owned_routes: [],
});

describe("data export formats", () => {
  it("CSV 使用 UTF-8 BOM 并正确转义逗号和引号", () => {
    const csv = storyDataToCsv(fixture);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"带逗号,与引号""的故事"');
    expect(csv).toContain('"#旅行 #希望"');
    expect(csv).not.toContain("access_token");
  });

  it("CSV 会中和可能被表格软件解释为公式的用户内容", () => {
    const csv = storyDataToCsv({
      ...fixture,
      owned_entries: [{
        ...fixture.owned_entries[0],
        title: "=HYPERLINK(\"https://evil.example\")",
        content: "  +SUM(1,1)",
      }],
    });
    expect(csv).toContain('"\'=HYPERLINK(""https://evil.example"")"');
    expect(csv).toContain('"\'  +SUM(1,1)"');
  });

  it("GeoJSON 使用 longitude, latitude，并区分标签与情绪", () => {
    const geojson = storyDataToGeoJson(fixture);
    expect(geojson.features[0]?.geometry.coordinates).toEqual([104.06, 30.66]);
    expect(geojson.features[0]?.properties.tags).toEqual(["旅行"]);
    expect(geojson.features[0]?.properties.emotions).toEqual(["希望"]);
  });
});
