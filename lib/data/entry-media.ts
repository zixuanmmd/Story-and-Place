import {
  mediaListResponseSchema,
  type MediaAssetView,
  type MediaUsage,
} from "@/lib/media/contracts";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export class StoryMediaRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoryMediaRequestError";
  }
}

export type ScopedEntryMediaState = {
  scope: string | null;
  assets: MediaAssetView[];
  usage: MediaUsage | null;
};

export function entryMediaForScope(
  state: ScopedEntryMediaState,
  currentScope: string,
) {
  return state.scope === currentScope
    ? { assets: state.assets, usage: state.usage }
    : { assets: [], usage: null };
}

function authHeaders(accessToken: string | null): Record<string, string> {
  return accessToken ? { authorization: `Bearer ${accessToken}` } : {};
}

async function readResponseMessage(response: Response, fallback: string) {
  try {
    const payload = await response.json() as { message?: unknown };
    return typeof payload.message === "string" ? payload.message : fallback;
  } catch {
    return fallback;
  }
}

export async function getEntryMedia(entryId: string, accessToken: string | null) {
  const response = await fetch(`/api/media?entryId=${encodeURIComponent(entryId)}`, {
    headers: authHeaders(accessToken),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new StoryMediaRequestError(
      await readResponseMessage(response, "故事图片暂时无法读取，请稍后重试。"),
    );
  }
  return mediaListResponseSchema.parse(await response.json());
}

export async function uploadEntryMedia(
  entryId: string,
  file: File,
  accessToken: string,
) {
  const formData = new FormData();
  formData.set("entryId", entryId);
  formData.set("file", file);
  const response = await fetch("/api/media", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: formData,
  });
  if (!response.ok) {
    throw new StoryMediaRequestError(
      await readResponseMessage(response, "图片暂时无法上传，请稍后重试。"),
    );
  }
}

export async function deleteEntryMedia(assetId: string, accessToken: string) {
  const response = await fetch(`/api/media/${encodeURIComponent(assetId)}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new StoryMediaRequestError(
      await readResponseMessage(response, "图片暂时无法删除，请稍后重试。"),
    );
  }
}

export async function setEntryMediaCover(entryId: string, assetId: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("set_entry_media_cover", {
    p_entry_id: entryId,
    p_asset_id: assetId,
  });
  if (error) throw error;
}

export async function reorderEntryMedia(
  entryId: string,
  assets: MediaAssetView[],
) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("reorder_entry_media_assets", {
    p_entry_id: entryId,
    p_asset_ids: assets.map((asset) => asset.id),
  });
  if (error) throw error;
}

export function moveMediaAsset(
  assets: MediaAssetView[],
  assetId: string,
  direction: "previous" | "next",
) {
  const index = assets.findIndex((asset) => asset.id === assetId);
  const destination = direction === "previous" ? index - 1 : index + 1;
  if (index < 0 || destination < 0 || destination >= assets.length) return assets;
  const next = [...assets];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next.map((asset, sortOrder) => ({ ...asset, sortOrder }));
}
