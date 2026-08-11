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
import type { MapEntryWithProfile } from "@/types/database";
import type { EntryDraft } from "@/types/database";
import { getCategoryLabel, PlaceCategoryIcon } from "@/lib/categories/registry";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useEntryRealtime } from "@/hooks/use-entry-realtime";
import {
  ENTRY_AUDIENCE_PRESENTATION,
  getEntryAudienceActionLabel,
} from "@/lib/privacy/presentation";
import { discardEntryDraft, listEntryDrafts } from "@/lib/data/entry-drafts";
import { getEntryDraftLabel } from "@/lib/validation/entry-draft";

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
  const [drafts, setDrafts] = useState<EntryDraft[]>([]);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<EntryDraft | null>(null);
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
  useEntryRealtime({
    enabled: configured && Boolean(user),
    scopeKey: `records-${user?.id ?? "anon"}`,
    includeCollaboration: true,
    onChange: reloadEntries,
  });

  const reloadDrafts = useCallback(async () => {
    if (!user || !configured) return;
    try {
      setDraftError(null);
      setDrafts(await listEntryDrafts());
    } catch (draftLoadError) {
      setDrafts([]);
      setDraftError(getFriendlyError(draftLoadError, "草稿加载失败，请稍后重试。"));
    }
  }, [configured, user]);

  useEffect(() => {
    if (!user || !configured) return;
    let active = true;
    void listEntryDrafts().then((nextDrafts) => {
      if (!active) return;
      setDraftError(null);
      setDrafts(nextDrafts);
    }).catch((draftLoadError) => {
      if (!active) return;
      setDrafts([]);
      setDraftError(getFriendlyError(draftLoadError, "草稿加载失败，请稍后重试。"));
    });
    return () => { active = false; };
  }, [configured, user]);

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
      setStatus(updated.visibility === "public" ? "这条故事现在所有人都可以看到。" : "这条故事现在只对你和已接受邀请的共同经历者开放。");
    } catch (toggleError) {
      setStatus(getFriendlyError(toggleError, "阅读范围更新失败。"));
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

  const discard = async () => {
    if (!discardTarget) return;
    setBusyId(discardTarget.id);
    try {
      await discardEntryDraft(discardTarget.id);
      setDrafts((current) => current.filter((draft) => draft.id !== discardTarget.id));
      setDiscardTarget(null);
      setStatus("草稿已删除。");
    } catch (discardError) {
      setStatus(getFriendlyError(discardError, "草稿删除失败，请稍后重试。"));
    } finally {
      setBusyId(null);
    }
  };

  let content;
  if (!configured) content = <ProtectedState kind="config" />;
  else if (authLoading) content = <ProtectedState kind="loading" />;
  else if (!user) content = <ProtectedState kind="signed-out" nextPath="/my-records" />;
  else {
    content = (
      <>
        <section className="draft-records" aria-labelledby="draft-records-title">
          <div className="section-heading-row">
            <div><p className="eyebrow">UNPUBLISHED</p><h2 id="draft-records-title">未发布草稿</h2></div>
            {draftError ? <button className="text-button" type="button" onClick={() => void reloadDrafts()}>重试</button> : null}
          </div>
          {draftError ? <div className="inline-error" role="alert">{draftError}</div> : null}
          {!draftError && drafts.length ? (
            <div className="draft-records-list">
              {drafts.map((draft) => {
                const resumeHref = draft.source_entry_id
                  ? `/?entry=${draft.source_entry_id}&edit=1&draft=${draft.id}`
                  : `/?draft=${draft.id}`;
                return (
                  <article className="draft-record-card" key={draft.id}>
                    <div><span className="visibility-badge">草稿</span><h3>{getEntryDraftLabel(draft)}</h3><time>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(draft.updated_at))} 自动保存</time></div>
                    <div className="record-actions"><Link className="secondary-button nav-link" href={resumeHref}>继续写作</Link><button className="text-danger-button" type="button" disabled={busyId === draft.id} onClick={() => setDiscardTarget(draft)}>删除草稿</button></div>
                  </article>
                );
              })}
            </div>
          ) : !draftError ? <p className="field-meta">还没有未发布草稿。开始写作后，内容会自动保存在这里。</p> : null}
        </section>

        <section className="records-toolbar" aria-label="记录筛选与排序">
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input type="search" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索标题、内容、地点或时间" />
          </label>
          <label><span>谁可以看到</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as MineFilter)}><option value="all">全部阅读范围</option><option value="public">所有人可见</option><option value="private">我和受邀者可见</option><option value="group">群组成员可见</option></select></label>
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
                    <span className={`visibility-badge visibility-badge--${entry.visibility}`}><b aria-hidden="true">{ENTRY_AUDIENCE_PRESENTATION[entry.visibility].glyph}</b>{ENTRY_AUDIENCE_PRESENTATION[entry.visibility].shortLabel}</span>
                    <time>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(entry.updated_at))} 更新</time>
                  </div>
                  <h2>{entry.title}</h2>
                  <p className="record-time"><PlaceCategoryIcon category={entry.place_category_slug} /> {getCategoryLabel(entry.place_category_slug)} · {entry.time_label}{entry.place_name ? ` · ${entry.place_name}` : ""}</p>
                  <p className="record-excerpt">{entry.content}</p>
                </div>
                <div className="record-actions">
                  <Link className="secondary-button nav-link" href={`/?entry=${entry.id}`}>地图定位</Link>
                  <Link className="secondary-button nav-link" href={`/?entry=${entry.id}&edit=1`}>编辑</Link>
                  <button className="secondary-button" type="button" disabled={busyId === entry.id} onClick={() => void toggle(entry)}>{busyId === entry.id ? "更新中…" : getEntryAudienceActionLabel(entry.visibility)}</button>
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
        <div className="page-heading"><div><p className="eyebrow">YOUR ARCHIVE</p><h1>我的记录</h1><p>管理你留在地图上的故事，以及每条故事的阅读范围。</p></div>{user ? <Link className="primary-button nav-link" href="/">＋ 新建记录</Link> : null}</div>
        {status ? <div className="inline-success" role="status">{status}</div> : null}
        {content}
      </div>
      <ConfirmDialog open={Boolean(deleteTarget)} title="删除这条记录？" description="删除后无法恢复，并会立即从地图中移除。" busy={Boolean(busyId)} onCancel={() => setDeleteTarget(null)} onConfirm={() => void remove()} />
      <ConfirmDialog open={Boolean(discardTarget)} title="删除这份草稿？" description="未发布内容将被清除且无法恢复，已经发布的原故事不受影响。" busy={Boolean(busyId)} onCancel={() => setDiscardTarget(null)} onConfirm={() => void discard()} />
    </main>
  );
}
