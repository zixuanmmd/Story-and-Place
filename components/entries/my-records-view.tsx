"use client";

import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { useAuth } from "@/components/providers/auth-provider";
import { ProtectedState } from "@/components/layout/protected-state";
import { ConfirmDialog } from "@/components/entries/confirm-dialog";
import {
  deleteEntry,
  listMyEntries,
  updateEntryVisibility,
} from "@/lib/data/entries";
import { getFriendlyError } from "@/lib/errors";
import { getAuthDataScope, type AuthDataScope } from "@/lib/data/scoped-query";
import { useScopedEntryQuery } from "@/hooks/use-scoped-entry-query";
import {
  filterAndSortMyEntries,
  type MineFilter,
  type MineSort,
} from "@/lib/data/my-records";
import { VISIBILITY_LABELS } from "@/lib/validation/entry";
import type { MapEntryWithProfile } from "@/types/database";
import { getCategoryLabel, PlaceCategoryIcon } from "@/lib/categories/registry";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function MyRecordsView() {
  const { user, loading: authLoading, configured } = useAuth();
  const scope = getAuthDataScope(user?.id);

  return (
    <MyRecordsForScope
      key={scope}
      scope={scope}
      user={user}
      authLoading={authLoading}
      configured={configured}
    />
  );
}

type MyRecordsForScopeProps = {
  scope: AuthDataScope;
  user: User | null;
  authLoading: boolean;
  configured: boolean;
};

