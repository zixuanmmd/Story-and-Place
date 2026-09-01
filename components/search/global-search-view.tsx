"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { ProtectedState } from "@/components/layout/protected-state";
import { MapErrorBoundary } from "@/components/map/map-error-boundary";
import { GuidedEmptyState } from "@/components/ui/guided-empty-state";
import { useAuth } from "@/components/providers/auth-provider";
import { searchStoryAndPlace, GLOBAL_SEARCH_PAGE_SIZE } from "@/lib/data/search";
import { getFriendlyError, reportOperationalError } from "@/lib/errors";
import {
  DEFAULT_GLOBAL_SEARCH_FILTERS,
  SEARCH_RESULT_TYPES,
  globalSearchFiltersSchema,
  hasActiveSearch,
  parseNullableYear,
  type GlobalSearchFilters,
} from "@/lib/validation/search";
import type { GlobalSearchResult, GlobalSearchResultType } from "@/types/database";
import { bucketResultCount } from "@/lib/analytics/events";
import { recordProductEvent } from "@/lib/analytics/provider";

const SearchResultsMap = dynamic(
  () => import("./search-results-map").then((module) => module.SearchResultsMap),
  { ssr: false, loading: () => <div className="map-loading" role="status">正在展开搜索地图…</div> },
);

const TYPE_LABELS: Record<GlobalSearchResultType, string> = {
  entry: "地点故事",
  profile: "用户",
  route: "故事路线",
  tag: "标签",
  emotion: "情绪",
};

type SearchViewMode = "list" | "map";

