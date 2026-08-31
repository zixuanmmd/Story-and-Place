import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { ServerSupabaseConfigurationError } from "@/lib/supabase/server-admin";

function getServerBrowserCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new ServerSupabaseConfigurationError();
  return { url, key };
}

export function getBearerAccessToken(request: Request) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
}

export function getSupabaseServerRequestClient(
  accessToken: string | null,
): SupabaseClient<Database> {
  const { url, key } = getServerBrowserCredentials();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(accessToken
      ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      : {}),
  });
}

export async function getVerifiedRequestUser(
  accessToken: string | null,
): Promise<User | null> {
  if (!accessToken) return null;
  const client = getSupabaseServerRequestClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  return error ? null : data.user;
}
