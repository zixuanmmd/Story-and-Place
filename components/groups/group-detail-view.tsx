"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { useAuth } from "@/components/providers/auth-provider";
import {
  getGroupBySlug,
  getMyGroupRole,
  joinPublicGroup,
  leaveGroup,
  listGroupEntries,
  listGroupMembers,
} from "@/lib/data/groups";
import { getFriendlyError } from "@/lib/errors";
import type { Group, GroupRole, MapEntryWithProfile } from "@/types/database";
import { ReportDialog } from "@/components/social/report-dialog";
import { getCategoryLabel, PlaceCategoryIcon } from "@/lib/categories/registry";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { GroupStoryRoutes } from "@/components/routes/group-story-routes";
import { mergeUniqueById } from "@/lib/data/keyset-pagination";
import { useEntryRealtime } from "@/hooks/use-entry-realtime";
import { GROUP_DISCOVERY_PRESENTATION } from "@/lib/privacy/presentation";

const GroupMap = dynamic(
  () => import("@/components/map/map-canvas").then((module) => module.MapCanvas),
  { ssr: false, loading: () => <div className="map-loading">正在展开群组地图…</div> },
);

export function GroupDetailView({ slug }: { slug: string }) {
  const { dataScope } = useAuth();
  return <GroupDetailForScope key={`${dataScope}:${slug}`} slug={slug} />;
}

