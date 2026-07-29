import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { entryValuesToPayload, type EntryFormValues } from "@/lib/validation/entry";
import type { ScopedQueryResult } from "@/lib/data/scoped-query";
import type {
  EntryEditableField,
  EntryVisibility,
  Json,
  MapEntryWithProfile,
} from "@/types/database";

export const ENTRY_QUERY_LIMIT = 500;

const ENTRY_SELECT = `
  *,
  profiles!map_entries_user_id_fkey(display_name, avatar_url),
  entry_tags(
    entry_id,
    tag_id,
    added_by,
    created_at,
    tags(id, name, slug)
  )
`;

export function toLimitedEntryResult<T>(
  rows: T[],
  limit = ENTRY_QUERY_LIMIT,
): ScopedQueryResult<T> {
  return {
    entries: rows.slice(0, limit),
    truncated: rows.length > limit,
  };
}

export async function listVisibleEntries(): Promise<ScopedQueryResult<MapEntryWithProfile>> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("map_entries")
    .select(ENTRY_SELECT)
    .order("updated_at", { ascending: false })
    .limit(ENTRY_QUERY_LIMIT + 1);

  if (error) throw error;
  return toLimitedEntryResult(data);
}

export async function listMyEntries(
  userId: string,
): Promise<ScopedQueryResult<MapEntryWithProfile>> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("map_entries")
    .select(ENTRY_SELECT)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(ENTRY_QUERY_LIMIT + 1);

  if (error) throw error;
  return toLimitedEntryResult(data);
}

export async function getEntryById(id: string): Promise<MapEntryWithProfile | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("map_entries")
    .select(ENTRY_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getRpcEntry(id: string) {
  const entry = await getEntryById(id);
  if (!entry) throw new Error("Saved entry is no longer readable.");
  return entry;
}

export async function createEntry(
  values: EntryFormValues,
  tagNames: string[] = [],
) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("create_entry", {
    p_entry: entryValuesToPayload(values) as unknown as Json,
    p_tag_names: tagNames,
  });

  if (error) throw error;
  const id = (data as unknown as { id?: unknown })?.id;
  if (typeof id !== "string") throw new Error("Entry RPC did not return an id.");
  return getRpcEntry(id);
}

export function getEntryUpdatePatch(
  values: EntryFormValues,
  editableFields: EntryEditableField[] | null = null,
) {
  const fullPatch = entryValuesToPayload(values);
  if (!editableFields) return fullPatch;

  const allowedKeys = new Set(
    editableFields.flatMap((field) => {
      switch (field) {
        case "title":
        case "content":
          return [field];
        case "place":
          return ["place_name"];
        case "location":
          return ["latitude", "longitude"];
        case "time":
          return [
            "occurred_local",
            "occurred_timezone",
            "occurred_date",
            "occurred_year",
            "time_precision",
            "time_label",
          ];
        case "category":
          return ["place_category_slug"];
        case "tags":
          return [];
      }
    }),
  );
  return Object.fromEntries(
    Object.entries(fullPatch).filter(([key]) => allowedKeys.has(key)),
  );
}

export async function updateEntry(
  id: string,
  values: EntryFormValues,
  tagNames: string[] | null = null,
  editableFields: EntryEditableField[] | null = null,
) {
  const supabase = getSupabaseBrowserClient();
  const patch = getEntryUpdatePatch(values, editableFields);
  const { data, error } = await supabase.rpc("update_entry", {
    p_entry_id: id,
    p_patch: patch as unknown as Json,
    p_tag_names: tagNames,
  });

  if (error) throw error;
  const resultId = (data as unknown as { id?: unknown })?.id;
  if (typeof resultId !== "string") {
    throw new Error("Entry RPC did not return an id.");
  }
  return getRpcEntry(resultId);
}

export async function updateEntryVisibility(id: string, visibility: EntryVisibility) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("map_entries")
    .update({ visibility, group_id: visibility === "group" ? undefined : null })
    .eq("id", id)
    .select(ENTRY_SELECT)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteEntry(id: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("map_entries").delete().eq("id", id);
  if (error) throw error;
}
