import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  accountDeletionImpactSchema,
  type AccountDeletionImpact,
} from "@/lib/validation/data-portability";
import type { AccountDeletionMode } from "@/types/database";

export async function getAccountDeletionImpact(): Promise<AccountDeletionImpact> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_account_deletion_impact");
  if (error) throw error;
  const parsed = accountDeletionImpactSchema.safeParse(data);
  if (!parsed.success) throw new Error("Invalid account deletion impact response.");
  return parsed.data;
}

export async function beginAccountDeletion(mode: AccountDeletionMode) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("begin_account_deletion", {
    p_deletion_mode: mode,
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("Invalid account deletion request.");
  return data;
}
