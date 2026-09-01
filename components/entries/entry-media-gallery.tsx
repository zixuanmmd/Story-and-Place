"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/entries/confirm-dialog";
import { useAuth } from "@/components/providers/auth-provider";
import {
  deleteEntryMedia,
  entryMediaForScope,
  getEntryMedia,
  moveMediaAsset,
  reorderEntryMedia,
  setEntryMediaCover,
  StoryMediaRequestError,
  uploadEntryMedia,
  type ScopedEntryMediaState,
} from "@/lib/data/entry-media";
import { getFriendlyError, reportOperationalError } from "@/lib/errors";
import {
  STORY_MEDIA_MAX_FILES,
  STORY_MEDIA_MAX_SOURCE_BYTES,
  type MediaAssetView,
} from "@/lib/media/contracts";

type EntryMediaGalleryProps = {
  entryId: string;
  storyTitle: string;
  isOwner: boolean;
};

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

function mediaErrorMessage(error: unknown, fallback: string) {
  return error instanceof StoryMediaRequestError
    ? error.message
    : getFriendlyError(error, fallback);
}

export function EntryMediaGallery(props: EntryMediaGalleryProps) {
  const { dataScope } = useAuth();
  return <EntryMediaGalleryForScope key={`${dataScope}:${props.entryId}`} {...props} dataScope={dataScope} />;
}

