"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { ProtectedState } from "@/components/layout/protected-state";
import { GuidedEmptyState } from "@/components/ui/guided-empty-state";
import { ExploreStoryCard } from "@/components/explore/explore-story-card";
import { useAuth } from "@/components/providers/auth-provider";
import {
  EXPLORE_PAGE_SIZE,
  listFeaturedPublicEntries,
  listPublicExploreEntries,
  mergeExploreEntries,
  type ExploreCursor,
} from "@/lib/data/explore";
import {
  EXPLORE_CATEGORIES,
  getExploreCategory,
  type ExploreCategory,
} from "@/lib/explore/categories";
import { getFriendlyError, reportOperationalError } from "@/lib/errors";
import { useEntryRealtime } from "@/hooks/use-entry-realtime";
import type { MapEntryWithProfile } from "@/types/database";
import { recordProductEvent } from "@/lib/analytics/provider";

export function ExploreView() {
  const { dataScope } = useAuth();
  return <ExploreForScope key={dataScope} />;
}

function ExploreForScope() {
  const { user, loading: authLoading, configured } = useAuth();
  const [category, setCategory] = useState<ExploreCategory>("all");
  const [entries, setEntries] = useState<MapEntryWithProfile[]>([]);
  const [featuredEntries, setFeaturedEntries] = useState<MapEntryWithProfile[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [featuredError, setFeaturedError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const entriesRef = useRef<MapEntryWithProfile[]>([]);
  const cursorRef = useRef<ExploreCursor | null>(null);
  const requestSequence = useRef(0);
  const featuredRequestSequence = useRef(0);
  const trackedOpen = useRef(false);

  useEffect(() => {
    if (!configured || authLoading || trackedOpen.current) return;
    trackedOpen.current = true;
    recordProductEvent("explore_opened", { source: "explore-page" });
  }, [authLoading, configured]);

  const load = useCallback(async (append = false) => {
    if (!configured || authLoading) return;
    const requestId = ++requestSequence.current;
    setLoading(true);
    try {
      const result = await listPublicExploreEntries(
        category,
        append ? cursorRef.current ?? undefined : undefined,
      );
      if (requestSequence.current !== requestId) return;
      const nextEntries = append
        ? mergeExploreEntries(entriesRef.current, result.entries)
        : result.entries;
      entriesRef.current = nextEntries;
      cursorRef.current = result.nextCursor;
      setEntries(nextEntries);
      setHasMore(result.hasMore);
      setError(null);
    } catch (loadError) {
      if (requestSequence.current !== requestId) return;
      reportOperationalError(loadError, "load-public-explore");
      setError(getFriendlyError(loadError, "公开故事暂时无法读取，请稍后重试。"));
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [authLoading, category, configured]);

  const loadFeatured = useCallback(async () => {
    if (!configured || authLoading) return;
    const requestId = ++featuredRequestSequence.current;
    setFeaturedLoading(true);
    try {
      const nextEntries = await listFeaturedPublicEntries();
      if (featuredRequestSequence.current !== requestId) return;
      setFeaturedEntries(nextEntries);
      setFeaturedError(null);
    } catch (loadError) {
      if (featuredRequestSequence.current !== requestId) return;
      reportOperationalError(loadError, "load-featured-explore");
      setFeaturedEntries([]);
      setFeaturedError(getFriendlyError(
        loadError,
        "编辑精选暂时无法读取，最新故事仍可继续浏览。",
      ));
    } finally {
      if (featuredRequestSequence.current === requestId) setFeaturedLoading(false);
    }
  }, [authLoading, configured]);

  const changeCategory = (nextCategory: ExploreCategory) => {
    if (nextCategory === category) return;
    requestSequence.current += 1;
    entriesRef.current = [];
    cursorRef.current = null;
    setEntries([]);
    setHasMore(false);
    setError(null);
    setLoading(true);
    setCategory(nextCategory);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(false), 0);
    return () => {
      requestSequence.current += 1;
      window.clearTimeout(timer);
    };
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadFeatured(), 0);
    return () => {
      featuredRequestSequence.current += 1;
      window.clearTimeout(timer);
    };
  }, [loadFeatured]);

  useEntryRealtime({
    enabled: configured && !authLoading,
    scopeKey: `explore-${category}-${user?.id ?? "anon"}`,
    onChange: () => {
      void load(false);
      void loadFeatured();
    },
  });

  const activeCategory = getExploreCategory(category);
  const featuredIds = useMemo(
    () => new Set(featuredEntries.map((entry) => entry.id)),
    [featuredEntries],
  );
  const latestEntries = useMemo(
    () => category === "all"
      ? entries.filter((entry) => !featuredIds.has(entry.id))
      : entries,
    [category, entries, featuredIds],
  );

  return (
    <main className="content-page explore-page">
      <AppHeader />
      <div className="content-container">
        <div className="page-heading explore-heading">
          <div>
            <p className="eyebrow">PUBLIC STORY ATLAS</p>
            <h1>探索故事</h1>
            <p>从陌生人的地点记忆里，找到一条通往城市、旅途和想象世界的线索。</p>
          </div>
          <Link className="quiet-button" href="/">返回地图</Link>
        </div>

        <div className="explore-privacy-note">
          <span aria-hidden="true">◎</span>
          <p><strong>这里始终只展示已经公开并解锁的故事。</strong><span>登录不会让私密、群组或未来胶囊进入探索结果。</span></p>
        </div>

        <div className="explore-category-tabs" aria-label="探索分类">
          {EXPLORE_CATEGORIES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={category === option.value}
              onClick={() => changeCategory(option.value)}
            >
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </button>
          ))}
        </div>

        {category === "all" && featuredEntries.length ? (
          <section className="explore-featured" aria-labelledby="explore-featured-title">
            <div className="explore-section-heading">
              <div><p className="eyebrow">EDITOR&apos;S PICKS</p><h2 id="explore-featured-title">编辑精选</h2></div>
              <span>{featuredEntries.length} 个值得停留的地点</span>
            </div>
            <div className="explore-featured-grid">
              {featuredEntries.map((entry) => <ExploreStoryCard entry={entry} featured key={entry.id} />)}
            </div>
          </section>
        ) : null}
        {category === "all" && featuredError ? (
          <div className="inline-notice" role="status">{featuredError}</div>
        ) : null}
        {category === "all" && featuredLoading && !featuredEntries.length && !featuredError ? (
          <p className="explore-featured-loading" role="status">正在翻阅编辑精选…</p>
        ) : null}

        <div className="explore-section-heading">
          <div><p className="eyebrow">{activeCategory.value === "all" ? "LATEST" : "STORY LENS"}</p><h2>{activeCategory.label}</h2></div>
          {!loading && !error ? <span>本页 {latestEntries.length} 条公开故事</span> : null}
        </div>

        {!configured ? <ProtectedState kind="config" /> : authLoading ? <ProtectedState kind="loading" /> : (
          <>
            {error && !entries.length ? (
              <div className="content-state" role="alert">
                <h2>探索暂时中断了</h2>
                <p>{error}</p>
                <div className="record-actions">
                  <button className="primary-button" type="button" onClick={() => void load(false)}>重新加载</button>
                  <Link className="quiet-button" href="/">返回地图</Link>
                </div>
              </div>
            ) : null}
            {error && entries.length ? <div className="inline-error" role="alert">{error}</div> : null}

            <div className="explore-grid">
              {latestEntries.map((entry) => <ExploreStoryCard entry={entry} key={entry.id} />)}
            </div>

            {!entries.length && !loading && !error ? (
              <GuidedEmptyState
                eyebrow="A PLACE IS WAITING"
                title={category === "all" ? "公开故事还没有来到这里。" : `还没有归入“${activeCategory.label}”的公开故事。`}
                description={category === "all" ? "公开你的第一条地点故事，让另一位旅人从这里出发。" : "分类来自故事标签。可以看看全部故事，或为自己的公开故事补上相关标签。"}
              >
                {category !== "all" ? <button className="primary-button" type="button" onClick={() => changeCategory("all")}>查看全部</button> : null}
                <Link className="quiet-button" href="/">从地图开始记录</Link>
              </GuidedEmptyState>
            ) : null}
            {loading && !entries.length ? <div className="content-state" role="status">正在展开公开故事…</div> : null}
            {hasMore && !error ? (
              <button className="secondary-button explore-more" disabled={loading} type="button" onClick={() => void load(true)}>
                加载更多（每页 {EXPLORE_PAGE_SIZE} 条）
              </button>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