function appendUnique(
  current: GlobalSearchResult[],
  incoming: GlobalSearchResult[],
) {
  const seen = new Set(current.map((result) => `${result.result_type}:${result.result_id}`));
  return [...current, ...incoming.filter((result) => {
    const key = `${result.result_type}:${result.result_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })];
}

function filtersToQueryString(filters: GlobalSearchFilters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.startYear !== null) params.set("from", String(filters.startYear));
  if (filters.endYear !== null) params.set("to", String(filters.endYear));
  if (filters.place) params.set("place", filters.place);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.emotion) params.set("emotion", filters.emotion);
  if (filters.authorId) params.set("author", filters.authorId);
  if (filters.contentTypes.length !== SEARCH_RESULT_TYPES.length) {
    params.set("types", filters.contentTypes.join(","));
  }
  return params.toString();
}

export function GlobalSearchView({ initialFilters }: { initialFilters: GlobalSearchFilters }) {
  const { dataScope } = useAuth();
  return <GlobalSearchForScope key={dataScope} initialFilters={initialFilters} />;
}

function GlobalSearchForScope({ initialFilters }: { initialFilters: GlobalSearchFilters }) {
  const router = useRouter();
  const { configured, loading: authLoading } = useAuth();
  const [draft, setDraft] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [view, setView] = useState<SearchViewMode>("list");
  const [loading, setLoading] = useState(hasActiveSearch(initialFilters));
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const pageRef = useRef(0);
  const resultsRef = useRef<GlobalSearchResult[]>([]);

  const load = useCallback(async (
    filters: GlobalSearchFilters,
    page = 0,
    append = false,
  ) => {
    if (!configured || authLoading || !hasActiveSearch(filters)) return;
    const requestId = ++requestSequence.current;
    setLoading(true);
    try {
      const nextPage = await searchStoryAndPlace(filters, page);
      if (requestSequence.current !== requestId) return;
      const nextResults = append
        ? appendUnique(resultsRef.current, nextPage.results)
        : nextPage.results;
      resultsRef.current = nextResults;
      pageRef.current = page;
      setResults(nextResults);
      setTotalCount(nextPage.totalCount);
      setHasMore(nextPage.hasMore);
      setError(null);
      if (page === 0) {
        recordProductEvent("search_used", {
          source: "global-search",
          result_count_bucket: bucketResultCount(nextPage.totalCount),
        });
      }
    } catch (loadError) {
      if (requestSequence.current !== requestId) return;
      reportOperationalError(loadError, "global-search");
      setError(getFriendlyError(loadError, "搜索暂时没有完成，请稍后重试。"));
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [authLoading, configured]);

  useEffect(() => {
    if (!hasActiveSearch(initialFilters)) return;
    const timer = window.setTimeout(() => void load(initialFilters), 0);
    return () => {
      requestSequence.current += 1;
      window.clearTimeout(timer);
    };
  }, [initialFilters, load]);

  const applyFilters = (filters: GlobalSearchFilters) => {
    setApplied(filters);
    resultsRef.current = [];
    setResults([]);
    setTotalCount(0);
    setHasMore(false);
    const query = filtersToQueryString(filters);
    router.replace(query ? `/search?${query}` : "/search", { scroll: false });
    void load(filters);
  };

  const submit = () => {
    const parsed = globalSearchFiltersSchema.safeParse(draft);
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? "请检查搜索条件。");
      return;
    }
    if (!hasActiveSearch(parsed.data)) {
      setValidationError("请输入关键词，或至少选择一个筛选条件。");
      return;
    }
    setValidationError(null);
    applyFilters(parsed.data);
  };

  const clear = () => {
    requestSequence.current += 1;
    setDraft(DEFAULT_GLOBAL_SEARCH_FILTERS);
    setApplied(DEFAULT_GLOBAL_SEARCH_FILTERS);
    resultsRef.current = [];
    setResults([]);
    setTotalCount(0);
    setHasMore(false);
    setError(null);
    setValidationError(null);
    router.replace("/search", { scroll: false });
  };

  const toggleType = (type: GlobalSearchResultType) => {
    setDraft((current) => ({
      ...current,
      contentTypes: current.contentTypes.includes(type)
        ? current.contentTypes.filter((candidate) => candidate !== type)
        : [...current.contentTypes, type],
    }));
  };

  const mapEntries = useMemo(
    () => results.filter((result) => result.result_type === "entry" && result.latitude !== null),
    [results],
  );

  const openResult = (result: GlobalSearchResult) => {
    recordProductEvent("search_result_opened", {
      source: view === "map" ? "search-map" : "search-list",
      result_type: result.result_type,
    });
    router.push(result.href);
  };

  return (
    <main className="content-page search-page">
      <AppHeader />
      <div className="content-container">
        <div className="page-heading">
          <div>
            <p className="eyebrow">SEARCH THE ATLAS</p>
            <h1>搜索故事世界</h1>
            <p>在地点、时间、标签、情绪、人物与路线之间，找到同一条线索。</p>
          </div>
          <Link className="quiet-button" href="/">返回地图</Link>
        </div>

        <section className="global-search-panel" aria-label="全局搜索条件">
          <div className="global-search-primary">
            <label htmlFor="global-search-query">关键词</label>
            <input
              id="global-search-query"
              type="search"
              maxLength={100}
              placeholder="例如：成都、孤独、大学、文学"
              value={draft.query ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, query: event.target.value || null }))}
              onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
            />
            <button className="primary-button" type="button" disabled={loading} onClick={submit}>
              {loading ? "搜索中…" : "搜索"}
            </button>
          </div>
          <details className="global-search-advanced">
            <summary>组合筛选</summary>
            <div className="global-search-filter-grid">
              <label>起始年份<input type="number" min={1} max={9999} value={draft.startYear ?? ""} onChange={(event) => setDraft((current) => ({ ...current, startYear: parseNullableYear(event.target.value) }))} /></label>
              <label>结束年份<input type="number" min={1} max={9999} value={draft.endYear ?? ""} onChange={(event) => setDraft((current) => ({ ...current, endYear: parseNullableYear(event.target.value) }))} /></label>
              <label>地点<input value={draft.place ?? ""} maxLength={100} placeholder="城市或地点名称" onChange={(event) => setDraft((current) => ({ ...current, place: event.target.value || null }))} /></label>
              <label>标签<input value={draft.tag ?? ""} maxLength={40} placeholder="#旅行" onChange={(event) => setDraft((current) => ({ ...current, tag: event.target.value.replace(/^#+/, "") || null }))} /></label>
              <label>情绪<input value={draft.emotion ?? ""} maxLength={40} placeholder="孤独 / loneliness" onChange={(event) => setDraft((current) => ({ ...current, emotion: event.target.value.replace(/^#+/, "") || null }))} /></label>
            </div>
            <fieldset className="global-search-types">
              <legend>内容类型</legend>
              {SEARCH_RESULT_TYPES.map((type) => (
                <label key={type}>
                  <input type="checkbox" checked={draft.contentTypes.includes(type)} onChange={() => toggleType(type)} />
                  {TYPE_LABELS[type]}
                </label>
              ))}
            </fieldset>
            {draft.authorId ? (
              <div className="search-author-filter">
                <span>已限定为指定作者</span>
                <button type="button" onClick={() => setDraft((current) => ({ ...current, authorId: null }))}>移除</button>
              </div>
            ) : null}
          </details>
          <div className="global-search-actions">
            <button className="quiet-button" type="button" onClick={clear}>清空条件</button>
            <span>搜索只返回你当前有权阅读且已经解锁的内容。</span>
          </div>
          {validationError ? <p className="field-error" role="alert">{validationError}</p> : null}
        </section>

        {!configured ? <ProtectedState kind="config" /> : authLoading ? <ProtectedState kind="loading" /> : !hasActiveSearch(applied) ? (
          <GuidedEmptyState
            eyebrow="BEGIN WITH A CLUE"
            title="从一条线索开始。"
            description="输入至少两个字符，或按年份、地点、标签和情绪组合筛选。私密故事与未解锁胶囊不会出现在无权用户的结果或数量里。"
          />
        ) : (
          <section className="global-search-results" aria-live="polite">
            <div className="search-results-heading">
              <div><p className="eyebrow">RESULTS</p><h2>{loading && !results.length ? "正在寻找…" : `找到 ${totalCount} 条线索`}</h2></div>
              <div className="search-view-switch" aria-label="结果视图">
                <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>列表</button>
                <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>地图</button>
              </div>
            </div>
            {error ? <div className="inline-error" role="alert">{error}<button type="button" onClick={() => void load(applied, pageRef.current)}>重试</button></div> : null}
            {view === "map" ? (
              mapEntries.length ? (
                <div className="search-map-shell">
                  <MapErrorBoundary>
                    <SearchResultsMap results={results} onSelect={openResult} onTileError={() => setMapError("地图瓦片暂时无法加载，请检查网络后重试。")} />
                  </MapErrorBoundary>
                  {mapError ? <div className="inline-error" role="alert">{mapError}</div> : null}
                  <p>地图显示当前已加载结果中的 {mapEntries.length} 个地点故事。</p>
                </div>
              ) : <div className="content-state"><h3>当前结果没有可绘制的地点</h3><p>切回列表，可以继续查看用户、标签、情绪和故事路线。</p></div>
            ) : (
              <div className="search-result-list">
                {results.map((result) => (
                  <article key={`${result.result_type}:${result.result_id}`} className="search-result-card">
                    <div>
                      <span className={`search-result-type search-result-type--${result.result_type}`}>{TYPE_LABELS[result.result_type]}</span>
                      {result.visibility ? <span>{result.visibility === "public" ? "所有人可读" : result.visibility === "group" ? "群组可读" : "仅相关的人可读"}</span> : null}
                    </div>
                    <h3><Link href={result.href} onClick={() => recordProductEvent("search_result_opened", { source: "search-list", result_type: result.result_type })}>{result.title}</Link></h3>
                    <p className="search-result-subtitle">{result.subtitle}{result.time_label ? ` · ${result.time_label}` : ""}</p>
                    {result.excerpt ? <p>{result.excerpt}</p> : null}
                    <footer>
                      {result.author_id && result.author_name ? (
                        <span>由 <Link href={`/users/${result.author_id}`}>{result.author_name}</Link> 记录</span>
                      ) : <span />}
                      <div className="record-actions">
                        {result.author_id ? <button type="button" onClick={() => {
                          const next: GlobalSearchFilters = {
                            ...applied,
                            authorId: result.author_id,
                            query: result.result_type === "profile" ? null : applied.query,
                            contentTypes: result.result_type === "profile"
                              ? ["entry", "route"]
                              : applied.contentTypes,
                          };
                          setDraft(next);
                          applyFilters(next);
                        }}>只看此作者</button> : null}
                        <Link href={result.href} onClick={() => recordProductEvent("search_result_opened", { source: "search-list", result_type: result.result_type })}>打开</Link>
                      </div>
                    </footer>
                  </article>
                ))}
              </div>
            )}
            {!results.length && !loading && !error ? (
              <GuidedEmptyState eyebrow="NO MATCH YET" title="还没有找到相符的故事。" description="可以减少一个筛选条件，或者换一个地点、标签与年份组合。" />
            ) : null}
            {hasMore && !error ? (
              <button className="secondary-button search-load-more" type="button" disabled={loading} onClick={() => void load(applied, pageRef.current + 1, true)}>
                {loading ? "加载中…" : `加载更多（每页 ${GLOBAL_SEARCH_PAGE_SIZE} 条）`}
              </button>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
