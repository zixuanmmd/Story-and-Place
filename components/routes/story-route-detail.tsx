"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { useAuth } from "@/components/providers/auth-provider";
import { archiveStoryRoute, featureStoryRoute, getStoryRouteBySlug, listStoryRouteItems } from "@/lib/data/story-routes";
import { getMyGroupRole } from "@/lib/data/groups";
import { getFriendlyError } from "@/lib/errors";
import { getRouteShareUrl, shareRoute } from "@/lib/routes/share";
import { PlaceCategoryIcon, getCategoryLabel } from "@/lib/categories/registry";
import type { GroupRole, StoryRouteItemWithEntry, StoryRouteWithRelations } from "@/types/database";
import { useEntryRealtime } from "@/hooks/use-entry-realtime";

const RouteMap = dynamic(
  () => import("./story-route-map").then((module) => module.StoryRouteMap),
  { ssr: false, loading: () => <div className="map-loading">正在展开故事路线…</div> },
);

export function StoryRouteDetail({ shareSlug }: { shareSlug: string }) {
  const { user } = useAuth();
  return <StoryRouteDetailForScope key={`${user?.id ?? "anon"}:${shareSlug}`} shareSlug={shareSlug} />;
}

function StoryRouteDetailForScope({ shareSlug }: { shareSlug: string }) {
  const { user, loading: authLoading, configured } = useAuth();
  const [route, setRoute] = useState<StoryRouteWithRelations | null>(null);
  const [items, setItems] = useState<StoryRouteItemWithEntry[]>([]);
  const [role, setRole] = useState<GroupRole | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());

  const load = useCallback(async () => {
    if (authLoading || !configured) return;
    setLoading(true);
    setStatus(null);
    try {
      const nextRoute = await getStoryRouteBySlug(shareSlug);
      if (!nextRoute) {
        setRoute(null);
        setItems([]);
        setStatus("这条路线不存在，或你目前没有查看权限。");
        return;
      }
      const [nextItems, nextRole] = await Promise.all([
        listStoryRouteItems(nextRoute.id),
        nextRoute.group_id
          ? getMyGroupRole(nextRoute.group_id, user?.id ?? null)
          : Promise.resolve(null),
      ]);
      setRoute(nextRoute);
      setItems(nextItems);
      setRole(nextRole);
    } catch (error) {
      setRoute(null);
      setItems([]);
      setStatus(getFriendlyError(error, "故事路线加载失败，请稍后重试。"));
    } finally {
      setLoading(false);
    }
  }, [authLoading, configured, shareSlug, user]);
  useEntryRealtime({
    enabled: configured,
    scopeKey: `route-${shareSlug}-${user?.id ?? "anon"}`,
    includeCollaboration: Boolean(user),
    onChange: load,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );
  const select = useCallback((item: StoryRouteItemWithEntry) => {
    setSelectedId(item.id);
    window.setTimeout(() => nodeRefs.current.get(item.id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }, []);

  const share = async () => {
    if (!route) return;
    setBusy(true);
    try {
      const result = await shareRoute({
        title: route.title,
        text: route.description || "一条来自故事情感地图的故事路线",
        url: getRouteShareUrl(
          route.share_slug,
          process.env.NEXT_PUBLIC_SITE_URL,
          window.location.origin,
        ),
      }, navigator);
      setStatus(result === "copied" ? "分享链接已复制。" : result === "shared" ? "分享面板已打开。" : null);
    } catch {
      setStatus("暂时无法复制分享链接，请从浏览器地址栏复制。");
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!route || !window.confirm("确认归档这条路线吗？归档后不会删除原始地图记录。")) return;
    setBusy(true);
    try {
      await archiveStoryRoute(route.id);
      setStatus("路线已归档。");
      await load();
    } catch (error) {
      setStatus(getFriendlyError(error, "路线归档失败。"));
    } finally {
      setBusy(false);
    }
  };

  const feature = async () => {
    if (!route) return;
    setBusy(true);
    try {
      await featureStoryRoute(route.id, !route.featured_at);
      await load();
    } catch (error) {
      setStatus(getFriendlyError(error, "群组路线置顶操作失败。"));
    } finally {
      setBusy(false);
    }
  };

  const hiddenNodeCount = route ? Math.max(0, route.node_count - items.length) : 0;
  return (
    <main className="content-page route-detail-page">
      <AppHeader />
      <div className="content-container">
        {loading ? <div className="content-state" role="status">正在读取故事路线…</div> : !route ? (
          <div className="content-state">
            <h1>无法打开这条路线</h1>
            <p>{status ?? "链接可能失效，或这条路线不对你开放。"}</p>
            <div className="record-actions"><button type="button" onClick={() => void load()}>重试</button><Link href="/">返回地图</Link></div>
          </div>
        ) : (
          <>
            <section className="route-hero">
              <div>
                <p className="eyebrow">{route.visibility === "public" ? "PUBLIC STORY ROUTE" : route.visibility === "group" ? "GROUP STORY ROUTE" : "PRIVATE STORY ROUTE"}</p>
                <h1>{route.title}</h1>
                <p>{route.description || "作者没有为这条路线写说明。"}</p>
                <small>由 <Link href={`/users/${route.created_by}`}>{route.profiles?.display_name ?? "未知作者"}</Link> 整理 · {route.node_count} 个节点{route.groups ? ` · ${route.groups.name}` : ""}</small>
              </div>
              <div className="record-actions">
                {route.published_at ? <button className="primary-button" type="button" disabled={busy} onClick={() => void share()}>分享路线</button> : <span className="visibility-badge visibility-badge--private">草稿</span>}
                {user?.id === route.created_by && !route.archived_at ? <Link className="secondary-button nav-link" href={`/routes/${route.share_slug}/edit`}>编辑</Link> : null}
                {(user?.id === route.created_by || (route.visibility === "group" && (role === "owner" || role === "admin"))) && !route.archived_at ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void archive()}>归档</button> : null}
                {route.visibility === "group" && (role === "owner" || role === "admin") ? <button className="quiet-button" type="button" disabled={busy} aria-pressed={Boolean(route.featured_at)} onClick={() => void feature()}>{route.featured_at ? "取消置顶" : "群组置顶"}</button> : null}
              </div>
            </section>
            {route.archived_at ? <div className="inline-notice">这条路线已归档，只读保留。</div> : null}
            {route.privacy_downgraded_at ? <div className="inline-notice">路线中的公开记录权限发生变化，数据库已自动把这条路线改为私密，避免原地点继续被公开分享。</div> : null}
            {hiddenNodeCount ? <div className="inline-notice">有 {hiddenNodeCount} 个节点因记录删除或权限变化而暂时不可用，页面不会泄露其内容或位置。</div> : null}
            {status ? <div className="inline-error" role="status">{status}</div> : null}
            <div className="route-detail-layout">
              <section className="route-map-panel" aria-label="路线地图">
                <RouteMap items={items} selectedItemId={selectedId} onSelect={select} onTileError={() => setStatus("地图瓦片加载失败，请检查网络。")} />
              </section>
              <section className="route-node-list" aria-label="路线节点">
                {selected?.map_entries ? <article className="route-selected-node"><p className="eyebrow">地图中选中</p><h2>{selected.position}. {selected.map_entries.title}</h2><p>{selected.map_entries.content}</p></article> : null}
                {items.map((item) => item.map_entries ? (
                  <article
                    key={item.id}
                    ref={(node) => {
                      if (node) nodeRefs.current.set(item.id, node);
                      else nodeRefs.current.delete(item.id);
                    }}
                    className={`route-node-card${selectedId === item.id ? " route-node-card--selected" : ""}`}
                  >
                    <button type="button" onClick={() => select(item)}>
                      <span className="route-order-number">{item.position}</span>
                      <PlaceCategoryIcon category={item.map_entries.place_category_slug} />
                      <span><strong>{item.map_entries.title}</strong><small>{getCategoryLabel(item.map_entries.place_category_slug)} · {item.map_entries.time_label}</small></span>
                    </button>
                    {item.note ? <p>{item.note}</p> : null}
                    <Link href={`/?entry=${item.entry_id}`}>回到原始地图记录</Link>
                  </article>
                ) : null)}
                {!items.length ? <div className="small-empty">这条路线目前没有可读取的节点。</div> : null}
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
