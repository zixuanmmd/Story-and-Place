"use client";

import type { EntryFilters, HomeVisibilityFilter } from "@/lib/data/filters";
import type { MapEntryWithProfile } from "@/types/database";
import { PLACE_CATEGORIES, PlaceCategoryIcon } from "@/lib/categories/registry";
import type { Group } from "@/types/database";

type FilterPanelProps = {
  filters: EntryFilters;
  entries: MapEntryWithProfile[];
  isLoggedIn: boolean;
  truncated?: boolean;
  onChange: (filters: EntryFilters) => void;
  onSelectEntry: (entry: MapEntryWithProfile) => void;
  onClose?: () => void;
  groupOptions?: Array<Pick<Group, "id" | "name">>;
};

const FILTER_OPTIONS: Array<{ value: HomeVisibilityFilter; label: string; loginOnly?: boolean }> = [
  { value: "all", label: "我能看到的全部故事" },
  { value: "public", label: "所有人可见" },
  { value: "group", label: "群组成员可见", loginOnly: true },
  { value: "mine", label: "我创建的故事", loginOnly: true },
  { value: "my-private", label: "我和受邀者可见", loginOnly: true },
];

export function FilterPanel({
  filters,
  entries,
  isLoggedIn,
  truncated = false,
  onChange,
  onSelectEntry,
  onClose,
  groupOptions = [],
}: FilterPanelProps) {
  const update = <Key extends keyof EntryFilters>(key: Key, value: EntryFilters[Key]) =>
    onChange({ ...filters, [key]: value });
  const toggleCategory = (slug: (typeof PLACE_CATEGORIES)[number]["slug"]) => {
    update(
      "categories",
      filters.categories.includes(slug)
        ? filters.categories.filter((item) => item !== slug)
        : [...filters.categories, slug],
    );
  };

  return (
    <div className="filter-content">
      <div className="form-title-row">
        <div>
          <p className="eyebrow">浏览故事</p>
          <h2>在时间里漫游</h2>
        </div>
        {onClose ? <button className="icon-button" type="button" onClick={onClose}>×</button> : null}
      </div>

      <div className="filter-controls">
        <label>
          <span>谁可以看到</span>
          <select
            className="form-control"
            value={filters.visibility}
            onChange={(event) => update("visibility", event.target.value as HomeVisibilityFilter)}
          >
            {FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} disabled={option.loginOnly && !isLoggedIn}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="category-filter">
          <legend>地点分类</legend>
          <div className="category-filter-scroll">
            {PLACE_CATEGORIES.map((category) => {
              const selected = filters.categories.includes(category.slug);
              return (
                <button
                  key={category.slug}
                  type="button"
                  aria-pressed={selected}
                  className={selected ? "category-filter-chip is-selected" : "category-filter-chip"}
                  onClick={() => toggleCategory(category.slug)}
                >
                  <PlaceCategoryIcon category={category.slug} size={15} />
                  {category.label}
                </button>
              );
            })}
          </div>
          {filters.categories.length ? (
            <button className="quiet-button" type="button" onClick={() => update("categories", [])}>
              清空分类
            </button>
          ) : null}
        </fieldset>

        {isLoggedIn && groupOptions.length ? (
          <label>
            <span>所属群组</span>
            <select
              className="form-control"
              value={filters.groupId}
              onChange={(event) => update("groupId", event.target.value)}
            >
              <option value="">全部群组</option>
              {groupOptions.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </label>
        ) : null}

        <label>
          <span>关键词</span>
          <input
            className="form-control"
            type="search"
            value={filters.keyword}
            placeholder="标题、内容、地点、时间"
            onChange={(event) => update("keyword", event.target.value)}
          />
        </label>

        <div className="date-filter-grid">
          <label><span>起始时间</span><input className="form-control" type="date" value={filters.startDate} onChange={(event) => update("startDate", event.target.value)} /></label>
          <label><span>结束时间</span><input className="form-control" type="date" value={filters.endDate} onChange={(event) => update("endDate", event.target.value)} /></label>
        </div>

        <label className="check-row">
          <input type="checkbox" checked={filters.withinMap} onChange={(event) => update("withinMap", event.target.checked)} />
          <span>只看地图当前视野</span>
        </label>
      </div>

      <div className="filter-results-heading">
        <span>当前结果</span><b>{entries.length}</b>
      </div>
      {truncated ? (
        <p className="query-limit-notice" role="status">
          当前只载入最近 500 条记录；搜索和筛选结果可能不完整。
        </p>
      ) : null}
      <div className="mini-entry-list">
        {entries.length ? entries.slice(0, 30).map((entry) => (
          <button key={entry.id} type="button" onClick={() => onSelectEntry(entry)}>
            <span className={`mini-marker mini-marker--${entry.visibility}`} aria-hidden="true">
              {entry.visibility === "private" ? "▣" : entry.visibility === "group" ? "◇" : "●"}
            </span>
            <span><strong>{entry.title}</strong><small>{entry.time_label}{entry.place_name ? ` · ${entry.place_name}` : ""}</small></span>
          </button>
        )) : (
          <div className="small-empty">没有符合条件的记录。</div>
        )}
        {entries.length > 30 ? <p className="result-note">列表仅展示前 30 条，地图仍显示全部结果。</p> : null}
      </div>
    </div>
  );
}
