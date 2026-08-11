import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getEntryById } from "@/lib/data/entries";
import { entryValuesToPayload, type EntryFormValues } from "@/lib/validation/entry";
import { entryDraftPayloadSchema, type EntryDraftPayload } from "@/lib/validation/entry-draft";
import type { EntryDraft, Json, MapEntryWithProfile } from "@/types/database";

export type EntryDraftRef = Pick<EntryDraft, "id" | "revision">;

function parseDraftRow(value: unknown): EntryDraft {
  if (!value || typeof value !== "object") throw new Error("Invalid draft response.");
  const draft = value as EntryDraft;
  if (
    typeof draft.id !== "string" ||
    typeof draft.revision !== "number" ||
    draft.status !== "draft" ||
    !entryDraftPayloadSchema.safeParse(draft.payload).success
  ) {
    throw new Error("Invalid draft response.");
  }
  return draft;
}

export async function saveEntryDraft(input: {
  draftId: string | null;
  sourceEntryId: string | null;
  payload: EntryDraftPayload;
  tagInput: string;
  expectedRevision: number;
  clientInstanceId: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("save_entry_draft", {
    p_draft_id: input.draftId,
    p_source_entry_id: input.sourceEntryId,
    p_payload: input.payload as unknown as Json,
    p_tag_input: input.tagInput,
    p_expected_revision: input.expectedRevision,
    p_client_instance_id: input.clientInstanceId,
  });
  if (error) throw error;
  return parseDraftRow(data);
}

export async function getEntryDraft(id: string): Promise<EntryDraft | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("entry_drafts")
    .select("*")
    .eq("id", id)
    .eq("status", "draft")
    .maybeSingle();
  if (error) throw error;
  return data ? parseDraftRow(data) : null;
}

export async function listEntryDrafts(limit = 50): Promise<EntryDraft[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("entry_drafts")
    .select("*")
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map(parseDraftRow);
}

export async function publishEntryDraft(
  draft: EntryDraftRef,
  values: EntryFormValues,
  tagNames: string[],
): Promise<MapEntryWithProfile> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("publish_entry_draft", {
    p_draft_id: draft.id,
    p_expected_revision: draft.revision,
    p_entry: entryValuesToPayload(values) as unknown as Json,
    p_tag_names: tagNames,
  });
  if (error) throw error;
  const id = (data as unknown as { id?: unknown })?.id;
  if (typeof id !== "string") throw new Error("Draft publish did not return an id.");
  const entry = await getEntryById(id);
  if (!entry) throw new Error("Published entry is no longer readable.");
  return entry;
}

export async function discardEntryDraft(id: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("discard_entry_draft", { p_draft_id: id });
  if (error) throw error;
}
