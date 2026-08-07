import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  onboardingInterestsSchema,
  type OnboardingInterest,
} from "@/lib/validation/onboarding";
import type { OnboardingPreference } from "@/types/database";

export type OnboardingDecision = {
  preference: OnboardingPreference;
  shouldOnboard: boolean;
};

async function setPreferences(
  interests: OnboardingInterest[],
  action: "save" | "skip",
) {
  const parsed = onboardingInterestsSchema.parse(interests);
  const { data, error } = await getSupabaseBrowserClient().rpc(
    "set_onboarding_preferences",
    { p_interests: parsed, p_action: action },
  );
  if (error) throw error;
  return data;
}

export async function ensureOnboardingDecision(userId: string): Promise<OnboardingDecision> {
  const supabase = getSupabaseBrowserClient();
  const { data: existing, error } = await supabase
    .from("user_experience_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (existing) {
    return {
      preference: existing,
      shouldOnboard: existing.onboarding_status === "pending",
    };
  }

  const { count, error: countError } = await supabase
    .from("map_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countError) throw countError;

  const preference = await setPreferences([], (count ?? 0) > 0 ? "skip" : "save");
  return {
    preference,
    shouldOnboard: preference.onboarding_status === "pending",
  };
}

export async function saveOnboardingInterests(interests: OnboardingInterest[]) {
  return setPreferences(interests, "save");
}

export async function skipOnboarding(interests: OnboardingInterest[] = []) {
  return setPreferences(interests, "skip");
}

export async function completeOnboarding(entryId: string) {
  const { data, error } = await getSupabaseBrowserClient().rpc(
    "complete_onboarding",
    { p_entry_id: entryId },
  );
  if (error) throw error;
  return data;
}
