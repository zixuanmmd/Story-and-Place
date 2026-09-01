"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { ProtectedState } from "@/components/layout/protected-state";
import { MapErrorBoundary } from "@/components/map/map-error-boundary";
import { EntryTags } from "@/components/entries/entry-tags";
import { EntrySocial } from "@/components/social/entry-social";
import { EntryMediaGallery } from "@/components/entries/entry-media-gallery";
import { useAuth } from "@/components/providers/auth-provider";
import { getCategoryLabel, PlaceCategoryIcon } from "@/lib/categories/registry";
import { getEntryShareData, type EntryShareData } from "@/lib/data/entry-share";
import { getParticipantEditableFields } from "@/lib/data/entry-collaboration";
import { getFriendlyError, reportOperationalError } from "@/lib/errors";
import { getEntryShareDescription, getEntryShareUrl, shareEntry } from "@/lib/entries/share";
import { ENTRY_AUDIENCE_PRESENTATION } from "@/lib/privacy/presentation";
import { formatUnlockAt, getTimeCapsuleState } from "@/lib/time/time-capsule";
import { ENTRY_EDITABLE_FIELD_LABELS } from "@/lib/data/entry-collaboration";
import { TIME_PRECISION_LABELS } from "@/lib/validation/entry";
import { useEntryRealtime } from "@/hooks/use-entry-realtime";
import { recordProductEvent } from "@/lib/analytics/provider";

const EntryMiniMap = dynamic(
  () => import("@/components/map/entry-mini-map").then((module) => module.EntryMiniMap),
  { ssr: false, loading: () => <div className="map-loading" role="status">正在展开地点…</div> },
);

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function EntryShareView({ entryId }: { entryId: string }) {
  const { dataScope } = useAuth();
  return <EntryShareForScope key={`${dataScope}:${entryId}`} entryId={entryId} />;
}

