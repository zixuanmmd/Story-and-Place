"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { ProtectedState } from "@/components/layout/protected-state";
import { useAuth } from "@/components/providers/auth-provider";
import { PLACE_CATEGORIES, PlaceCategoryIcon, getCategoryLabel } from "@/lib/categories/registry";
import { getGroupBySlug, getMyGroupRole } from "@/lib/data/groups";
import { listTimelineEntries, TIMELINE_PAGE_SIZE, type TimelineScope } from "@/lib/data/timeline";
import { getFriendlyError } from "@/lib/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  DEFAULT_TIMELINE_FILTERS,
  filterTimelineEntries,
  groupTimelineEntries,
  parseTimelineSearchParams,
  type TimelineFilters,
} from "@/lib/timeline/timeline";
import type { MapEntryWithProfile, PlaceCategorySlug } from "@/types/database";
import { useEntryRealtime } from "@/hooks/use-entry-realtime";

const TimelineMap = dynamic(
  () => import("@/components/map/map-canvas").then((module) => module.MapCanvas),
  { ssr: false, loading: () => <div className="map-loading">正在展开时间地图…</div> },
);

type TimelineViewProps =
  | { mode: "mine" }
  | { mode: "user"; targetUserId: string }
  | { mode: "group"; groupSlug: string };

export function TimelineView(props: TimelineViewProps) {
  const { user } = useAuth();
  const scopeSuffix = props.mode === "user"
    ? props.targetUserId
    : props.mode === "group"
      ? props.groupSlug
      : "mine";
  return (
    <TimelineForScope
      key={`${user?.id ?? "anon"}:${props.mode}:${scopeSuffix}`}
      {...props}
    />
  );
}

