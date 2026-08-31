import { NextResponse } from "next/server";
import { z } from "zod";
import { reportOperationalError } from "@/lib/errors";
import {
  STORY_MEDIA_BUCKET,
  STORY_MEDIA_SIGNED_URL_SECONDS,
} from "@/lib/media/contracts";
import {
  processStoryImage,
  StoryMediaValidationError,
} from "@/lib/media/image-processing";
import { consumeRateLimit, getRequestClientIdentifier } from "@/lib/security/rate-limit";
import {
  getSupabaseServerAdminClient,
  ServerSupabaseConfigurationError,
} from "@/lib/supabase/server-admin";
import {
  getBearerAccessToken,
  getSupabaseServerRequestClient,
  getVerifiedRequestUser,
} from "@/lib/supabase/server-request";

export const runtime = "nodejs";

const entryIdSchema = z.string().uuid();

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

function databaseFeatureMissing(error: { code?: string | null }) {
  return ["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code ?? "");
}

async function createAssetUrlMap(paths: string[]) {
  const admin = getSupabaseServerAdminClient();
  const { data, error } = await admin.storage
    .from(STORY_MEDIA_BUCKET)
    .createSignedUrls(paths, STORY_MEDIA_SIGNED_URL_SECONDS);
  if (error) throw error;
  const urls = new Map<string, string>();
  for (const item of data) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  if (urls.size !== paths.length) throw new Error("Signed media URLs unavailable.");
  return urls;
}

function requiredSignedUrl(urls: Map<string, string>, path: string) {
  const url = urls.get(path);
  if (!url) throw new Error("Signed media URL unavailable.");
  return url;
}

export async function GET(request: Request) {
  const entryId = entryIdSchema.safeParse(new URL(request.url).searchParams.get("entryId"));
  if (!entryId.success) return jsonError("故事地址无效。", 400);

  try {
    const accessToken = getBearerAccessToken(request);
    const requestUser = accessToken
      ? await getVerifiedRequestUser(accessToken)
      : null;
    if (accessToken && !requestUser) {
      return jsonError("登录状态已过期，请重新登录。", 401);
    }
    const scoped = getSupabaseServerRequestClient(accessToken);
    const { data, error } = await scoped
      .from("entry_media_assets")
      .select("id, entry_id, storage_path, thumbnail_path, width, height, size_bytes, sort_order, is_cover, created_at")
      .eq("entry_id", entryId.data)
      .eq("status", "ready")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(10);
    if (error) {
      reportOperationalError(error, "media:list");
      return databaseFeatureMissing(error)
        ? jsonError("图片功能尚未完成数据库初始化。", 503)
        : jsonError("故事图片暂时无法读取，请稍后重试。", 502);
    }

    const signedUrls = data.length
      ? await createAssetUrlMap(data.flatMap((asset) => [
          asset.storage_path,
          asset.thumbnail_path,
        ]))
      : new Map<string, string>();
    const assets = data.map((asset) => ({
      id: asset.id,
      entryId: asset.entry_id,
      width: asset.width,
      height: asset.height,
      sizeBytes: asset.size_bytes,
      sortOrder: asset.sort_order,
      isCover: asset.is_cover,
      fullUrl: requiredSignedUrl(signedUrls, asset.storage_path),
      thumbnailUrl: requiredSignedUrl(signedUrls, asset.thumbnail_path),
      createdAt: asset.created_at,
    }));

    let usage: { usedBytes: number; quotaBytes: number; fileCount: number } | null = null;
    if (requestUser) {
      const { data: usageRows, error: usageError } = await scoped.rpc("get_my_story_media_usage");
      if (!usageError && usageRows[0]) {
        usage = {
          usedBytes: usageRows[0].used_bytes,
          quotaBytes: usageRows[0].quota_bytes,
          fileCount: usageRows[0].file_count,
        };
      }
    }

    return NextResponse.json(
      { assets, usage },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    reportOperationalError(error, "media:list");
    if (error instanceof ServerSupabaseConfigurationError) {
      return jsonError("图片服务尚未完成配置。", 503);
    }
    return jsonError("故事图片暂时无法读取，请稍后重试。", 502);
  }
}

export async function POST(request: Request) {
  try {
    const ipLimit = await consumeRateLimit(
      { scope: "media-upload-ip", limit: 24, windowSeconds: 3600 },
      getRequestClientIdentifier(request),
    );
    if (!ipLimit.allowed) {
      return jsonError("图片上传较频繁，请稍后再试。", 429, ipLimit.retryAfterSeconds);
    }
  } catch (error) {
    reportOperationalError(error, "media:upload-ip-rate-limit");
    return jsonError("图片安全服务暂时不可用，请稍后重试。", 503);
  }

  const accessToken = getBearerAccessToken(request);
  let user: Awaited<ReturnType<typeof getVerifiedRequestUser>>;
  try {
    user = await getVerifiedRequestUser(accessToken);
  } catch (error) {
    reportOperationalError(error, "media:upload-auth-config");
    return jsonError("图片服务尚未完成配置。", 503);
  }
  if (!accessToken || !user) return jsonError("登录状态已过期，请重新登录。", 401);

  try {
    const userLimit = await consumeRateLimit(
      { scope: "media-upload-user", limit: 30, windowSeconds: 3600 },
      user.id,
    );
    if (!userLimit.allowed) {
      return jsonError("图片上传较频繁，请稍后再试。", 429, userLimit.retryAfterSeconds);
    }
  } catch (error) {
    reportOperationalError(error, "media:upload-user-rate-limit");
    return jsonError("图片安全服务暂时不可用，请稍后重试。", 503);
  }

  let entryId: string;
  let file: File;
  try {
    const formData = await request.formData();
    entryId = entryIdSchema.parse(formData.get("entryId"));
    const candidate = formData.get("file");
    if (!(candidate instanceof File)) throw new Error("Missing file.");
    file = candidate;
  } catch {
    return jsonError("请选择故事和图片后再上传。", 400);
  }

  let processed;
  try {
    processed = await processStoryImage(file);
  } catch (error) {
    if (error instanceof StoryMediaValidationError) return jsonError(error.message, 400);
    reportOperationalError(error, "media:process");
    return jsonError("图片暂时无法处理，请换一张后重试。", 400);
  }

  let admin: ReturnType<typeof getSupabaseServerAdminClient>;
  try {
    admin = getSupabaseServerAdminClient();
  } catch (error) {
    reportOperationalError(error, "media:upload-admin-config");
    return jsonError("图片服务尚未完成配置。", 503);
  }

  const { data: reserved, error: reserveError } = await admin.rpc(
    "reserve_entry_media_asset",
    {
      p_user_id: user.id,
      p_entry_id: entryId,
      p_source_mime_type: processed.sourceMimeType,
      p_size_bytes: processed.full.byteLength,
      p_thumbnail_size_bytes: processed.thumbnail.byteLength,
      p_width: processed.width,
      p_height: processed.height,
    },
  );
  if (reserveError || !reserved) {
    reportOperationalError(reserveError ?? new Error("Media reservation failed."), "media:reserve");
    if (databaseFeatureMissing(reserveError ?? {})) {
      return jsonError("图片功能尚未完成数据库初始化。", 503);
    }
    if (reserveError?.code === "23514" && reserveError.message.includes("file quota")) {
      return jsonError("媒体文件数量已达到当前上限。", 409);
    }
    if (reserveError?.code === "23514" && reserveError.message.includes("storage quota")) {
      return jsonError("图片存储空间已达到当前上限。", 409);
    }
    if (reserveError?.code === "23514") {
      return jsonError("每个故事最多保存 10 张图片。", 409);
    }
    if (reserveError?.code === "42501" && reserveError.message.includes("entitlement")) {
      return jsonError("当前套餐暂不支持上传故事图片。", 403);
    }
    if (reserveError?.code === "42501") {
      return jsonError("只有故事创建者可以管理图片。", 403);
    }
    return jsonError("图片暂时无法上传，请稍后重试。", 502);
  }

  try {
    const fullUpload = await admin.storage
      .from(STORY_MEDIA_BUCKET)
      .upload(reserved.storage_path, processed.full, {
        cacheControl: "300",
        contentType: "image/webp",
        upsert: false,
      });
    if (fullUpload.error) throw fullUpload.error;
    const thumbnailUpload = await admin.storage
      .from(STORY_MEDIA_BUCKET)
      .upload(reserved.thumbnail_path, processed.thumbnail, {
        cacheControl: "300",
        contentType: "image/webp",
        upsert: false,
      });
    if (thumbnailUpload.error) throw thumbnailUpload.error;

    const { error: readyError } = await admin.rpc("mark_entry_media_asset_ready", {
      p_asset_id: reserved.id,
    });
    if (readyError) throw readyError;
  } catch (error) {
    reportOperationalError(error, "media:upload-storage");
    const { error: failedError } = await admin.rpc("mark_entry_media_asset_failed", {
      p_asset_id: reserved.id,
      p_failure_code: "storage_upload_failed",
    });
    if (failedError) reportOperationalError(failedError, "media:mark-failed");
    return jsonError("图片没有保存成功，请稍后重试。", 502);
  }

  return NextResponse.json(
    { ok: true, assetId: reserved.id },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}
