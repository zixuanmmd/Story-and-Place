"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { useAuth } from "@/components/providers/auth-provider";
import { listMyInvitations, respondGroupInvitation, type InvitationWithGroup } from "@/lib/data/groups";
import { getFriendlyError } from "@/lib/errors";
import { mergeUniqueById } from "@/lib/data/keyset-pagination";

export function GroupInvitationsView() {
  const { user } = useAuth();
  return <GroupInvitationsForScope key={user?.id ?? "anon"} />;
}

function GroupInvitationsForScope() {
  const { user, loading: authLoading } = useAuth();
  const [invitations, setInvitations] = useState<InvitationWithGroup[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const load = useCallback(async () => {
    if (!user || authLoading) return;
    try {
      const result = await listMyInvitations(user.id);
      setInvitations(result.invitations);
      setHasMore(result.hasMore);
    } catch (error) {
      setStatus(getFriendlyError(error, "邀请暂时无法加载。"));
    }
  }, [authLoading, user]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const respond = async (id: string, accept: boolean) => {
    setBusyId(id);
    try {
      await respondGroupInvitation(id, accept);
      setInvitations((current) => current.filter((invitation) => invitation.id !== id));
      setStatus(accept ? "已接受邀请。" : "已拒绝邀请。");
    } catch (error) {
      setStatus(getFriendlyError(error, "邀请可能已过期或处理过。"));
    } finally {
      setBusyId(null);
    }
  };
  const loadMore = async () => {
    if (!user) return;
    const lastInvitation = invitations.at(-1);
    if (!lastInvitation) return;
    setBusyId("more");
    try {
      const page = await listMyInvitations(user.id, {
        timestamp: lastInvitation.created_at,
        id: lastInvitation.id,
      });
      setInvitations((current) =>
        mergeUniqueById(current, page.invitations),
      );
      setHasMore(page.hasMore);
    } catch (error) {
      setStatus(getFriendlyError(error, "更多邀请加载失败。"));
    } finally {
      setBusyId(null);
    }
  };
  return (
    <main className="content-page">
      <AppHeader />
      <div className="content-container">
        <div className="page-heading"><div><p className="eyebrow">INVITATIONS</p><h1>群组邀请</h1><p>接受后才能阅读仅限邀请加入的群组内容。</p></div><Link href="/groups">返回群组</Link></div>
        {status ? <div className="inline-error" role="status">{status}</div> : null}
        {!user && !authLoading ? <div className="content-state"><p>登录后查看群组邀请。</p><Link href="/login?next=%2Fgroups%2Finvitations">登录</Link></div> : invitations.length ? (
          <div className="records-list">{invitations.map((invitation) => <article className="record-card" key={invitation.id}><div><p className="eyebrow">{invitation.groups?.visibility === "private" ? "仅限邀请加入" : "可以直接加入"}</p><h2>{invitation.groups?.name ?? "群组"}</h2><p>有效期至 {new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(invitation.expires_at))}</p></div><div className="record-actions"><button className="primary-button" disabled={busyId === invitation.id} type="button" onClick={() => void respond(invitation.id, true)}>接受</button><button className="secondary-button" disabled={busyId === invitation.id} type="button" onClick={() => void respond(invitation.id, false)}>拒绝</button></div></article>)}</div>
        ) : <div className="content-state"><h2>没有待处理邀请</h2><p>新的群组邀请会出现在这里。</p></div>}
        {hasMore ? <button className="secondary-button feed-more" type="button" disabled={Boolean(busyId)} onClick={() => void loadMore()}>加载更多邀请</button> : null}
      </div>
    </main>
  );
}