function MyRecordsForScope({
  scope,
  user,
  authLoading,
  configured,
}: MyRecordsForScopeProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [visibility, setVisibility] = useState<MineFilter>("all");
  const [sort, setSort] = useState<MineSort>("updated");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MapEntryWithProfile | null>(null);
  const [revokedGroupIds, setRevokedGroupIds] = useState<string[]>([]);

  const loadMine = useCallback(
    () =>
      user
        ? listMyEntries(user.id)
        : Promise.resolve({ entries: [], truncated: false }),
    [user],
  );
  const entryQuery = useScopedEntryQuery<MapEntryWithProfile>({
    scope,
    enabled: configured && !authLoading && Boolean(user),
    load: loadMine,
    errorFallback: "我的记录加载失败，请稍后重试。",
  });
  const { entries, loading, error, reload: reloadEntries } = entryQuery;

  useEffect(() => {
    if (!user || !configured) return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`membership-records-${user.id}`)
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
            setRevokedGroupIds((current) => current.includes(groupId) ? current : [...current, groupId]);
            setDeleteTarget((current) => current?.group_id === groupId ? null : current);
          } else {
            setRevokedGroupIds((current) => current.filter((id) => id !== groupId));
            void reloadEntries();
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [configured, reloadEntries, user]);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(null), 4500);
    return () => window.clearTimeout(timer);
  }, [status]);

  const filtered = useMemo(() => {
    return filterAndSortMyEntries(
      entries.filter((entry) => !entry.group_id || !revokedGroupIds.includes(entry.group_id)),
      keyword,
      visibility,
      sort,
    );
  }, [entries, keyword, revokedGroupIds, sort, visibility]);

  const toggle = async (entry: MapEntryWithProfile) => {
    setBusyId(entry.id);
    try {
      const updated = await updateEntryVisibility(
        entry.id,
        entry.visibility === "public" ? "private" : "public",
      );
      entryQuery.upsert(updated);
      setStatus(updated.visibility === "public" ? "记录已设为公开。" : "记录已设为私密。 ");
    } catch (toggleError) {
      setStatus(getFriendlyError(toggleError, "可见性更新失败。"));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await deleteEntry(deleteTarget.id);
      entryQuery.remove(deleteTarget.id);
      setDeleteTarget(null);
      setStatus("记录已删除。 ");
    } catch (deleteError) {
      setStatus(getFriendlyError(deleteError, "删除失败，请稍后重试。"));
    } finally {
      setBusyId(null);
    }
  };

  let content;
  if (!configured) content = <ProtectedState kind="config" />;
  else if (authLoading) content = <ProtectedState kind="loading" />;
  else if (!user) content = <ProtectedState kind="signed-out" />;
  else {
    content = (
      <>
        <section className="records-toolbar" aria-label="记录筛选与排序">
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input type="search" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索标题、内容、地点或时间" />
          </label>
          <label><span>可见性</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as MineFilter)}><option value="all">全部</option><option value="public">公开</option><option value="private">私密</option><option value="group">群组</option></select></label>
          <label><span>排序</span><select value={sort} onChange={(event) => setSort(event.target.value as MineSort)}><option value="updated">最近更新</option><option value="occurred">事件时间</option></select></label>
        </section>

        {error ? <div className="inline-error" role="alert">{error}<button type="button" onClick={() => void entryQuery.reload()}>重试</button></div> : null}
        {entryQuery.truncated ? <div className="query-limit-notice" role="status">当前只展示最近 500 条记录；搜索、筛选和排序结果可能不完整。</div> : null}
        {loading ? <div className="content-state" role="status"><span className="loading-dot" />正在读取记录…</div> : filtered.length ? (
          <div className="records-list">
            {filtered.map((entry) => (
              <article className="record-card" key={entry.id}>
                <div className="record-main">
                  <div className="record-card-topline">
                    <span className={`visibility-badge visibility-badge--${entry.visibility}`}><b aria-hidden="true">{entry.visibility === "private" ? "▣" : entry.visibility === "group" ? "◇" : "◉"}</b>{VISIBILITY_LABELS[entry.visibility]}</span>
                    <time>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(entry.updated_at))} 更新</time>
                  </div>
                  <h2>{entry.title}</h2>
                  <p className="record-time"><PlaceCategoryIcon category={entry.place_category_slug} /> {getCategoryLabel(entry.place_category_slug)} · {entry.time_label}{entry.place_name ? ` · ${entry.place_name}` : ""}</p>
                  <p className="record-excerpt">{entry.content}</p>
                </div>
                <div className="record-actions">
                  <Link className="secondary-button nav-link" href={`/?entry=${entry.id}`}>地图定位</Link>
                  <Link className="secondary-button nav-link" href={`/?entry=${entry.id}&edit=1`}>编辑</Link>
                  <button className="secondary-button" type="button" disabled={busyId === entry.id} onClick={() => void toggle(entry)}>{busyId === entry.id ? "更新中…" : entry.visibility === "public" ? "设为私密" : "设为公开"}</button>
                  <button className="text-danger-button" type="button" disabled={busyId === entry.id} onClick={() => setDeleteTarget(entry)}>删除</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="content-state"><span className="state-symbol" aria-hidden="true">⌖</span><h2>{entries.length ? "没有符合条件的记录" : "地图上还没有你的故事"}</h2><p>{entries.length ? "换一个关键词或筛选条件试试。" : "去地图选择一处地点，写下第一条记录。"}</p><Link className="primary-button nav-link" href="/">前往地图</Link></div>
        )}
      </>
    );
  }

  return (
    <main className="content-page">
      <AppHeader />
      <div className="content-container">
        <div className="page-heading"><div><p className="eyebrow">YOUR ARCHIVE</p><h1>我的记录</h1><p>管理你留在地图上的全部公开与私密故事。</p></div>{user ? <Link className="primary-button nav-link" href="/">＋ 新建记录</Link> : null}</div>
        {status ? <div className="inline-success" role="status">{status}</div> : null}
        {content}
      </div>
      <ConfirmDialog open={Boolean(deleteTarget)} title="删除这条记录？" description="删除后无法恢复，并会立即从地图中移除。" busy={Boolean(busyId)} onCancel={() => setDeleteTarget(null)} onConfirm={() => void remove()} />
    </main>
  );
}
