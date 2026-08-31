import { NextResponse } from "next/server";
import { reportOperationalError } from "@/lib/errors";
import { isMediaCleanupRequestAuthorized } from "@/lib/media/cleanup-auth";
import { STORY_MEDIA_BUCKET } from "@/lib/media/contracts";
import { getSupabaseServerAdminClient } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";

async function cleanQueuedMedia(request: Request) {
  if (!isMediaCleanupRequestAuthorized(request, {
    mediaCleanupSecret: process.env.MEDIA_CLEANUP_SECRET,
    cronSecret: process.env.CRON_SECRET,
  })) {
    return NextResponse.json(
      { ok: false, message: "未授权。" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  let admin: ReturnType<typeof getSupabaseServerAdminClient>;
  try {
    admin = getSupabaseServerAdminClient();
  } catch (error) {
    reportOperationalError(error, "media:cleanup-admin-config");
    return NextResponse.json(
      { ok: false, message: "清理服务尚未完成配置。" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  const { data: items, error: claimError } = await admin.rpc("claim_story_media_cleanup", {
    p_limit: 25,
  });
  if (claimError) {
    reportOperationalError(claimError, "media:cleanup-claim");
    return NextResponse.json(
      { ok: false, message: "清理任务暂时无法开始。" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  let cleaned = 0;
  let failed = 0;
  for (const item of items) {
    const { error: storageError } = await admin.storage
      .from(STORY_MEDIA_BUCKET)
      .remove(item.object_paths);
    const succeeded = !storageError;
    if (storageError) reportOperationalError(storageError, "media:cleanup-storage");
    const { error: finishError } = await admin.rpc("finish_story_media_cleanup", {
      p_queue_id: item.id,
      p_succeeded: succeeded,
      p_error_code: succeeded ? null : "storage_remove_failed",
    });
    if (finishError) reportOperationalError(finishError, "media:cleanup-finish");
    if (succeeded && !finishError) cleaned += 1;
    else failed += 1;
  }

  return NextResponse.json(
    { ok: true, claimed: items.length, cleaned, failed },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function GET(request: Request) {
  return cleanQueuedMedia(request);
}

export async function POST(request: Request) {
  return cleanQueuedMedia(request);
}
