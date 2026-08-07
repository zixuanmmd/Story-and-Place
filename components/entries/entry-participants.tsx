"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ALL_ENTRY_EDITABLE_FIELDS,
  ENTRY_EDITABLE_FIELD_LABELS,
  inviteEntryParticipant,
  listEntryParticipants,
  revokeEntryParticipant,
  updateEntryParticipantPermissions,
} from "@/lib/data/entry-collaboration";
import { searchProfiles } from "@/lib/data/groups";
import { getFriendlyError } from "@/lib/errors";
import type {
  EntryEditableField,
  EntryParticipantWithProfile,
} from "@/types/database";
import { useAuth } from "@/components/providers/auth-provider";
import { useEntryRealtime } from "@/hooks/use-entry-realtime";

export function EntryParticipants({ entryId }: { entryId: string }) {
  const { user } = useAuth();
  const [participants, setParticipants] = useState<EntryParticipantWithProfile[]>([]);
  const [draftFields, setDraftFields] = useState<Record<string, EntryEditableField[]>>({});
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<
    Array<{ id: string; display_name: string; avatar_url: string | null }>
  >([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await listEntryParticipants(entryId);
      setParticipants(next);
      setDraftFields(
        Object.fromEntries(next.map((participant) => [
          participant.user_id,
          participant.editable_fields,
        ])),
      );
    } catch (error) {
      setStatus(getFriendlyError(error, "共同经历者暂时无法读取。"));
    }
  }, [entryId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEntryRealtime({
    enabled: Boolean(user),
    scopeKey: `participants-${entryId}-${user?.id ?? "anon"}`,
    includeCollaboration: true,
    onChange: load,
  });

  const search = async () => {
    if (keyword.trim().length < 2) {
      setStatus("请输入至少两个字符。");
      return;
    }
    try {
      const found = await searchProfiles(keyword.trim());
      setResults(found.filter((profile) =>
        profile.id !== user?.id
        && !participants.some((participant) => participant.user_id === profile.id)
      ));
    } catch (error) {
      setStatus(getFriendlyError(error, "用户搜索失败。"));
    }
  };

  const invite = async (userId: string) => {
    setBusy(userId);
    try {
      await inviteEntryParticipant(entryId, userId, []);
      setKeyword("");
      setResults([]);
      setStatus("共同经历邀请已发送；请在下方配置可编辑字段。");
      await load();
    } catch (error) {
      setStatus(getFriendlyError(error, "邀请失败。群组记录只能邀请有效群组成员。"));
    } finally {
      setBusy(null);
    }
  };

  const toggleField = (
    userId: string,
    field: EntryEditableField,
    checked: boolean,
  ) => {
    setDraftFields((current) => {
      const fields = current[userId] ?? [];
      return {
        ...current,
        [userId]: checked
          ? [...new Set([...fields, field])]
          : fields.filter((value) => value !== field),
      };
    });
  };

  const savePermissions = async (userId: string) => {
    setBusy(userId);
    try {
      await updateEntryParticipantPermissions(
        entryId,
        userId,
        draftFields[userId] ?? [],
      );
      setStatus("字段权限已更新。");
      await load();
    } catch (error) {
      setStatus(getFriendlyError(error, "字段权限更新失败。"));
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (userId: string) => {
    setBusy(userId);
    try {
      await revokeEntryParticipant(entryId, userId);
      setStatus("共同经历权限已撤销。");
      await load();
    } catch (error) {
      setStatus(getFriendlyError(error, "撤销失败。"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="entry-participants">
      <h3>谁可以共同经历与修改？</h3>
      <p className="section-intro">受邀者接受后才能看到非公开故事。你可以分别决定对方能修改哪些内容；删除故事、更改阅读范围和管理邀请始终只属于创建者。</p>
      <div className="participant-search">
        <input
          type="search"
          value={keyword}
          maxLength={80}
          placeholder="按昵称搜索"
          onChange={(event) => setKeyword(event.target.value)}
        />
        <button type="button" onClick={() => void search()}>搜索</button>
      </div>
      {results.length ? (
        <div className="participant-search-results">
          {results.map((profile) => (
            <button
              key={profile.id}
              type="button"
              disabled={busy === profile.id}
              onClick={() => void invite(profile.id)}
            >
              邀请 {profile.display_name}
            </button>
          ))}
        </div>
      ) : null}
      {status ? <p className="field-meta" role="status">{status}</p> : null}
      {participants.map((participant) => (
        <article className="participant-row" key={participant.user_id}>
          <div>
            <strong>{participant.profiles?.display_name ?? "地图旅人"}</strong>
            <small>{participant.status === "accepted" ? "已接受" : "待接受"}</small>
          </div>
          <fieldset>
            <legend>允许这个人修改</legend>
            {ALL_ENTRY_EDITABLE_FIELDS.map((field) => (
              <label key={field} className="check-row">
                <input
                  type="checkbox"
                  checked={(draftFields[participant.user_id] ?? []).includes(field)}
                  onChange={(event) =>
                    toggleField(participant.user_id, field, event.target.checked)
                  }
                />
                {ENTRY_EDITABLE_FIELD_LABELS[field]}
              </label>
            ))}
          </fieldset>
          <div className="record-actions">
            <button
              type="button"
              disabled={busy === participant.user_id}
              onClick={() => void savePermissions(participant.user_id)}
            >
              保存权限
            </button>
            <button
              className="text-danger-button"
              type="button"
              disabled={busy === participant.user_id}
              onClick={() => void revoke(participant.user_id)}
            >
              撤销
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
