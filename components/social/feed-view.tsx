"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { useAuth } from "@/components/providers/auth-provider";
import { ProtectedState } from "@/components/layout/protected-state";
import { FEED_PAGE_SIZE, listFeed } from "@/lib/data/feed";
import { likeEntry, unlikeEntry } from "@/lib/data/social";
import { getFriendlyError } from "@/lib/errors";
import type { FeedEntry } from "@/types/database";
import { getCategoryLabel, PlaceCategoryIcon } from "@/lib/categories/registry";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function FeedLike({ entry, userId }: { entry: FeedEntry; userId: string }) {
  const [liked, setLiked] = useState(entry.user_liked);
  const [count, setCount] = useState(Number(entry.like_count));
  const [busy, setBusy] = useState(false);
  return <button type="button" aria-pressed={liked} disabled={busy} onClick={() => {
    setBusy(true);
    const next = !liked;
    setLiked(next);
    setCount((current) => Math.max(0, current + (next ? 1 : -1)));
    void (next ? likeEntry(entry.id, userId) : unlikeEntry(entry.id, userId))
      .catch(() => {
        setLiked(!next);
        setCount((current) => Math.max(0, current + (next ? -1 : 1)));
      })
      .finally(() => setBusy(false));
  }}>{liked ? "已喜欢" : "喜欢"} · {count}</button>;
}

export function FeedView() {
  const { user } = useAuth();
  return <FeedForScope key={user?.id ?? "anon"} />;
}

function FeedForScope() {
  const { user, loading: authLoading, configured } = useAuth();
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async (append = false) => {
    if (!user) return;
    setLoading(true);
    try {
      const last = append ? entries.at(-1) : undefined;
      const page = await listFeed(last ? { createdAt: last.created_at, id: last.id } : undefined);
      setEntries((current) => append ? [...current, ...page.entries] : page.entries);
      setHasMore(page.hasMore);
    } catch (error) {
      setStatus(getFriendlyError(error, "信息流暂时无法加载。请确认最新 migration 已执行。"));
    } finally {
      setLoading(false);
    }
  }, [entries, user]);
  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => void load(false), 0);
    return () => window.clearTimeout(timer);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`membership-feed-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "group_members",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const membership = payload.new as Record<string, unknown>;
          const groupId = typeof membership.group_id === "string" ? membership.group_id : null;
          if (!groupId) return;
          if (membership.status !== "active") {
            setEntries((current) => current.filter((entry) => entry.group_id !== groupId));
          } else {
            void load(false);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, user]);

  return (
    <main className="content-page">
      <AppHeader />
      <div className="feed-container">
        <div className="page-heading"><div><p className="eyebrow">RECENT STORIES</p><h1>信息流</h1><p>只按发布时间排列：关注者的公开记录、已加入群组的记录，以及你自己的记录。</p></div></div>
        {!configured ? <ProtectedState kind="config" /> : authLoading ? <ProtectedState kind="loading" /> : !user ? <ProtectedState kind="signed-out" /> : (
          <>
            {status ? <div className="inline-error" role="alert">{status}</div> : null}
            <div className="feed-list">
              {entries.map((entry) => (
                <article className="feed-card" key={entry.id}>
                  <header><Link href={`/users/${entry.user_id}`}><strong>{entry.author_display_name}</strong></Link><time>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.created_at))}</time></header>
                  <div className="feed-meta"><PlaceCategoryIcon category={entry.place_category_slug} /><span>{getCategoryLabel(entry.place_category_slug)}</span><span className={`visibility-badge visibility-badge--${entry.visibility}`}>{entry.visibility === "public" ? "公开" : entry.visibility === "private" ? "仅自己" : "群组"}</span>{entry.group_slug ? <Link href={`/groups/${entry.group_slug}`}>{entry.group_name}</Link> : null}</div>
                  <h2>{entry.title}</h2>
                  <p className="feed-place">{entry.time_label}{entry.place_name ? ` · ${entry.place_name}` : ""}</p>
                  <p className="feed-excerpt">{entry.content}</p>
                  <footer>{entry.visibility === "private" ? <span>仅自己可见，不开放互动</span> : <FeedLike entry={entry} userId={user.id} />}<span>评论 · {Number(entry.comment_count)}</span><Link href={`/?entry=${entry.id}`}>地图定位与详情</Link></footer>
                </article>
              ))}
            </div>
            {!entries.length && !loading ? <div className="content-state"><h2>信息流还是空的</h2><p>关注其他用户、加入群组，或先写下一条记录。</p><div className="record-actions"><Link href="/groups">发现群组</Link><Link href="/">前往地图</Link></div></div> : null}
            {loading ? <div className="content-state" role="status">正在读取故事…</div> : null}
            {hasMore ? <button className="secondary-button feed-more" disabled={loading} type="button" onClick={() => void load(true)}>加载更多（每页 {FEED_PAGE_SIZE} 条）</button> : null}
          </>
        )}
      </div>
    </main>
  );
}
