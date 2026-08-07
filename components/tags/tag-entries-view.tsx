"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { EntryTags } from "@/components/entries/entry-tags";
import { useAuth } from "@/components/providers/auth-provider";
import {
  getPublicEmotionSummary,
  getVisibleTagSummary,
  listEntriesByTag,
  listPublicEmotionEntries,
  TAG_PAGE_SIZE,
  type VisibleTagSummary,
} from "@/lib/data/tags";
import { getFriendlyError, reportOperationalError } from "@/lib/errors";
import {
  emotionSemanticKeySchema,
  getTagTypeLabel,
} from "@/lib/validation/tags";
import type { MapEntryWithProfile } from "@/types/database";
import { useEntryRealtime } from "@/hooks/use-entry-realtime";
import { GuidedEmptyState } from "@/components/ui/guided-empty-state";

export function TagEntriesView({ slug }: { slug: string }) {
  const { dataScope } = useAuth();
  return (
    <TaggedEntriesForScope
      key={`${dataScope}:${slug}`}
      kind="tag"
      value={slug}
    />
  );
}

export function EmotionEntriesView({ emotion }: { emotion: string }) {
  const { dataScope } = useAuth();
  return (
    <TaggedEntriesForScope
      key={`${dataScope}:emotion:${emotion}`}
      kind="emotion"
      value={emotion}
    />
  );
}

function TaggedEntriesForScope({
  kind,
  value,
}: {
  kind: "tag" | "emotion";
  value: string;
}) {
  const { user, loading: authLoading, configured } = useAuth();
  const [summary, setSummary] = useState<VisibleTagSummary | null>(null);
  const [entries, setEntries] = useState<MapEntryWithProfile[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const load = useCallback(async (nextPage = 0, append = false) => {
    if (!configured || authLoading) return;
    if (kind === "emotion" && !emotionSemanticKeySchema.safeParse(value).success) {
      setSummary(null);
      setEntries([]);
      setHasMore(false);
      setLoading(false);
      setError(null);
      return;
    }
    const requestId = ++requestSequence.current;
    setLoading(true);
    try {
      const [nextSummary, result] = kind === "emotion"
        ? await Promise.all([
            getPublicEmotionSummary(value),
            listPublicEmotionEntries(value, nextPage),
          ])
        : await Promise.all([
            getVisibleTagSummary(value),
            listEntriesByTag(value, nextPage),
          ]);
      if (requestSequence.current !== requestId) return;
      setSummary(nextSummary);
      setEntries((current) => append
        ? [...current, ...result.entries]
        : result.entries);
      setHasMore(result.hasMore);
      setPage(nextPage);
      setError(null);
    } catch (loadError) {
      if (requestSequence.current !== requestId) return;
      reportOperationalError(loadError, `load-${kind}-entries`);
      setError(getFriendlyError(
        loadError,
        kind === "emotion"
          ? "情绪故事暂时无法读取。"
          : "标签记录暂时无法读取。",
      ));
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [authLoading, configured, kind, value]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      requestSequence.current += 1;
      window.clearTimeout(timer);
    };
  }, [load]);

  useEntryRealtime({
    enabled: configured,
    scopeKey: `${kind}-${value}-${user?.id ?? "anon"}`,
    includeCollaboration: kind === "tag" && Boolean(user),
    onChange: load,
  });

  const isEmotion = kind === "emotion";
  const emptyMessage = isEmotion
    ? "还没有公开的相关情绪故事。"
    : "没有可读取的相关记录。";

  return (
    <main className="content-page">
      <AppHeader />
      <div className="content-container">
        <div className="page-heading">
          <div>
            <p className="eyebrow">
              {isEmotion ? "EMOTION STORIES" : "TAGGED STORIES"}
            </p>
            <h1>{summary ? `#${summary.name}` : isEmotion ? "情绪故事" : "标签故事"}</h1>
            <p>
              {loading
                ? "正在整理相关故事…"
                : summary
                  ? isEmotion
                    ? `这里收录 ${summary.entry_count} 条公开故事。`
                    : `你当前有权读取 ${summary.entry_count} 条相关记录。`
                  : emptyMessage}
            </p>
          </div>
          <Link className="quiet-button" href="/tags">浏览标签</Link>
        </div>
        {summary ? (
          <p className="tag-page-context">
            <span className="tag-type-badge">{getTagTypeLabel(summary.type)}</span>
            {isEmotion ? "公共情绪页不会包含私密或群组故事。" : "结果会随你的访问权限变化。"}
          </p>
        ) : null}
        {error ? <div className="inline-error" role="alert">{error}</div> : null}
        <div className="records-list">
          {entries.map((entry) => (
            <article className="record-card" key={entry.id}>
              <div>
                <p className="eyebrow">{entry.time_label}</p>
                <h2>{entry.title}</h2>
                <p>{entry.content}</p>
                <p>
                  {entry.profiles?.display_name ?? "地图旅人"}
                  {entry.place_name ? ` · ${entry.place_name}` : ""}
                </p>
                <EntryTags entry={entry} />
              </div>
              <Link href={`/?entry=${entry.id}`}>在地图中打开</Link>
            </article>
          ))}
        </div>
        {!entries.length && !loading && !error ? (
          <GuidedEmptyState eyebrow={isEmotion ? "AN EMOTION AWAITS A PLACE" : "FOLLOW ANOTHER THREAD"} title={isEmotion ? "这种情绪还没有公开的故事地点。" : "这条标签线索暂时没有你可读取的故事。"} description={isEmotion ? "公开故事出现后，它会在这里形成一张情绪地图。" : "浏览其他标签，或在自己的故事里留下这个词。"}><Link className="primary-button nav-link" href="/tags">浏览其他标签</Link><Link className="quiet-button nav-link" href="/">回到地图</Link></GuidedEmptyState>
        ) : null}
        {loading ? <div className="content-state">正在读取相关故事…</div> : null}
        {hasMore ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(page + 1, true)}
          >
            加载更多（每页 {TAG_PAGE_SIZE} 条）
          </button>
        ) : null}
      </div>
    </main>
  );
}
