import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { entryValuesToPayload, type EntryFormValues } from "@/lib/validation/entry";
import type { ScopedQueryResult } from "@/lib/data/scoped-query";
import type { EntryVisibility, MapEntryWithProfile } from "@/types/database";

export const ENTRY_QUERY_LIMIT = 500;

const ENTRY_SELECT = `
  *,
  profiles!map_entries_user_id_fkey(display_name, avatar_url)
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

export async function createEntry(userId: string, values: EntryFormValues) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("map_entries")
    .insert({ ...entryValuesToPayload(values), user_id: userId })
    .select(ENTRY_SELECT)
    .single();

  if (error) throw error;
  return data;
}

export async function updateEntry(id: string, values: EntryFormValues) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("map_entries")
    .update(entryValuesToPayload(values))
    .eq("id", id)
    .select(ENTRY_SELECT)
    .single();

  if (error) throw error;
  return data;
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
