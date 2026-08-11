"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { ProtectedState } from "@/components/layout/protected-state";
import { useAuth } from "@/components/providers/auth-provider";
import {
  ENTRY_EDITABLE_FIELD_LABELS,
  listMyEntryInvitations,
  respondEntryParticipantInvitation,
  type EntryInvitation,
} from "@/lib/data/entry-collaboration";
import { getFriendlyError, reportOperationalError } from "@/lib/errors";
import { useEntryRealtime } from "@/hooks/use-entry-realtime";
import { getEntryById } from "@/lib/data/entries";

export function EntryInvitationsView() {
  const { user } = useAuth();
  return <EntryInvitationsForUser key={user?.id ?? "anon"} />;
}

function EntryInvitationsForUser() {
  const { user, loading, configured } = useAuth();
  const [invitations, setInvitations] = useState<EntryInvitation[]>([]);
  const [queryLoading, setQueryLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [acceptedEntryId, setAcceptedEntryId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!user) {
      setInvitations([]);
      setQueryLoading(false);
      return;
    }
    setQueryLoading(true);
    try {
      setInvitations(await listMyEntryInvitations(user.id));
    } catch (error) {
      setStatus(getFriendlyError(error, "共同经历邀请暂时无法读取。"));
    } finally {
      setQueryLoading(false);
    }
  }, [user]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEntryRealtime({
    enabled: Boolean(user && configured),
    scopeKey: `entry-invitations-${user?.id ?? "anon"}`,
    includeCollaboration: true,
    onChange: load,
  });

  const respond = async (entryId: string, accept: boolean) => {
    setBusy(entryId);
    try {
      await respondEntryParticipantInvitation(entryId, accept);
      setInvitations((current) =>
        current.filter((invitation) => invitation.entry_id !== entryId)
      );
      let acceptedEntryAvailable = false;
      let accessCheckFailed = false;
      if (accept) {
        try {
          acceptedEntryAvailable = Boolean(await getEntryById(entryId));
        } catch (accessError) {
          accessCheckFailed = true;
          reportOperationalError(accessError, "check-accepted-entry-access");
        }
      }
      setAcceptedEntryId(acceptedEntryAvailable ? entryId : null);
      setStatus(
        accept
          ? accessCheckFailed
            ? "邀请已接受，但暂时无法确认故事是否已经解锁。请稍后刷新。"
            : acceptedEntryAvailable
            ? "已接受共同经历邀请。"
            : "已接受邀请；如果这是尚未解锁的时间胶囊，需要等待解锁后才能打开。"
          : "已拒绝邀请。",
      );
    } catch (error) {
      setStatus(getFriendlyError(
        error,
        "邀请处理失败。群组记录要求你仍是有效群组成员。",
      ));
    } finally {
      setBusy(null);
    }
  };

  let content;
  if (!configured) content = <ProtectedState kind="config" />;
  else if (loading || queryLoading) content = <ProtectedState kind="loading" />;
  else if (!user) {
    content = (
      <ProtectedState
        kind="signed-out"
        nextPath="/entry-invitations"
        signedOutDescription="登录后可以处理共同经历邀请。"
      />
    );
  } else if (invitations.length) {
    content = (
      <div className="records-list">
        {invitations.map((invitation) => (
          <article className="record-card" key={invitation.entry_id}>
            <div>
              <p className="eyebrow">共同经历邀请</p>
              <h2>{invitation.inviter?.display_name ?? "一位地图旅人"}邀请你共同记录一段经历</h2>
              <p>
                接受前不会显示私密事件内容。接受后可编辑：
                {invitation.editable_fields
                  .map((field) => ENTRY_EDITABLE_FIELD_LABELS[field])
                  .join("、") || "无字段（仅共同经历者）"}
              </p>
            </div>
            <div className="record-actions">
              <button
                className="primary-button"
                type="button"
                disabled={busy === invitation.entry_id}
                onClick={() => void respond(invitation.entry_id, true)}
              >
                接受
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={busy === invitation.entry_id}
                onClick={() => void respond(invitation.entry_id, false)}
              >
                拒绝
              </button>
            </div>
          </article>
        ))}
      </div>
    );
  } else {
    content = <div className="content-state"><h2>没有待处理邀请</h2></div>;
  }

  return (
    <main className="content-page">
      <AppHeader />
      <div className="content-container">
        <div className="page-heading">
          <div>
            <p className="eyebrow">SHARED EXPERIENCES</p>
            <h1>共同经历邀请</h1>
            <p>普通私密事件在接受后开放；未解锁的时间胶囊仍需等待。</p>
          </div>
        </div>
        {status ? <div className="inline-success" role="status">{status}</div> : null}
        {acceptedEntryId ? (
          <p><Link href={`/?entry=${acceptedEntryId}`}>打开刚接受的共同经历</Link></p>
        ) : null}
        {content}
      </div>
    </main>
  );
}
