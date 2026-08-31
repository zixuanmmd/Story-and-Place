import { NextResponse } from "next/server";
import { z } from "zod";
import { reportOperationalError } from "@/lib/errors";
import { STORY_MEDIA_BUCKET } from "@/lib/media/contracts";
import { consumeRateLimit, getRequestClientIdentifier } from "@/lib/security/rate-limit";
import { getSupabaseServerAdminClient } from "@/lib/supabase/server-admin";
import {
  getBearerAccessToken,
  getSupabaseServerRequestClient,
  getVerifiedRequestUser,
} from "@/lib/supabase/server-request";

export const runtime = "nodejs";

function jsonError(message: string, status: number, retryAfterSeconds?: number) {
  return NextResponse.json(
    { ok: false, message },
    {
      status,
      headers: {
        "cache-control": "no-store",
        ...(retryAfterSeconds ? { "retry-after": String(retryAfterSeconds) } : {}),
      },
    },
  );
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const parsedId = z.string().uuid().safeParse((await context.params).id);
  if (!parsedId.success) return jsonError("图片地址无效。", 400);

  try {
    const ipLimit = await consumeRateLimit(
      { scope: "media-delete-ip", limit: 60, windowSeconds: 3600 },
      getRequestClientIdentifier(request),
    );
    if (!ipLimit.allowed) {
      return jsonError("图片操作较频繁，请稍后再试。", 429, ipLimit.retryAfterSeconds);
    }
  } catch (error) {
    reportOperationalError(error, "media:delete-rate-limit");
    return jsonError("图片安全服务暂时不可用，请稍后重试。", 503);
  }

  const accessToken = getBearerAccessToken(request);
  let user: Awaited<ReturnType<typeof getVerifiedRequestUser>>;
  try {
    user = await getVerifiedRequestUser(accessToken);
  } catch (error) {
    reportOperationalError(error, "media:delete-auth-config");
    return jsonError("图片服务尚未完成配置。", 503);
  }
  if (!accessToken || !user) return jsonError("登录状态已过期，请重新登录。", 401);

  const scoped = getSupabaseServerRequestClient(accessToken);
  const { data: asset, error: beginError } = await scoped.rpc(
    "begin_entry_media_asset_delete",
    { p_asset_id: parsedId.data },
  );
  if (beginError || !asset) {
    reportOperationalError(beginError ?? new Error("Media delete reservation failed."), "media:delete-begin");
    return beginError?.code === "P0002" || beginError?.code === "42501"
      ? jsonError("图片不存在，或你无权删除它。", 404)
      : jsonError("图片暂时无法删除，请稍后重试。", 502);
  }

  let admin: ReturnType<typeof getSupabaseServerAdminClient>;
  try {
    admin = getSupabaseServerAdminClient();
  } catch (error) {
    reportOperationalError(error, "media:delete-admin-config");
    return jsonError("图片服务尚未完成配置。", 503);
  }
  const { error: storageError } = await admin.storage
    .from(STORY_MEDIA_BUCKET)
    .remove([asset.storage_path, asset.thumbnail_path]);
  if (storageError) {
    reportOperationalError(storageError, "media:delete-storage");
    return NextResponse.json(
      { ok: true, cleanupQueued: true },
      { status: 202, headers: { "cache-control": "no-store" } },
    );
  }

  const { error: finishError } = await admin.rpc("complete_entry_media_asset_delete", {
    p_asset_id: asset.id,
  });
  if (finishError) {
    reportOperationalError(finishError, "media:delete-finish");
    return NextResponse.json(
      { ok: true, cleanupQueued: true },
      { status: 202, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    { ok: true, cleanupQueued: false },
    { headers: { "cache-control": "no-store" } },
  );
}
