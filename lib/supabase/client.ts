import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseBrowserKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseBrowserKey);

let browserClient: SupabaseClient<Database> | null = null;

export class SupabaseConfigurationError extends Error {
  constructor() {
    super("Supabase 尚未配置。请先填写本地环境变量后再试。");
    this.name = "SupabaseConfigurationError";
  }
}

export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (!supabaseUrl || !supabaseBrowserKey) {
    throw new SupabaseConfigurationError();
  }

  if (!browserClient) {
    browserClient = createClient<Database>(supabaseUrl, supabaseBrowserKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return browserClient;
}
