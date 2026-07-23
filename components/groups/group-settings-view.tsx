"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/navigation/app-header";
import { useAuth } from "@/components/providers/auth-provider";
import { GroupForm } from "@/components/groups/group-form";
import { ConfirmDialog } from "@/components/entries/confirm-dialog";
import {
  archiveGroup,
  getGroupBySlug,
  getMyGroupRole,
  updateGroup,
} from "@/lib/data/groups";
import { getFriendlyError } from "@/lib/errors";
import type { Group, GroupRole } from "@/types/database";

export function GroupSettingsView({ slug }: { slug: string }) {
  const { user } = useAuth();
  return <GroupSettingsForScope key={`${user?.id ?? "anon"}:${slug}`} slug={slug} />;
}

function GroupSettingsForScope({ slug }: { slug: string }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [group, setGroup] = useState<Group | null>(null);
  const [role, setRole] = useState<GroupRole | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (authLoading) return;
    try {
      const nextGroup = await getGroupBySlug(slug);
      if (!nextGroup) throw new Error("not-found");
      const nextRole = await getMyGroupRole(nextGroup.id, user?.id ?? null);
      if (nextRole !== "owner" && nextRole !== "admin") throw new Error("forbidden");
      setGroup(nextGroup);
      setRole(nextRole);
    } catch (error) {
      setStatus(getFriendlyError(error, "你没有权限修改这个群组。"));
    }
  }, [authLoading, slug, user]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  return (
    <main className="content-page">
      <AppHeader />
      <div className="narrow-container">
        <div className="page-heading"><div><p className="eyebrow">GROUP SETTINGS</p><h1>群组设置</h1></div><Link href={`/groups/${slug}`}>返回群组</Link></div>
        {status ? <div className="inline-error" role="status">{status}</div> : null}
        {group && role ? (
          <>
            <GroupForm
              submitLabel="保存群组资料"
              canEditIdentity={role === "owner"}
              initialValues={{
                name: group.name,
                slug: group.slug,
                description: group.description,
                avatar_url: group.avatar_url ?? "",
                visibility: group.visibility,
              }}
              onSubmit={async (values) => {
                try {
                  const updated = await updateGroup(group.id, values);
                  setGroup(updated);
                  setStatus("群组资料已更新。");
                  if (updated.slug !== slug) router.replace(`/groups/${updated.slug}/settings`);
                } catch (error) {
                  setStatus(getFriendlyError(error, "群组资料保存失败。"));
                }
              }}
            />
            {role === "owner" && !group.archived_at ? <section className="danger-zone"><h2>归档群组</h2><p>归档后不再允许发布新记录，历史内容与成员关系会保留。</p><button className="text-danger-button" type="button" onClick={() => setConfirmArchive(true)}>归档群组</button></section> : null}
          </>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmArchive}
        title="归档这个群组？"
        description="归档不可由普通客户端撤销。历史记录将保留为只读。"
        busy={busy}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => {
          if (!group) return;
          setBusy(true);
          void archiveGroup(group.id)
            .then(() => {
              setConfirmArchive(false);
              router.replace(`/groups/${group.slug}`);
            })
            .catch((error: unknown) => setStatus(getFriendlyError(error, "群组归档失败。")))
            .finally(() => setBusy(false));
        }}
      />
    </main>
  );
}
