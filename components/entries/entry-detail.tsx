"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MapEntryWithProfile } from "@/types/database";
import { TIME_PRECISION_LABELS } from "@/lib/validation/entry";
import { getCategoryLabel, PlaceCategoryIcon } from "@/lib/categories/registry";
import { EntrySocial } from "@/components/social/entry-social";
import { EntryTags } from "@/components/entries/entry-tags";
import { EntryParticipants } from "@/components/entries/entry-participants";
import { EntryEditHistory } from "@/components/entries/entry-edit-history";
import { EntryMediaGallery } from "@/components/entries/entry-media-gallery";
import {
  formatUnlockAt,
  getTimeCapsuleState,
} from "@/lib/time/time-capsule";
import {
  ENTRY_AUDIENCE_PRESENTATION,
  getEntryAudienceActionLabel,
} from "@/lib/privacy/presentation";

type EntryDetailProps = {
  entry: MapEntryWithProfile;
  isOwner: boolean;
  canEdit: boolean;
  canCollaborate: boolean;
  busy?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleVisibility: () => void;
};

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function EntryDetail({
  entry,
  isOwner,
  canEdit,
  canCollaborate,
  busy = false,
  onClose,
  onEdit,
  onDelete,
  onToggleVisibility,
}: EntryDetailProps) {
  const [now, setNow] = useState(() => Date.now());
  const capsuleState = getTimeCapsuleState(entry.unlock_at, now);
  useEffect(() => {
    if (!entry.unlock_at || capsuleState !== "future") return;
    const remaining = new Date(entry.unlock_at).getTime() - Date.now();
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(Math.max(remaining + 100, 100), 2_147_000_000),
    );
    return () => window.clearTimeout(timer);
  }, [capsuleState, entry.unlock_at]);

  return (
    <article className="entry-detail">
      <div className="detail-topline">
        <span className={`visibility-badge visibility-badge--${entry.visibility}`}>
          <b aria-hidden="true">{ENTRY_AUDIENCE_PRESENTATION[entry.visibility].glyph}</b>
          {ENTRY_AUDIENCE_PRESENTATION[entry.visibility].shortLabel}
        </span>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭详情">×</button>
      </div>

      <p className="detail-time">{entry.time_label}</p>
      {entry.unlock_at ? (
        <p className={`capsule-notice capsule-notice--${capsuleState}`}>
          <b aria-hidden="true">⌛</b>
          {capsuleState === "future"
            ? `时间胶囊将在 ${formatUnlockAt(entry.unlock_at)} 解锁；此前只有你能看到。`
            : `这枚时间胶囊已于 ${formatUnlockAt(entry.unlock_at)} 解锁。`}
        </p>
      ) : null}
      {isOwner && entry.moderation_status && entry.moderation_status !== "active" ? (
        <p className="inline-notice" role="status">
          这条公开故事当前已被限制展示。{entry.moderation_reason ? ` 原因：${entry.moderation_reason}` : ""}
        </p>
      ) : null}
      <h2>{entry.title}</h2>
      <p className="detail-category"><PlaceCategoryIcon category={entry.place_category_slug} /> {getCategoryLabel(entry.place_category_slug)}</p>
      {entry.place_name ? <p className="detail-place">⌖ {entry.place_name}</p> : null}
      <EntryTags entry={entry} />
      <EntryMediaGallery entryId={entry.id} storyTitle={entry.title} isOwner={isOwner} />
      <div className="detail-content">{entry.content}</div>

      <div className="detail-share-link">
        <Link href={`/entries/${entry.id}`}>打开独立故事页与分享链接</Link>
      </div>

      <dl className="detail-meta">
        <div><dt>时间精度</dt><dd>{TIME_PRECISION_LABELS[entry.time_precision]}</dd></div>
        {entry.time_precision === "exact" ? <div><dt>事件时区</dt><dd>{entry.occurred_timezone ?? "未知（保留原当地时间）"}</dd></div> : null}
        <div><dt>经纬度</dt><dd>{entry.latitude.toFixed(5)}, {entry.longitude.toFixed(5)}</dd></div>
        <div><dt>作者</dt><dd><Link href={`/users/${entry.user_id}`}>{entry.profiles?.display_name ?? "地图旅人"}</Link></dd></div>
        <div><dt>创建于</dt><dd>{formatTimestamp(entry.created_at)}</dd></div>
        <div><dt>更新于</dt><dd>{formatTimestamp(entry.updated_at)}</dd></div>
        {entry.unlock_at ? <div><dt>胶囊解锁</dt><dd>{formatUnlockAt(entry.unlock_at)}</dd></div> : null}
      </dl>

      {(canEdit || isOwner) && (entry.moderation_status ?? "active") === "active" ? (
        <div className="owner-actions">
          {canEdit ? <button className="secondary-button" type="button" onClick={onEdit} disabled={busy}>编辑</button> : null}
          {isOwner ? (
            <>
              <button className="secondary-button" type="button" onClick={onToggleVisibility} disabled={busy}>
                {busy ? "正在更新…" : getEntryAudienceActionLabel(entry.visibility)}
              </button>
              <button className="text-danger-button" type="button" onClick={onDelete} disabled={busy}>删除</button>
            </>
          ) : null}
        </div>
      ) : null}
      {isOwner ? <EntryParticipants entryId={entry.id} /> : null}
      {canCollaborate ? <EntryEditHistory entryId={entry.id} /> : null}
      {capsuleState === "future" ? (
        <p className="capsule-social-locked">解锁前不开放点赞和评论。</p>
      ) : (
        <EntrySocial key={entry.id} entry={entry} />
      )}
    </article>
  );
}
