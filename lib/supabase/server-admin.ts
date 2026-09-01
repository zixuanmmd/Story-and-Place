import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export class ServerSupabaseConfigurationError extends Error {
  constructor() {
    super("Server-side Supabase credentials are not configured.");
    this.name = "ServerSupabaseConfigurationError";
  }
}

export function getSupabaseServerAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new ServerSupabaseConfigurationError();
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
