import "server-only";

import { cookies } from "next/headers";
import { getSupabaseServerRequestClient } from "@/lib/supabase/server-request";

export const ADMIN_SESSION_COOKIE = "story-map-admin-session";

export async function hasVerifiedAdminSession() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value ?? null;
  if (!accessToken) return false;
  const supabase = getSupabaseServerRequestClient(accessToken);
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) return false;
  const { data, error } = await supabase.rpc("is_app_admin");
  return !error && data === true;
}
