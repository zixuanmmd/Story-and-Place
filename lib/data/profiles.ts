import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";
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

export async function getPublicProfile(identifier: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("resolve_public_profile", {
    p_identifier: identifier,
  });
  if (error) throw error;
  return (data[0] ?? null) as Profile | null;
}
