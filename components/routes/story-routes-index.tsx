"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { ProtectedState } from "@/components/layout/protected-state";
import { useAuth } from "@/components/providers/auth-provider";
import { archiveStoryRoute, listMyStoryRoutes, STORY_ROUTE_PAGE_SIZE } from "@/lib/data/story-routes";
import { getFriendlyError } from "@/lib/errors";
import type { StoryRouteWithRelations } from "@/types/database";

export function StoryRoutesIndex() {
  const { user } = useAuth();
  return <StoryRoutesForScope key={user?.id ?? "anon"} />;
}

function StoryRoutesForScope() {
  const { user, loading: authLoading, configured } = useAuth();
  const [routes, setRoutes] = useState<StoryRouteWithRelations[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async (nextPage = 0, append = false) => {
    if (!user) return;
    setLoading(true);
    setStatus(null);
    try {
      const result = await listMyStoryRoutes(user.id, nextPage);
      setRoutes((current) => append ? [...current, ...result.routes] : result.routes);
      setHasMore(result.hasMore);
      setPage(nextPage);
    } catch (error) {
      if (!append) setRoutes([]);
      setStatus(getFriendlyError(error, "路线加载失败。若数据库功能尚未初始化，请执行最新 migration。"));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, user]);

  const archive = async (routeId: string) => {
    if (!window.confirm("确认归档这条路线吗？原始地图记录不会被删除。")) return;
    try {
      await archiveStoryRoute(routeId);
      await load();
    } catch (error) {
      setStatus(getFriendlyError(error, "路线归档失败。"));
    }
  };

  return (
    <main className="content-page routes-index-page">
      <AppHeader />
      <div className="content-container">
        <div className="page-heading">
          <div><p className="eyebrow">STORY ROUTES</p><h1>我的故事路线</h1><p>把已有地点故事按你的叙事顺序连接起来，原始记录保持独立。</p></div>
          <div className="record-actions"><Link className="secondary-button nav-link" href="/timeline">从时间线选择</Link><Link className="primary-button nav-link" href="/routes/new">创建路线</Link></div>
        </div>
        {!configured ? <ProtectedState kind="config" /> : authLoading ? <ProtectedState kind="loading" /> : !user ? <ProtectedState kind="signed-out" nextPath="/routes" signedOutDescription="登录后可以创建、编辑和分享自己的故事路线。" /> : (
          <>
            {status ? <div className="inline-error" role="alert">{status}<button type="button" onClick={() => void load()}>重试</button></div> : null}
            <div className="route-card-grid">
              {routes.map((route) => (
                <article key={route.id} className="route-card">
                  <header><span className={`visibility-badge visibility-badge--${route.visibility}`}>{route.visibility === "public" ? "公开路线" : route.visibility === "group" ? "群组路线" : "私密路线"}</span>{route.published_at ? <span>已发布</span> : <span>草稿</span>}</header>
                  <h2><Link href={`/routes/${route.share_slug}`}>{route.title}</Link></h2>
                  <p>{route.description || "还没有路线说明。"}</p>
                  <small>{route.node_count} 个节点{route.groups ? ` · ${route.groups.name}` : ""}{route.archived_at ? " · 已归档" : ""}</small>
                  {route.privacy_downgraded_at ? <div className="inline-notice">因节点权限变化，已自动转为私密。</div> : null}
                  <footer><Link href={`/routes/${route.share_slug}`}>查看</Link>{!route.archived_at ? <Link href={`/routes/${route.share_slug}/edit`}>编辑</Link> : null}{!route.archived_at ? <button type="button" onClick={() => void archive(route.id)}>归档</button> : null}</footer>
                </article>
              ))}
            </div>
            {!routes.length && !loading ? <div className="content-state"><h2>还没有故事路线</h2><p>先从自己的记录或群组时间线中选择地点，再决定叙事顺序。</p><Link className="primary-button nav-link" href="/routes/new">创建第一条路线</Link></div> : null}
            {loading ? <div className="content-state" role="status">正在读取路线…</div> : null}
            {hasMore ? <button className="secondary-button" disabled={loading} type="button" onClick={() => void load(page + 1, true)}>加载更多（每页 {STORY_ROUTE_PAGE_SIZE} 条）</button> : null}
          </>
        )}
      </div>
    </main>
  );
}
