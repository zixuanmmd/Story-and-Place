"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { useAuth } from "@/components/providers/auth-provider";
import { joinPublicGroup, listVisibleGroups } from "@/lib/data/groups";
import { getFriendlyError } from "@/lib/errors";
import type { Group, GroupInvitation, GroupMember } from "@/types/database";

function GroupCard({ group, role, onJoin }: { group: Group; role?: string; onJoin?: () => void }) {
  return (
    <article className="group-card">
      <div className="group-avatar" aria-hidden="true">
        {group.avatar_url ? (
          <span className="remote-avatar" style={{ backgroundImage: `url("${group.avatar_url.replaceAll('"', "%22")}")` }} />
        ) : group.name.slice(0, 1)}
      </div>
      <div>
        <div className="record-card-topline">
          <span className={`visibility-badge visibility-badge--${group.visibility}`}>
            {group.visibility === "public" ? "公开群组" : "私密群组"}
          </span>
          {role ? <span>{role === "owner" ? "群主" : role === "admin" ? "管理员" : "成员"}</span> : null}
        </div>
        <h2><Link href={`/groups/${group.slug}`}>{group.name}</Link></h2>
        <p>{group.description || "这个群组还没有写下简介。"}</p>
        <div className="record-actions">
          <Link className="secondary-button nav-link" href={`/groups/${group.slug}`}>进入群组</Link>
          {onJoin ? <button className="quiet-button" type="button" onClick={onJoin}>加入</button> : null}
        </div>
      </div>
    </article>
  );
}

export function GroupsIndex() {
  const { user } = useAuth();
  return <GroupsIndexForScope key={user?.id ?? "anon"} />;
}

function GroupsIndexForScope() {
  const { user, loading: authLoading, configured } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [memberships, setMemberships] = useState<GroupMember[]>([]);
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!configured || authLoading) return;
    setLoading(true);
    try {
      const result = await listVisibleGroups(user?.id ?? null);
      setGroups(result.groups.slice(0, 100));
      setHasMore(result.truncated);
      setMemberships(result.memberships);
      setInvitations(result.invitations);
    } catch (error) {
      setStatus(getFriendlyError(error, "群组暂时无法加载。请确认最新 migration 已执行。"));
    } finally {
      setLoading(false);
    }
  }, [authLoading, configured, user]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const membershipMap = useMemo(
    () => new Map(memberships.map((membership) => [membership.group_id, membership])),
    [memberships],
  );
  const joined = groups.filter((group) => membershipMap.has(group.id));
  const discover = groups.filter((group) => group.visibility === "public" && !membershipMap.has(group.id) && !group.archived_at);

  const join = async (group: Group) => {
    if (!user) {
      window.location.assign(`/login?next=${encodeURIComponent(`/groups/${group.slug}`)}`);
      return;
    }
    try {
      await joinPublicGroup(group.id);
      setStatus(`已加入“${group.name}”。`);
      await load();
    } catch (error) {
      setStatus(getFriendlyError(error, "加入群组失败。"));
    }
  };
  const loadMore = async () => {
    setLoading(true);
    try {
      const result = await listVisibleGroups(user?.id ?? null, groups.length);
      setGroups((current) => [...current, ...result.groups]);
      setMemberships(result.memberships);
      setInvitations(result.invitations);
      setHasMore(result.truncated);
    } catch (error) {
      setStatus(getFriendlyError(error, "更多群组加载失败。"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="content-page">
      <AppHeader />
      <div className="content-container">
        <div className="page-heading">
          <div><p className="eyebrow">SHARED PLACES</p><h1>群组</h1><p>与一小群人，共同保存只属于彼此的地点故事。</p></div>
          <div className="record-actions">
            {user ? <Link className="secondary-button nav-link" href="/groups/invitations">邀请 {invitations.length ? `(${invitations.length})` : ""}</Link> : null}
            <Link className="primary-button nav-link" href={user ? "/groups/new" : "/login?next=%2Fgroups%2Fnew"}>创建群组</Link>
          </div>
        </div>
        {status ? <div className="inline-error" role="status">{status}</div> : null}
        {loading ? <div className="content-state" role="status">正在读取群组…</div> : (
          <>
            {user ? <section className="content-section"><h2>我加入的群组</h2><div className="group-grid">{joined.length ? joined.map((group) => <GroupCard key={group.id} group={group} role={membershipMap.get(group.id)?.role} />) : <div className="small-empty">你还没有加入群组。</div>}</div></section> : null}
            <section className="content-section"><h2>可加入的公开群组</h2><div className="group-grid">{discover.length ? discover.map((group) => <GroupCard key={group.id} group={group} onJoin={() => void join(group)} />) : <div className="small-empty">暂时没有可加入的公开群组。</div>}</div></section>
            {hasMore ? <button className="secondary-button feed-more" disabled={loading} type="button" onClick={() => void loadMore()}>{loading ? "加载中…" : "加载更多群组"}</button> : null}
          </>
        )}
      </div>
    </main>
  );
}