function GroupDetailForScope({ slug }: { slug: string }) {
  const router = useRouter();
  const { user, loading: authLoading, dataScope } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [role, setRole] = useState<GroupRole | null>(null);
  const [entries, setEntries] = useState<MapEntryWithProfile[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [hasMoreEntries, setHasMoreEntries] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    try {
      const nextGroup = await getGroupBySlug(slug);
      if (!nextGroup) {
        setGroup(null);
        setStatus("群组不存在，或你没有权限查看。");
        return;
      }
      const nextRole = await getMyGroupRole(nextGroup.id, user?.id ?? null);
      setGroup(nextGroup);
      setRole(nextRole);
      if (nextRole) {
        const [entryPage, memberPage] = await Promise.all([
          listGroupEntries(nextGroup.id, 20),
          listGroupMembers(nextGroup.id, 1),
        ]);
        setEntries(entryPage.entries);
        setHasMoreEntries(entryPage.hasMore);
        setMemberCount(memberPage.count);
      } else {
        setEntries([]);
        if (nextGroup.visibility === "public") {
          const memberPage = await listGroupMembers(nextGroup.id, 1);
          setMemberCount(memberPage.count);
        }
      }
    } catch (error) {
      setEntries([]);
      setStatus(getFriendlyError(error, "群组内容无法加载。"));
    } finally {
      setLoading(false);
    }
  }, [authLoading, slug, user]);
  useEntryRealtime({
    enabled: Boolean(group),
    scopeKey: `group-${slug}-${user?.id ?? "anon"}`,
    includeCollaboration: Boolean(user),
    onChange: load,
  });
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!user || !group) return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`membership-group-${group.id}-${user.id}`)
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
          if (membership.group_id !== group.id) return;
          if (membership.status !== "active") {
            setEntries([]);
            setSelectedId(null);
            setRole(null);
            setStatus("你的群组成员资格已失效，群组内容已立即移除。");
          } else {
            void load();
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [group, load, user]);

  const selected = useMemo(() => entries.find((entry) => entry.id === selectedId) ?? null, [entries, selectedId]);
  const join = async () => {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/groups/${slug}`)}`);
      return;
    }
    if (!group) return;
    try {
      await joinPublicGroup(group.id);
      setStatus("已加入群组。");
      await load();
    } catch (error) {
      setStatus(getFriendlyError(error, "加入群组失败。"));
    }
  };
  const leave = async () => {
    if (!group) return;
    setEntries([]);
    setSelectedId(null);
    try {
      await leaveGroup(group.id);
      setRole(null);
      setStatus("你已退出群组，群组内容已从当前页面移除。");
    } catch (error) {
      setStatus(getFriendlyError(error, "退出群组失败。群主需要先转移群主身份。"));
      await load();
    }
  };
  const loadMoreEntries = async () => {
    if (!group || !entries.length) return;
    const lastEntry = entries.at(-1);
    if (!lastEntry) return;
    setLoadingMore(true);
    try {
      const page = await listGroupEntries(group.id, 20, {
        timestamp: lastEntry.created_at,
        id: lastEntry.id,
      });
      setEntries((current) => mergeUniqueById(current, page.entries));
      setHasMoreEntries(page.hasMore);
    } catch (error) {
      setStatus(getFriendlyError(error, "更多群组记录加载失败。"));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <main className="content-page">
      <AppHeader />
      <div className="content-container">
        {loading ? <div className="content-state" role="status">正在读取群组…</div> : !group ? <div className="content-state"><h1>无法进入群组</h1><p>{status ?? "群组不存在或不可见。"}</p><Link href="/groups">返回群组列表</Link></div> : (
          <>
            <section className="group-hero">
              <div className="group-avatar group-avatar--large" aria-hidden="true">{group.name.slice(0, 1)}</div>
              <div>
                <p className="eyebrow">{GROUP_DISCOVERY_PRESENTATION[group.visibility].shortLabel}{group.archived_at ? " · 已归档" : ""}</p>
                <h1>{group.name}</h1>
                <p>{group.description || "这个群组还没有写下简介。"}</p>
                <span>{memberCount} 位成员{role ? ` · 你是${role === "owner" ? "群主" : role === "admin" ? "管理员" : "成员"}` : ""}</span>
              </div>
              <div className="record-actions">
                {!role && group.visibility === "public" && !group.archived_at ? <button className="primary-button" type="button" onClick={() => void join()}>加入群组</button> : null}
                {role && !group.archived_at ? <Link className="primary-button nav-link" href={`/?group=${group.id}`}>发布群组记录</Link> : null}
                {role && role !== "owner" ? <button className="secondary-button" type="button" onClick={() => void leave()}>退出群组</button> : null}
                {role ? <Link className="secondary-button nav-link" href={`/groups/${group.slug}/members`}>成员</Link> : null}
                {role ? <Link className="secondary-button nav-link" href={`/groups/${group.slug}/timeline`}>时间线</Link> : null}
                {role === "owner" || role === "admin" ? <Link className="secondary-button nav-link" href={`/groups/${group.slug}/settings`}>设置</Link> : null}
                <ReportDialog targetType="group" targetId={group.id} />
              </div>
            </section>
            {status ? <div className="inline-error" role="status">{status}</div> : null}
            {role ? (
              <>
                <div className="group-content-layout">
                  <section className="group-map-panel" aria-label="群组地图">
                    <GroupMap
                      key={dataScope}
                      scopeKey={dataScope}
                      entries={entries}
                      selectedEntryId={selectedId}
                      draftCoordinates={null}
                      onMapClick={() => setStatus("请使用“发布群组记录”按钮后，在首页地图选择位置。")}
                      onEntryClick={(entry) => setSelectedId(entry.id)}
                      onTileError={() => setStatus("地图瓦片加载失败，请检查网络。")}
                      onLocationError={setStatus}
                      onViewChange={() => undefined}
                    />
                  </section>
                  <section className="group-entry-list">
                    <h2>群组记录</h2>
                    {selected ? <article className="group-selected-story"><p className="eyebrow">地图中选中</p><h3>{selected.title}</h3><p>{selected.content}</p><Link href={`/?entry=${selected.id}`}>打开完整详情</Link></article> : null}
                    {entries.length ? entries.map((entry) => (
                      <button key={entry.id} type="button" className="group-entry-row" onClick={() => setSelectedId(entry.id)}>
                        <PlaceCategoryIcon category={entry.place_category_slug} />
                        <span><strong>{entry.title}</strong><small>{getCategoryLabel(entry.place_category_slug)} · {entry.time_label}</small></span>
                      </button>
                    )) : <div className="small-empty">群组里还没有地点故事。</div>}
                    {hasMoreEntries ? <button className="secondary-button" disabled={loadingMore} type="button" onClick={() => void loadMoreEntries()}>{loadingMore ? "加载中…" : "加载更多记录"}</button> : null}
                  </section>
                </div>
                <GroupStoryRoutes groupId={group.id} groupSlug={group.slug} />
              </>
            ) : (
              <div className="content-state"><h2>{group.visibility === "private" ? "这个群组只接受邀请加入" : "加入后阅读群组故事"}</h2><p>{group.visibility === "private" ? "接受邀请后，才能查看成员和群组故事。" : "群组故事只对有效成员开放，群组简介可由所有人查看。"}</p></div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
