"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { EntryTags } from "@/components/entries/entry-tags";
import { useAuth } from "@/components/providers/auth-provider";
import {
  getVisibleTagSummary,
  listEntriesByTag,
  TAG_PAGE_SIZE,
  type VisibleTagSummary,
} from "@/lib/data/tags";
import { getFriendlyError } from "@/lib/errors";
import type { MapEntryWithProfile } from "@/types/database";
import { useEntryRealtime } from "@/hooks/use-entry-realtime";

export function TagEntriesView({ slug }: { slug: string }) {
  const { user, configured } = useAuth();
  const [summary, setSummary] = useState<VisibleTagSummary | null>(null);
  const [entries, setEntries] = useState<MapEntryWithProfile[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (nextPage = 0, append = false) => {
    if (!configured) return;
    setLoading(true);
    try {
      const [nextSummary, result] = await Promise.all([
        getVisibleTagSummary(slug),
        listEntriesByTag(slug, nextPage),
      ]);
      setSummary(nextSummary);
      setEntries((current) => append ? [...current, ...result.entries] : result.entries);
      setHasMore(result.hasMore);
      setPage(nextPage);
      setError(null);
    } catch (loadError) {
      setError(getFriendlyError(loadError, "标签记录暂时无法读取。"));
    } finally {
      setLoading(false);
    }
  }, [configured, slug]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEntryRealtime({
    enabled: configured,
    scopeKey: `tag-${slug}-${user?.id ?? "anon"}`,
    includeCollaboration: Boolean(user),
    onChange: load,
  });

  return (
    <main className="content-page">
      <AppHeader />
      <div className="content-container">
        <div className="page-heading">
          <div>
            <p className="eyebrow">TAGGED STORIES</p>
            <h1>{summary ? `#${summary.name}` : "标签故事"}</h1>
            <p>{summary ? `你当前有权读取 ${summary.entry_count} 条相关记录。` : "没有可读取的相关记录。"}</p>
          </div>
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
        <div className="records-list">
          {entries.map((entry) => (
            <article className="record-card" key={entry.id}>
              <div>
                <p className="eyebrow">{entry.time_label}</p>
                <h2>{entry.title}</h2>
                <p>{entry.content}</p>
                <p>{entry.profiles?.display_name ?? "地图旅人"}{entry.place_name ? ` · ${entry.place_name}` : ""}</p>
                <EntryTags entry={entry} />
              </div>
              <Link href={`/?entry=${entry.id}`}>在地图中打开</Link>
            </article>
          ))}
        </div>
        {!entries.length && !loading && !error ? <div className="content-state">没有可读取的相关记录。</div> : null}
        {loading ? <div className="content-state">正在读取标签故事…</div> : null}
        {hasMore ? (
          <button type="button" disabled={loading} onClick={() => void load(page + 1, true)}>
            加载更多（每页 {TAG_PAGE_SIZE} 条）
          </button>
        ) : null}
      </div>
    </main>
  );
}