function EntryMediaGalleryForScope({
  entryId,
  storyTitle,
  isOwner,
  dataScope,
}: EntryMediaGalleryProps & { dataScope: string }) {
  const { session, configured } = useAuth();
  const [mediaState, setMediaState] = useState<ScopedEntryMediaState>({
    scope: null,
    assets: [],
    usage: null,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(configured);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaAssetView | null>(null);
  const requestSequence = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const accessToken = session?.access_token ?? null;
  const { assets, usage } = entryMediaForScope(mediaState, dataScope);
  const scopeLoading = configured && (loading || mediaState.scope !== dataScope);

  const load = useCallback(async () => {
    if (!configured) return;
    const requestId = ++requestSequence.current;
    const requestScope = dataScope;
    setLoading(true);
    try {
      const next = await getEntryMedia(entryId, accessToken);
      if (requestSequence.current !== requestId) return;
      setMediaState({ scope: requestScope, assets: next.assets, usage: next.usage });
      setSelectedId((current) => (
        next.assets.some((asset) => asset.id === current)
          ? current
          : (next.assets.find((asset) => asset.isCover) ?? next.assets[0])?.id ?? null
      ));
      setStatus(null);
    } catch (error) {
      if (requestSequence.current !== requestId) return;
      reportOperationalError(error, "entry-media:load");
      setMediaState({ scope: requestScope, assets: [], usage: null });
      setSelectedId(null);
      setStatus(mediaErrorMessage(error, "故事图片暂时无法读取，请稍后重试。"));
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [accessToken, configured, dataScope, entryId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      requestSequence.current += 1;
      window.clearTimeout(timer);
    };
  }, [dataScope, load]);

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length || !session) return;
    const candidates = Array.from(files).slice(0, STORY_MEDIA_MAX_FILES - assets.length);
    if (!candidates.length) {
      setStatus("每个故事最多保存 10 张图片。");
      return;
    }
    setBusy(true);
    try {
      for (let index = 0; index < candidates.length; index += 1) {
        setStatus(`正在处理第 ${index + 1} / ${candidates.length} 张图片…`);
        await uploadEntryMedia(entryId, candidates[index], session.access_token);
      }
      await load();
      setStatus(`已保存 ${candidates.length} 张图片，定位与设备信息已移除。`);
    } catch (error) {
      reportOperationalError(error, "entry-media:upload");
      setStatus(mediaErrorMessage(error, "图片暂时无法上传，请稍后重试。"));
      await load();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const setCover = async (asset: MediaAssetView) => {
    setBusy(true);
    try {
      await setEntryMediaCover(entryId, asset.id);
      await load();
      setStatus("封面图片已更新。");
    } catch (error) {
      reportOperationalError(error, "entry-media:cover");
      setStatus(getFriendlyError(error, "封面暂时无法更新，请重试。"));
    } finally {
      setBusy(false);
    }
  };

  const move = async (assetId: string, direction: "previous" | "next") => {
    const next = moveMediaAsset(assets, assetId, direction);
    if (next === assets) return;
    setBusy(true);
    setMediaState((current) => (
      current.scope === dataScope
        ? { ...current, assets: next }
        : current
    ));
    try {
      await reorderEntryMedia(entryId, next);
      await load();
      setStatus("图片顺序已更新。");
    } catch (error) {
      reportOperationalError(error, "entry-media:reorder");
      setStatus(getFriendlyError(error, "图片顺序暂时无法更新，请重试。"));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget || !session) return;
    setBusy(true);
    try {
      await deleteEntryMedia(deleteTarget.id, session.access_token);
      setDeleteTarget(null);
      await load();
      setStatus("图片已从故事中移除。");
    } catch (error) {
      reportOperationalError(error, "entry-media:delete");
      setStatus(mediaErrorMessage(error, "图片暂时无法删除，请重试。"));
    } finally {
      setBusy(false);
    }
  };

  if (!isOwner && !scopeLoading && !assets.length) return null;
  const selected = assets.find((asset) => asset.id === selectedId)
    ?? assets.find((asset) => asset.isCover)
    ?? assets[0]
    ?? null;

  return (
    <section className="entry-media" aria-labelledby={`entry-media-${entryId}`}>
      <div className="entry-media-heading">
        <div>
          <p className="eyebrow">STORY IMAGES</p>
          <h2 id={`entry-media-${entryId}`}>故事影像</h2>
        </div>
        {isOwner && assets.length < STORY_MEDIA_MAX_FILES ? (
          <label className={`secondary-button entry-media-upload${busy ? " is-disabled" : ""}`}>
            {busy ? "处理中…" : "添加图片"}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={busy}
              onChange={(event) => void uploadFiles(event.target.files)}
            />
          </label>
        ) : null}
      </div>

      {scopeLoading ? <p className="field-meta" role="status">正在读取故事图片…</p> : null}
      {!scopeLoading && !assets.length && isOwner ? (
        <div className="entry-media-empty">
          <p>给这个故事留下一帧画面。</p>
          <small>支持 JPEG、PNG、WebP；单张不超过 {formatBytes(STORY_MEDIA_MAX_SOURCE_BYTES)}，最多 10 张。</small>
        </div>
      ) : null}

      {selected ? (
        <div className="entry-media-stage">
          <Image
            src={selected.fullUrl}
            alt={`${storyTitle}的故事图片`}
            width={selected.width}
            height={selected.height}
            sizes="(max-width: 760px) 100vw, 720px"
            unoptimized
          />
          {selected.isCover ? <span className="entry-media-cover-badge">封面</span> : null}
        </div>
      ) : null}

      {assets.length ? (
        <ol className="entry-media-thumbnails" aria-label="故事图片列表">
          {assets.map((asset, index) => (
            <li key={asset.id} className={asset.id === selected?.id ? "is-selected" : undefined}>
              <button
                className="entry-media-thumbnail"
                type="button"
                onClick={() => setSelectedId(asset.id)}
                aria-label={`查看第 ${index + 1} 张图片${asset.isCover ? "，当前封面" : ""}`}
                aria-pressed={asset.id === selected?.id}
              >
                <Image
                  src={asset.thumbnailUrl}
                  alt=""
                  width={128}
                  height={96}
                  sizes="96px"
                  unoptimized
                />
              </button>
              {isOwner ? (
                <div className="entry-media-actions" aria-label={`第 ${index + 1} 张图片操作`}>
                  <button type="button" disabled={busy || index === 0} onClick={() => void move(asset.id, "previous")} aria-label="向前移动">←</button>
                  <button type="button" disabled={busy || index === assets.length - 1} onClick={() => void move(asset.id, "next")} aria-label="向后移动">→</button>
                  {!asset.isCover ? <button type="button" disabled={busy} onClick={() => void setCover(asset)}>设为封面</button> : null}
                  <button className="text-danger-button" type="button" disabled={busy} onClick={() => setDeleteTarget(asset)}>删除</button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {isOwner && usage ? (
        <p className="field-meta">图片存储 {formatBytes(usage.usedBytes)} / {formatBytes(usage.quotaBytes)} · {usage.fileCount} 个文件</p>
      ) : null}
      {status ? <div className="inline-notice" role="status">{status}</div> : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="移除这张图片？"
        description="图片会立即从故事中消失，并进入受控的存储清理流程。"
        confirmLabel="移除图片"
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
