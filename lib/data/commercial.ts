import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  commercialAccessRowSchema,
  toCommercialAccess,
  type CommercialAccess,
} from "@/lib/validation/commercial";

export async function getMyCommercialAccess(): Promise<CommercialAccess> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_my_commercial_access");
  if (error) throw error;
  const row = commercialAccessRowSchema.parse(data?.[0]);
  return toCommercialAccess(row);
}
