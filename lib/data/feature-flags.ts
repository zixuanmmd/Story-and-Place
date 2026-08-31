import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { toFeatureFlagRecord } from "@/lib/feature-flags/contracts";

export async function getEvaluatedFeatureFlags() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_evaluated_feature_flags");
  if (error) throw error;
  return toFeatureFlagRecord(data);
}
