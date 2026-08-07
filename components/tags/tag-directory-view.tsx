"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { useAuth } from "@/components/providers/auth-provider";
import {
  listVisibleTags,
  TAG_PAGE_SIZE,
  type VisibleTagSummary,
} from "@/lib/data/tags";
import { getFriendlyError, reportOperationalError } from "@/lib/errors";
import {
  getTagTypeLabel,
  getTagHref,
  TAG_TYPE_OPTIONS,
} from "@/lib/validation/tags";
import type { TagType } from "@/types/database";
import { useEntryRealtime } from "@/hooks/use-entry-realtime";
import { GuidedEmptyState } from "@/components/ui/guided-empty-state";

type TagTypeFilter = TagType | "all";

export function TagDirectoryView() {
  const { dataScope } = useAuth();
  return <TagDirectoryForScope key={dataScope} />;
}

function TagDirectoryForScope() {
  const { user, loading: authLoading, configured } = useAuth();
  const [filter, setFilter] = useState<TagTypeFilter>("all");
  const [tags, setTags] = useState<VisibleTagSummary[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const changeFilter = (nextFilter: TagTypeFilter) => {
    if (nextFilter === filter) return;
    requestSequence.current += 1;
    setFilter(nextFilter);
    setTags([]);
    setPage(0);
    setHasMore(false);
    setError(null);
  };

  const load = useCallback(async (nextPage = 0, append = false) => {
    if (!configured || authLoading) return;
    const requestId = ++requestSequence.current;
    setLoading(true);
    try {
      const result = await listVisibleTags(
        filter === "all" ? null : filter,
        nextPage,
      );
      if (requestSequence.current !== requestId) return;
      setTags((current) => append ? [...current, ...result.tags] : result.tags);
      setPage(nextPage);
      setHasMore(result.hasMore);
      setError(null);
    } catch (loadError) {
      if (requestSequence.current !== requestId) return;
      reportOperationalError(loadError, "load-visible-tags");
      setError(getFriendlyError(loadError, "标签暂时无法读取。"));
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [authLoading, configured, filter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      requestSequence.current += 1;
      window.clearTimeout(timer);
    };
  }, [load]);

  useEntryRealtime({
    enabled: configured,
    scopeKey: `tag-directory-${filter}-${user?.id ?? "anon"}`,
    includeCollaboration: Boolean(user),
    onChange: load,
  });

  return (
    <main className="content-page">
      <AppHeader />
      <div className="content-container">
        <div className="page-heading">
          <div>
            <p className="eyebrow">STORY VOCABULARY</p>
            <h1>故事标签</h1>
            <p>只统计你当前有权读取的故事，可按标签类型慢慢翻阅。</p>
          </div>
          <Link className="quiet-button" href="/">返回地图</Link>
        </div>

        <div className="tag-type-filters" aria-label="按标签类型筛选">
          <button
            type="button"
            aria-pressed={filter === "all"}
            onClick={() => changeFilter("all")}
          >
            全部
          </button>
          {TAG_TYPE_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.value}
              aria-pressed={filter === option.value}
              onClick={() => changeFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {error ? <div className="inline-error" role="alert">{error}</div> : null}
        <div className="tag-directory-grid">
          {tags.map((tag) => {
            const href = getTagHref(tag);
            return (
              <Link className="tag-directory-card" href={href} key={tag.slug}>
                <span className="tag-type-badge">{getTagTypeLabel(tag.type)}</span>
                <strong>#{tag.name}</strong>
                <span>{tag.entry_count} 条可见故事</span>
              </Link>
            );
          })}
        </div>

        {!tags.length && !loading && !error ? (
          <GuidedEmptyState eyebrow="A STORY NEEDS A WORD" title="还没有故事使用这类标签。" description="标签会在故事之间留下隐约的线索。先写一个故事，或看看其他标签类型。"><Link className="primary-button nav-link" href="/">从地图开始</Link></GuidedEmptyState>
        ) : null}
        {loading ? <div className="content-state">正在整理标签…</div> : null}
        {hasMore ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(page + 1, true)}
          >
            加载更多（每页 {TAG_PAGE_SIZE} 个标签）
          </button>
        ) : null}
      </div>
    </main>
  );
}
