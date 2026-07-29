"use client";

import Link from "next/link";
import type { MapEntryWithProfile } from "@/types/database";
import { TIME_PRECISION_LABELS, VISIBILITY_LABELS } from "@/lib/validation/entry";
import { getCategoryLabel, PlaceCategoryIcon } from "@/lib/categories/registry";
import { EntrySocial } from "@/components/social/entry-social";
import { EntryTags } from "@/components/entries/entry-tags";
import { EntryParticipants } from "@/components/entries/entry-participants";
import { EntryEditHistory } from "@/components/entries/entry-edit-history";

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
  return (
    <article className="entry-detail">
      <div className="detail-topline">
        <span className={`visibility-badge visibility-badge--${entry.visibility}`}>
          <b aria-hidden="true">{entry.visibility === "private" ? "▣" : entry.visibility === "group" ? "◇" : "◉"}</b>
          {VISIBILITY_LABELS[entry.visibility]}
        </span>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭详情">×</button>
      </div>

      <p className="detail-time">{entry.time_label}</p>
      <h2>{entry.title}</h2>
      <p className="detail-category"><PlaceCategoryIcon category={entry.place_category_slug} /> {getCategoryLabel(entry.place_category_slug)}</p>
      {entry.place_name ? <p className="detail-place">⌖ {entry.place_name}</p> : null}
      <EntryTags entry={entry} />
      <div className="detail-content">{entry.content}</div>

      <dl className="detail-meta">
        <div><dt>时间精度</dt><dd>{TIME_PRECISION_LABELS[entry.time_precision]}</dd></div>
        {entry.time_precision === "exact" ? <div><dt>事件时区</dt><dd>{entry.occurred_timezone ?? "未知（保留原当地时间）"}</dd></div> : null}
        <div><dt>经纬度</dt><dd>{entry.latitude.toFixed(5)}, {entry.longitude.toFixed(5)}</dd></div>
        <div><dt>作者</dt><dd><Link href={`/users/${entry.user_id}`}>{entry.profiles?.display_name ?? "地图旅人"}</Link></dd></div>
        <div><dt>创建于</dt><dd>{formatTimestamp(entry.created_at)}</dd></div>
        <div><dt>更新于</dt><dd>{formatTimestamp(entry.updated_at)}</dd></div>
      </dl>

      {canEdit || isOwner ? (
        <div className="owner-actions">
          {canEdit ? <button className="secondary-button" type="button" onClick={onEdit} disabled={busy}>编辑</button> : null}
          {isOwner ? (
            <>
              <button className="secondary-button" type="button" onClick={onToggleVisibility} disabled={busy}>
                {busy ? "正在更新…" : entry.visibility === "public" ? "设为私密" : "设为公开"}
              </button>
              <button className="text-danger-button" type="button" onClick={onDelete} disabled={busy}>删除</button>
            </>
          ) : null}
        </div>
      ) : null}
      {isOwner ? <EntryParticipants entryId={entry.id} /> : null}
      {canCollaborate ? <EntryEditHistory entryId={entry.id} /> : null}
      <EntrySocial key={entry.id} entry={entry} />
    </article>
  );
}
