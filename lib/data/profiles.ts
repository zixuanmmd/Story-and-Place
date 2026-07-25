import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MapEntryWithProfile } from "@/types/database";
import type { ProfileFormValues } from "@/lib/validation/profile";
import { normalizeDisplayNameForStorage } from "@/lib/profile/display-name";

export async function isDisplayNameAvailable(candidate: string) {
  const normalized = normalizeDisplayNameForStorage(candidate);
  if (!normalized || normalized.length > 80) return false;

  const { data, error } = await getSupabaseBrowserClient().rpc(
    "is_display_name_available",
    { candidate: normalized },
  );
  if (error) throw error;
  return data;
}

export async function saveProfile(id: string, values: ProfileFormValues) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      display_name: normalizeDisplayNameForStorage(values.display_name),
      bio: values.bio.trim() || null,
      avatar_url: values.avatar_url.trim() || null,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getPublicProfile(id: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listPublicProfileEntries(id: string, limit = 20) {
  const supabase = getSupabaseBrowserClient();
  const { data, error, count } = await supabase
    .from("map_entries")
    .select("*, profiles!map_entries_user_id_fkey(display_name, avatar_url)", { count: "exact" })
    .eq("user_id", id)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (error) throw error;
  return {
    entries: data.slice(0, limit) as MapEntryWithProfile[],
    hasMore: data.length > limit,
    count: count ?? data.length,
  };
}