function EntryShareForScope({ entryId }: { entryId: string }) {
  const { user, loading: authLoading, configured } = useAuth();
  const [data, setData] = useState<EntryShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const trackedPublicOpen = useRef(false);
  const currentUserId = user?.id ?? null;

  const load = useCallback(async () => {
    if (!configured || authLoading) return;
    const requestId = ++requestSequence.current;
    setLoading(true);
    try {
      const next = await getEntryShareData(entryId, currentUserId);
      if (requestSequence.current !== requestId) return;
      setData(next);
      if (next?.entry.visibility === "public" && !trackedPublicOpen.current) {
        trackedPublicOpen.current = true;
        recordProductEvent("public_story_opened", { source: "entry-share" });
      }
      setFailed(false);
      setStatus(null);
    } catch (loadError) {
      if (requestSequence.current !== requestId) return;
      reportOperationalError(loadError, "load-entry-share-page");
      setData(null);
      setFailed(true);
      setStatus(getFriendlyError(loadError, "故事暂时无法读取，请稍后重试。"));
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [authLoading, configured, currentUserId, entryId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      requestSequence.current += 1;
      window.clearTimeout(timer);
    };
  }, [load]);

  useEntryRealtime({
    enabled: configured && !authLoading,
    scopeKey: `entry-share-${entryId}-${currentUserId ?? "anon"}`,
    includeCollaboration: Boolean(user),
    onChange: load,
  });

  const share = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const result = await shareEntry({
        title: data.entry.title,
        text: getEntryShareDescription(data.entry.content, data.entry.place_name),
        url: getEntryShareUrl(
          data.entry.id,
          process.env.NEXT_PUBLIC_SITE_URL,
          window.location.origin,
        ),
      }, navigator);
      if (result === "copied" || result === "shared") {
        recordProductEvent("story_shared", { source: "entry-share", content_type: "entry" });
      }
      setStatus(result === "copied" ? "故事链接已复制。" : result === "shared" ? "分享面板已打开。" : null);
    } catch {
      setStatus("暂时无法复制分享链接，请从浏览器地址栏复制。 ");
    } finally {
      setBusy(false);
    }
  };

  if (!configured) {
    return <main className="content-page"><AppHeader /><div className="content-container"><ProtectedState kind="config" /></div></main>;
  }
  if (authLoading || loading) {
    return <main className="content-page"><AppHeader /><div className="content-container"><div className="content-state" role="status">正在读取这个故事…</div></div></main>;
  }
  if (!data) {
    return (
      <main className="content-page entry-share-page">
        <AppHeader />
        <div className="content-container">
          <div className="content-state" role={failed ? "alert" : undefined}>
            <p className="eyebrow">STORY NOT AVAILABLE</p>
            <h1>这个故事暂时无法打开</h1>
            <p>{failed ? status : "链接可能已经失效，或者这个故事目前不对你开放。"}</p>
            <div className="record-actions">
              <button className="primary-button" type="button" onClick={() => void load()}>重试</button>
              {!user ? <Link className="secondary-button" href={`/login?next=${encodeURIComponent(`/entries/${entryId}`)}`}>登录后再试</Link> : null}
              <Link className="quiet-button" href="/">返回地图</Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const { entry, participants, routes, group } = data;
  const isOwner = user?.id === entry.user_id;
  const myParticipant = participants.find((participant) => participant.user_id === user?.id) ?? null;
  const editableFields = getParticipantEditableFields(entry, user?.id ?? null, myParticipant);
  const capsuleState = getTimeCapsuleState(entry.unlock_at);

  return (
    <main className="content-page entry-share-page">
      <AppHeader />
      <article className="content-container entry-share-container">
        <header className="entry-share-hero">
          <div>
            <p className="eyebrow">A STORY IN PLACE</p>
            <div className="entry-share-badges">
              <span className={`visibility-badge visibility-badge--${entry.visibility}`}>
                <b aria-hidden="true">{ENTRY_AUDIENCE_PRESENTATION[entry.visibility].glyph}</b>
                {ENTRY_AUDIENCE_PRESENTATION[entry.visibility].shortLabel}
              </span>
              <span className="entry-share-category"><PlaceCategoryIcon category={entry.place_category_slug} />{getCategoryLabel(entry.place_category_slug)}</span>
            </div>
            <h1>{entry.title}</h1>
            <p className="entry-share-time">{entry.time_label}</p>
            {entry.place_name ? <p className="entry-share-place">⌖ {entry.place_name}</p> : null}
          </div>
          <div className="record-actions">
            <button className="primary-button" type="button" disabled={busy} onClick={() => void share()}>{busy ? "处理中…" : "分享故事"}</button>
            <Link className="secondary-button" href={`/?entry=${entry.id}`}>在主地图中打开</Link>
          </div>
        </header>

        {entry.unlock_at ? (
          <div className={`capsule-notice capsule-notice--${capsuleState}`}>
            <b aria-hidden="true">⌛</b>
            {capsuleState === "future" ? `这枚时间胶囊将在 ${formatUnlockAt(entry.unlock_at)} 解锁。` : `这枚时间胶囊已于 ${formatUnlockAt(entry.unlock_at)} 解锁。`}
          </div>
        ) : null}
        {isOwner && entry.moderation_status && entry.moderation_status !== "active" ? (
          <div className="inline-notice" role="status">
            这条公开故事当前已被限制展示。{entry.moderation_reason ? ` 原因：${entry.moderation_reason}` : ""}
          </div>
        ) : null}
        {status ? <div className="inline-notice" role="status">{status}</div> : null}

        <div className="entry-share-layout">
          <div className="entry-share-story">
            <EntryTags entry={entry} />
            <EntryMediaGallery entryId={entry.id} storyTitle={entry.title} isOwner={isOwner} />
            <div className="entry-share-content">{entry.content}</div>

            <section className="entry-share-people" aria-labelledby="story-people-title">
              <h2 id="story-people-title">故事中的人</h2>
              <div className="entry-share-person-list">
                <Link href={`/users/${entry.user_id}`}><strong>{entry.profiles?.display_name ?? "地图旅人"}</strong><small>创建者</small></Link>
                {participants.map((participant) => (
                  <Link href={`/users/${participant.user_id}`} key={participant.user_id}>
                    <strong>{participant.profiles?.display_name ?? "共同经历者"}</strong><small>共同经历者</small>
                  </Link>
                ))}
              </div>
              {!isOwner && editableFields.length ? (
                <p className="entry-share-permissions">你可以修改：{editableFields.map((field) => ENTRY_EDITABLE_FIELD_LABELS[field]).join("、")}。</p>
              ) : null}
            </section>

            {routes.length ? (
              <section className="entry-share-routes" aria-labelledby="story-routes-title">
                <h2 id="story-routes-title">所属故事路线</h2>
                {routes.map((route) => <Link key={route.id} href={`/routes/${route.share_slug}`}>{route.title}</Link>)}
              </section>
            ) : null}

            <dl className="detail-meta entry-share-meta">
              <div><dt>时间精度</dt><dd>{TIME_PRECISION_LABELS[entry.time_precision]}</dd></div>
              <div><dt>坐标</dt><dd>{entry.latitude.toFixed(5)}, {entry.longitude.toFixed(5)}</dd></div>
              {group ? <div><dt>所属群组</dt><dd><Link href={`/groups/${group.slug}`}>{group.name}</Link></dd></div> : null}
              <div><dt>创建于</dt><dd>{formatTimestamp(entry.created_at)}</dd></div>
              <div><dt>更新于</dt><dd>{formatTimestamp(entry.updated_at)}</dd></div>
            </dl>
          </div>
          <aside className="entry-share-map" aria-label="故事地点小地图">
            <MapErrorBoundary><EntryMiniMap entry={entry} onTileError={() => setMapError("地图瓦片暂时无法加载，请检查网络后重试。")} /></MapErrorBoundary>
            {mapError ? <div className="inline-error" role="alert">{mapError}</div> : null}
          </aside>
        </div>

        {capsuleState === "future" ? <p className="capsule-social-locked">解锁前不开放点赞和评论。</p> : <EntrySocial key={entry.id} entry={entry} />}
      </article>
    </main>
  );
}