function TimelineForScope(props: TimelineViewProps) {
  const { user, loading: authLoading, configured } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [entries, setEntries] = useState<MapEntryWithProfile[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [scope, setScope] = useState<TimelineScope | null>(null);
  const [scopeTitle, setScopeTitle] = useState("故事时间线");
  const [filters, setFilters] = useState<TimelineFilters>(() =>
    parseTimelineSearchParams(searchParams),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routeSelection, setRouteSelection] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const mode = props.mode;
  const targetUserId = props.mode === "user" ? props.targetUserId : null;
  const groupSlug = props.mode === "group" ? props.groupSlug : null;
  const currentUserId = user?.id ?? null;

  useEffect(() => {
    let active = true;
    const resolve = async () => {
      if (authLoading) return;
      try {
        if (mode === "mine") {
          setScope(currentUserId ? { kind: "mine", userId: currentUserId } : null);
          setScopeTitle("我的故事时间线");
          return;
        }
        if (mode === "user" && targetUserId) {
          setScope({ kind: "user", userId: targetUserId });
          setScopeTitle("公开故事时间线");
          return;
        }
        if (!groupSlug) return;
        const group = await getGroupBySlug(groupSlug);
        if (!active) return;
        if (!group) {
          setStatus("群组不存在，或你没有权限查看。");
          setScope(null);
          return;
        }
        const role = await getMyGroupRole(group.id, currentUserId);
        if (!active) return;
        if (!role) {
          setStatus("只有当前有效成员可以查看群组时间线。");
          setScope(null);
          return;
        }
        setScope({ kind: "group", groupId: group.id });
        setScopeTitle(`${group.name} · 时间线`);
      } catch (error) {
        if (active) setStatus(getFriendlyError(error, "时间线范围暂时无法读取。"));
      }
    };
    void resolve();
    return () => {
      active = false;
    };
  }, [authLoading, currentUserId, groupSlug, mode, targetUserId]);

  const load = useCallback(async (nextPage = 0, append = false) => {
    if (!scope) {
      setLoading(false);
      return;
    }
    const requestId = ++requestSequence.current;
    setLoading(true);
    setStatus(null);
    try {
      const result = await listTimelineEntries(scope, nextPage, filters);
      if (requestSequence.current !== requestId) return;
      setEntries((current) => append ? [...current, ...result.entries] : result.entries);
      setHasMore(result.hasMore);
      setPage(nextPage);
    } catch (error) {
      if (requestSequence.current !== requestId) return;
      setStatus(getFriendlyError(error, "时间线加载失败，请重试。"));
      if (!append) setEntries([]);
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [filters, scope]);
  useEntryRealtime({
    enabled: configured && Boolean(scope),
    scopeKey: `timeline-${user?.id ?? "anon"}-${mode}-${groupSlug ?? targetUserId ?? "mine"}`,
    includeCollaboration: Boolean(user),
    onChange: () => {
      void load(0, false);
    },
  });

  useEffect(() => {
    if (!scope) return;
    const timer = window.setTimeout(() => void load(0, false), 0);
    return () => window.clearTimeout(timer);
  }, [load, scope]);

  useEffect(() => {
    if (!user || !scope) return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`membership-timeline-${user.id}-${scope.kind === "group" ? scope.groupId : "mine"}`)
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
          const changedGroupId = typeof membership.group_id === "string"
            ? membership.group_id
            : null;
          if (!changedGroupId) return;
          if (membership.status !== "active") {
            setEntries((current) => current.filter((entry) => entry.group_id !== changedGroupId));
            setSelectedId(null);
            if (scope.kind === "group" && scope.groupId === changedGroupId) {
              setStatus("你的群组成员资格已失效，群组时间线已立即清除。");
              setScope(null);
            }
          } else {
            void load(0, false);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, scope, user]);

  const visibleEntries = useMemo(
    () => filterTimelineEntries(entries, filters),
    [entries, filters],
  );
  const grouped = useMemo(() => groupTimelineEntries(visibleEntries), [visibleEntries]);
  const selectedEntry = useMemo(
    () => visibleEntries.find((entry) => entry.id === selectedId) ?? null,
    [selectedId, visibleEntries],
  );
  const authorOptions = useMemo(() => {
    const authors = new Map<string, string>();
    for (const entry of entries) {
      authors.set(entry.user_id, entry.profiles?.display_name ?? "未知作者");
    }
    return [...authors.entries()];
  }, [entries]);

  const selectEntry = useCallback((entry: MapEntryWithProfile) => {
    setSelectedId(entry.id);
    window.setTimeout(() => {
      cardRefs.current.get(entry.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }, []);
  const ignoreMapClick = useCallback(() => undefined, []);
  const ignoreViewChange = useCallback(() => undefined, []);
  const showStatus = useCallback((message: string) => setStatus(message), []);

  const updateFilters = (next: TimelineFilters) => {
    setFilters(next);
    const params = new URLSearchParams();
    if (next.keyword) params.set("q", next.keyword);
    if (next.visibility !== "all") params.set("visibility", next.visibility);
    if (next.categories.length) params.set("categories", next.categories.join(","));
    if (next.authorId) params.set("author", next.authorId);
    if (next.startYear !== null) params.set("start", String(next.startYear));
    if (next.endYear !== null) params.set("end", String(next.endYear));
    if (!next.includeUndated) params.set("undated", "0");
    if (next.order !== "desc") params.set("order", next.order);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const toggleCategory = (category: PlaceCategorySlug) => {
    updateFilters({
      ...filters,
      categories: filters.categories.includes(category)
        ? filters.categories.filter((value) => value !== category)
        : [...filters.categories, category],
    });
  };

  const startRoute = () => {
    sessionStorage.setItem(
      "story-route-selection-v1",
      JSON.stringify({ version: 1, entryIds: routeSelection }),
    );
    router.push("/routes/new");
  };

  const requiresLogin = props.mode === "mine";
  return (
    <main className="content-page timeline-page">
      <AppHeader />
      <div className="content-container">
        <div className="page-heading">
          <div>
            <p className="eyebrow">MEMORIES THROUGH TIME</p>
            <h1>{scopeTitle}</h1>
            <p>按事件发生时间重访地点；无法可靠判断年份的故事会留在“时间未定”。</p>
          </div>
          <div className="record-actions">
            {props.mode === "mine" ? <Link className="secondary-button nav-link" href="/routes">我的路线</Link> : null}
            {props.mode === "group" ? <Link className="secondary-button nav-link" href={`/groups/${props.groupSlug}`}>返回群组</Link> : null}
          </div>
        </div>

        {!configured ? <ProtectedState kind="config" /> : authLoading ? <ProtectedState kind="loading" /> : requiresLogin && !user ? <ProtectedState kind="signed-out" nextPath="/timeline" signedOutDescription="登录后可以按事件时间整理自己的公开、私密和群组故事。" /> : (
          <>
            <section className="timeline-filters" aria-label="时间线筛选">
              <label>关键词<input value={filters.keyword} maxLength={100} onChange={(event) => updateFilters({ ...filters, keyword: event.target.value })} /></label>
              <label>可见性<select value={filters.visibility} onChange={(event) => updateFilters({ ...filters, visibility: event.target.value as TimelineFilters["visibility"] })}><option value="all">全部</option><option value="public">公开</option>{props.mode === "mine" ? <option value="private">私密</option> : null}<option value="group">群组</option></select></label>
              <label>开始年份<input inputMode="numeric" value={filters.startYear ?? ""} onChange={(event) => updateFilters({ ...filters, startYear: event.target.value ? Number(event.target.value) : null })} /></label>
              <label>结束年份<input inputMode="numeric" value={filters.endYear ?? ""} onChange={(event) => updateFilters({ ...filters, endYear: event.target.value ? Number(event.target.value) : null })} /></label>
              <label>顺序<select value={filters.order} onChange={(event) => updateFilters({ ...filters, order: event.target.value as TimelineFilters["order"] })}><option value="desc">从近到远</option><option value="asc">从远到近</option></select></label>
              {props.mode === "group" ? <label>作者<select value={filters.authorId} onChange={(event) => updateFilters({ ...filters, authorId: event.target.value })}><option value="">全部作者</option>{authorOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label> : null}
              <label className="check-row"><input type="checkbox" checked={filters.includeUndated} onChange={(event) => updateFilters({ ...filters, includeUndated: event.target.checked })} />显示时间未定</label>
              <div className="timeline-category-filter" aria-label="地点分类">
                {PLACE_CATEGORIES.map((category) => <button key={category.slug} type="button" aria-pressed={filters.categories.includes(category.slug)} onClick={() => toggleCategory(category.slug)}><PlaceCategoryIcon category={category.slug} />{category.label}</button>)}
              </div>
              <button className="quiet-button" type="button" onClick={() => updateFilters(DEFAULT_TIMELINE_FILTERS)}>清空筛选</button>
            </section>

            {status ? <div className="inline-error" role="alert">{status}<button type="button" onClick={() => void load(0, false)}>重试</button></div> : null}

            <div className="timeline-layout">
              <section className="timeline-map-panel" aria-label="时间线地图">
                <TimelineMap
                  entries={visibleEntries}
                  selectedEntryId={selectedId}
                  draftCoordinates={null}
                  onMapClick={ignoreMapClick}
                  onEntryClick={selectEntry}
                  onTileError={() => showStatus("地图瓦片加载失败，请检查网络后重试。")}
                  onLocationError={showStatus}
                  onViewChange={ignoreViewChange}
                />
              </section>
              <section className="timeline-list" aria-label="按年份排列的故事">
                <div className="timeline-result-bar">
                  <span>当前筛选显示 {visibleEntries.length} 条</span>
                  {props.mode === "mine" && routeSelection.length ? <button className="primary-button" type="button" onClick={startRoute}>将 {routeSelection.length} 条连成路线</button> : null}
                </div>
                {selectedEntry ? <article className="timeline-selected-story"><p className="eyebrow">当前故事</p><h2>{selectedEntry.title}</h2><p>{selectedEntry.content}</p><div className="record-actions"><span>{selectedEntry.time_label}{selectedEntry.place_name ? ` · ${selectedEntry.place_name}` : ""}</span><Link href={`/?entry=${selectedEntry.id}`}>打开完整详情</Link></div></article> : null}
                {grouped.map((group) => (
                  <section className="timeline-year-group" key={group.key}>
                    <h2>{group.label}</h2>
                    <div className="timeline-year-stories">
                      {group.entries.map((entry) => (
                        <article
                          key={entry.id}
                          ref={(node) => {
                            if (node) cardRefs.current.set(entry.id, node);
                            else cardRefs.current.delete(entry.id);
                          }}
                          className={`timeline-card${selectedId === entry.id ? " timeline-card--selected" : ""}`}
                        >
                          <button className="timeline-card-main" type="button" onClick={() => selectEntry(entry)}>
                            <PlaceCategoryIcon category={entry.place_category_slug} />
                            <span>
                              <small>{entry.time_label} · {getCategoryLabel(entry.place_category_slug)}</small>
                              <strong>{entry.title}</strong>
                              <span>{entry.place_name || "未命名地点"} · {entry.profiles?.display_name ?? "未知作者"}</span>
                            </span>
                          </button>
                          <footer>
                            <span className={`visibility-badge visibility-badge--${entry.visibility}`}>{entry.visibility === "public" ? "公开" : entry.visibility === "private" ? "仅自己" : "群组"}</span>
                            <Link href={`/?entry=${entry.id}`}>打开详情</Link>
                            {props.mode === "mine" ? <label className="check-row"><input type="checkbox" checked={routeSelection.includes(entry.id)} onChange={(event) => setRouteSelection((current) => event.target.checked ? [...current, entry.id].slice(0, 200) : current.filter((id) => id !== entry.id))} />加入路线</label> : null}
                          </footer>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
                {!visibleEntries.length && !loading && !status ? <div className="small-empty">没有符合当前筛选的故事。</div> : null}
                {loading ? <div className="content-state" role="status">正在沿时间读取故事…</div> : null}
                {hasMore ? <button className="secondary-button" disabled={loading} type="button" onClick={() => void load(page + 1, true)}>加载更多（每页 {TIMELINE_PAGE_SIZE} 条）</button> : null}
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
