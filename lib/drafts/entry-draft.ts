import { entryFormSchema, type EntryFormValues } from "@/lib/validation/entry";

export const ENTRY_DRAFT_VERSION = 1 as const;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withLegacyDefaults(value: unknown) {
  if (!isObject(value)) return value;
  return {
    ...value,
    occurred_timezone:
      typeof value.occurred_timezone === "string" ? value.occurred_timezone : "",
    group_id: typeof value.group_id === "string" ? value.group_id : "",
    place_category_slug:
      typeof value.place_category_slug === "string" ? value.place_category_slug : "other",
    allow_comments:
      typeof value.allow_comments === "boolean" ? value.allow_comments : true,
  };
}

export function serializeEntryDraft(values: EntryFormValues) {
  return JSON.stringify({ version: ENTRY_DRAFT_VERSION, values });
}

export function parseEntryDraft(raw: string): EntryFormValues | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const candidate =
    isObject(parsed) && parsed.version === ENTRY_DRAFT_VERSION
      ? parsed.values
      : parsed;
  const result = entryFormSchema.safeParse(withLegacyDefaults(candidate));
  return result.success ? result.data : null;
}
