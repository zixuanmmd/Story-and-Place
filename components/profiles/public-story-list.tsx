"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EntryTags } from "@/components/entries/entry-tags";
import { GuidedEmptyState } from "@/components/ui/guided-empty-state";
import { PlaceCategoryIcon, getCategoryLabel } from "@/lib/categories/registry";
import {
  listPublicProfileStories,
  mergePublicProfileStories,
  PUBLIC_PROFILE_STORY_PAGE_SIZE,
  type PublicProfileStoryCursor,
} from "@/lib/data/public-profile";
import { getFriendlyError } from "@/lib/errors";
import { useEntryRealtime } from "@/hooks/use-entry-realtime";
import type { MapEntryWithProfile, Profile } from "@/types/database";

export function PublicStoryList({
  profile,
  isOwnProfile,
}: {
  profile: Profile;
  isOwnProfile: boolean;
}) {
  const [entries, setEntries] = useState<MapEntryWithProfile[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<PublicProfileStoryCursor | null>(null);
  const loadingRef = useRef(false);
  const requestSequence = useRef(0);

  const load = useCallback(async (append = false) => {
    if (loadingRef.current || (append && !cursorRef.current)) return;
    const requestId = ++requestSequence.current;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const page = await listPublicProfileStories(
        profile.id,
        append ? cursorRef.current ?? undefined : undefined,
      );
      if (requestSequence.current !== requestId) return;
      setEntries((current) => append
        ? mergePublicProfileStories(current, page.entries)
        : page.entries);
      cursorRef.current = page.nextCursor;
      setHasMore(page.hasMore);
    } catch (nextError) {
      if (requestSequence.current !== requestId) return;
      setError(getFriendlyError(nextError, "公开故事暂时无法加载，请稍后重试。"));
      if (!append) {
        setEntries([]);
        cursorRef.current = null;
        setHasMore(false);
      }
    } finally {
      if (requestSequence.current === requestId) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [profile.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(false), 0);
    return () => {
      requestSequence.current += 1;
      loadingRef.current = false;
      window.clearTimeout(timer);
    };
  }, [load]);

  useEntryRealtime({
    enabled: true,
    scopeKey: `public-profile-${profile.id}`,
    onChange: () => void load(false),
  });

  return (
    <section className="content-section public-profile-stories">
      <div className="section-heading">
        <div><p className="eyebrow">PUBLIC STORIES</p><h2>公开故事</h2></div>
        {!loading && !error ? <span>已显示 {entries.length} 条</span> : null}
      </div>
      <p className="section-intro">这里只展示已经解锁、对所有人可见的地点故事；登录身份不会扩大这个列表的范围。</p>

      {error && !entries.length ? (
        <div className="content-state" role="alert">
          <h3>故事暂时没有展开</h3>
          <p>{error}</p>
          <button className="secondary-button" type="button" onClick={() => void load(false)}>重新加载</button>
        </div>
      ) : null}
      {error && entries.length ? <div className="inline-error" role="alert">{error}</div> : null}

      {entries.length ? <div className="public-story-grid">{entries.map((entry) => (
        <article className="public-story-card" key={entry.id}>
          <header>
            <span className="public-story-category"><PlaceCategoryIcon category={entry.place_category_slug} /><small>{getCategoryLabel(entry.place_category_slug)}</small></span>
            <small>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(entry.created_at))}</small>
          </header>
          <div className="public-story-card-body">
            <p className="eyebrow">{entry.time_label}</p>
            <h3>{entry.title}</h3>
            <p className="public-story-place">{entry.place_name || getCategoryLabel(entry.place_category_slug)}</p>
            <p className="public-story-excerpt">{entry.content}</p>
            <EntryTags entry={entry} />
          </div>
          <footer><span>🌍 所有人可见</span><Link href={`/?entry=${entry.id}`}>在地图中阅读</Link></footer>
        </article>
      ))}</div> : null}

      {!entries.length && !loading && !error ? (
        <GuidedEmptyState
          eyebrow="A STORY BEGINS WITH A PLACE"
          title={isOwnProfile ? "你的公开故事正在等待第一个地点。" : "这个人还没有分享公开故事。"}
          description={isOwnProfile ? "创建故事并选择“所有人可见”，它就会来到你的公开主页。" : "当新的公开故事写下时，它会出现在这里。"}
          compact
        >
          {isOwnProfile ? <Link className="primary-button nav-link" href="/">创建公开故事</Link> : null}
        </GuidedEmptyState>
      ) : null}
      {loading && !entries.length ? <div className="content-state" role="status">正在读取公开故事…</div> : null}
      {hasMore && !error ? (
        <button className="secondary-button public-story-more" disabled={loading} type="button" onClick={() => void load(true)}>
          {loading ? "正在加载…" : `加载更多（每页 ${PUBLIC_PROFILE_STORY_PAGE_SIZE} 条）`}
        </button>
      ) : null}
    </section>
  );
}
