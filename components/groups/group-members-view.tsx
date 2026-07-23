"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { useAuth } from "@/components/providers/auth-provider";
import {
  changeGroupMemberRole,
  getGroupBySlug,
  getMyGroupRole,
  inviteGroupMember,
  listGroupMembers,
  removeGroupMember,
  searchProfiles,
  transferGroupOwnership,
  type GroupMemberWithProfile,
} from "@/lib/data/groups";
import { getFriendlyError } from "@/lib/errors";
import type { Group, Profile } from "@/types/database";

export function GroupMembersView({ slug }: { slug: string }) {
  const { user } = useAuth();
  return <GroupMembersForScope key={`${user?.id ?? "anon"}:${slug}`} slug={slug} />;
}

function GroupMembersForScope({ slug }: { slug: string }) {
  const { user, loading: authLoading } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [role, setRole] = useState<"owner" | "admin" | "member" | null>(null);
  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Array<Pick<Profile, "id" | "display_name" | "avatar_url">>>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async () => {
    if (authLoading) return;
    try {
      const nextGroup = await getGroupBySlug(slug);
      if (!nextGroup) throw new Error("not-found");
      const nextRole = await getMyGroupRole(nextGroup.id, user?.id ?? null);
      if (!nextRole) throw new Error("forbidden");
      const page = await listGroupMembers(nextGroup.id, 30);
      setGroup(nextGroup);
      setRole(nextRole);
      setMembers(page.members);
      setHasMore(page.hasMore);
    } catch (error) {
      setStatus(getFriendlyError(error, "你没有权限查看这个群组的成员。"));
    }
  }, [authLoading, slug, user]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const findPeople = async () => {
    if (search.trim().length < 2) {
      setStatus("请输入至少两个字搜索显示名。");
      return;
    }
    setBusy(true);
    try {
      setResults(await searchProfiles(search.trim()));
    } catch (error) {
      setStatus(getFriendlyError(error, "用户搜索失败。"));
    } finally {
      setBusy(false);
    }
  };
  const invite = async (profile: Pick<Profile, "id" | "display_name">) => {
    if (!group) return;
    setBusy(true);
    try {
      await inviteGroupMember(group.id, profile.id);
      setStatus(`已向“${profile.display_name}”发送邀请。`);
    } catch (error) {
      setStatus(getFriendlyError(error, "邀请失败，对方可能已经是成员或已有待处理邀请。"));
    } finally {
      setBusy(false);
    }
  };
  const act = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    try {
      await action();
      setStatus(success);
      await load();
    } catch (error) {
      setStatus(getFriendlyError(error, "成员操作失败，权限可能已发生变化。"));
    } finally {
      setBusy(false);
    }
  };
  const loadMore = async () => {
    if (!group) return;
    const cursor = members.at(-1)?.joined_at;
    if (!cursor) return;
    setBusy(true);
    try {
      const page = await listGroupMembers(group.id, 30, cursor);
      setMembers((current) => [...current, ...page.members]);
      setHasMore(page.hasMore);
    } catch (error) {
      setStatus(getFriendlyError(error, "更多成员加载失败。"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="content-page">
      <AppHeader />
      <div className="content-container">
        <div className="page-heading"><div><p className="eyebrow">MEMBERS</p><h1>{group?.name ?? "群组"}成员</h1><p>角色变更与移除由数据库权限规则强制执行。</p></div><Link href={`/groups/${slug}`}>返回群组</Link></div>
        {status ? <div className="inline-error" role="status">{status}</div> : null}
        {group && (role === "owner" || role === "admin") ? (
          <section className="content-section invite-panel">
            <h2>邀请成员</h2>
            <div className="inline-form"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="按显示名搜索" /><button className="secondary-button" disabled={busy} type="button" onClick={() => void findPeople()}>搜索</button></div>
            {results.map((profile) => <button className="profile-search-result" key={profile.id} type="button" disabled={busy} onClick={() => void invite(profile)}><span>{profile.display_name}</span><small>{profile.id}</small></button>)}
          </section>
        ) : null}
        <section className="content-section">
          <h2>有效成员</h2>
          <div className="member-list">
            {members.map((member) => (
              <article key={member.user_id} className="member-row">
                <div><Link href={`/users/${member.user_id}`}><strong>{member.profiles?.display_name ?? "地图旅人"}</strong></Link><small>{member.role === "owner" ? "群主" : member.role === "admin" ? "管理员" : "成员"}</small></div>
                <div className="record-actions">
                  {role === "owner" && member.role !== "owner" ? (
                    <>
                      <button className="quiet-button" disabled={busy} type="button" onClick={() => void act(() => changeGroupMemberRole(group!.id, member.user_id, member.role === "admin" ? "member" : "admin"), "成员角色已更新。")}>{member.role === "admin" ? "设为成员" : "设为管理员"}</button>
                      <button className="quiet-button" disabled={busy} type="button" onClick={() => void act(() => transferGroupOwnership(group!.id, member.user_id), "群主已转移。")}>转移群主</button>
                    </>
                  ) : null}
                  {(role === "owner" || (role === "admin" && member.role === "member")) && member.user_id !== user?.id ? <button className="text-danger-button" disabled={busy} type="button" onClick={() => void act(() => removeGroupMember(group!.id, member.user_id), "成员已移出群组。")}>移除</button> : null}
                </div>
              </article>
            ))}
          </div>
          {hasMore ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void loadMore()}>{busy ? "加载中…" : "加载更多成员"}</button> : null}
        </section>
      </div>
    </main>
  );
}
