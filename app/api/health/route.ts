import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { resolveHealthStatus } from "@/lib/health/status";
import { STORY_MEDIA_BUCKET } from "@/lib/media/contracts";
import { getSupabaseServerAdminClient } from "@/lib/supabase/server-admin";
import type { Database } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 5;

const HEALTH_CHECK_TIMEOUT_MS = 3_000;

async function resolveWithinTimeout(
  check: Promise<boolean>,
  timeoutMs = HEALTH_CHECK_TIMEOUT_MS,
) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      check,
      new Promise<boolean>((resolve) => {
        timeoutId = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function checkDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;

  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client
    .from("place_categories")
    .select("slug")
    .limit(1)
    .abortSignal(AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS));
  return !error;
}

async function checkMedia() {
  const admin = getSupabaseServerAdminClient();
  const { data, error } = await admin.storage.getBucket(STORY_MEDIA_BUCKET);
  return !error && data.public === false;
}

export async function GET() {
  const [databaseReachable, mediaReachable] = await Promise.all([
    resolveWithinTimeout(checkDatabase()).catch(() => false),
    resolveWithinTimeout(checkMedia()).catch(() => false),
  ]);

  const health = resolveHealthStatus(databaseReachable, mediaReachable);
  return NextResponse.json(
    {
      ...health,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local",
      checkedAt: new Date().toISOString(),
    },
    {
      status: health.status === "ok" ? 200 : 503,
      headers: { "cache-control": "no-store, max-age=0" },
    },
  );
}
