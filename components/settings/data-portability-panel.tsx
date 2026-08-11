"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  allExportedEntries,
  downloadTextFile,
  exportMyStoryData,
  storyDataToCsv,
  storyDataToGeoJson,
} from "@/lib/data/data-export";
import {
  beginAccountDeletion,
  getAccountDeletionImpact,
} from "@/lib/data/account-deletion";
import { getFriendlyError, reportOperationalError } from "@/lib/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AccountDeletionMode } from "@/types/database";
import type { AccountDeletionImpact } from "@/lib/validation/data-portability";

type ExportFormat = "json" | "csv" | "geojson";

class AccountDeletionResponseError extends Error {}

function exportFilename(extension: string) {
  return `story-and-place-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

export function DataPortabilityPanel() {
  const { user, session } = useAuth();
  const [busyExport, setBusyExport] = useState<ExportFormat | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [impact, setImpact] = useState<AccountDeletionImpact | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [mode, setMode] = useState<AccountDeletionMode>("preserve_public");
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);

  const download = async (format: ExportFormat) => {
    setBusyExport(format);
    setExportNotice(null);
    try {
      const data = await exportMyStoryData();
      if (format === "json") {
        downloadTextFile(exportFilename("json"), JSON.stringify(data, null, 2), "application/json;charset=utf-8");
      } else if (format === "csv") {
        downloadTextFile(exportFilename("csv"), storyDataToCsv(data), "text/csv;charset=utf-8");
      } else {
        downloadTextFile(exportFilename("geojson"), JSON.stringify(storyDataToGeoJson(data), null, 2), "application/geo+json;charset=utf-8");
      }
      const collaborationCount = data.participant_entries.length;
      setExportNotice(
        `已导出 ${allExportedEntries(data).length} 条可读故事${collaborationCount ? `，其中 ${collaborationCount} 条为共同经历内容` : ""}。`,
      );
    } catch (error) {
      reportOperationalError(error, "data-export");
      setExportNotice(getFriendlyError(error, "数据导出失败，请稍后重试。"));
    } finally {
      setBusyExport(null);
    }
  };

  const openDeletion = async () => {
    setDeletionOpen(true);
    setImpactLoading(true);
    setDeleteNotice(null);
    try {
      setImpact(await getAccountDeletionImpact());
    } catch (error) {
      reportOperationalError(error, "account-deletion-impact");
      setDeleteNotice(getFriendlyError(error, "暂时无法计算账号删除影响，请稍后重试。"));
    } finally {
      setImpactLoading(false);
    }
  };

  const deleteAccount = async () => {
    if (!user || !session || confirmation !== "删除我的账号" || !password || impact?.blocking_groups.length) return;
    setDeleting(true);
    setDeleteNotice(null);
    try {
      const requestId = await beginAccountDeletion(mode);
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ requestId, mode, confirmation, password }),
      });
      const result = await response.json() as {
        ok?: unknown;
        accountDisabled?: unknown;
        message?: unknown;
      };
      if (!response.ok && result.accountDisabled !== true) {
        throw new AccountDeletionResponseError(
          typeof result.message === "string" ? result.message : "账号暂时无法删除，请稍后重试。",
        );
      }
      if (result.ok !== true && result.accountDisabled !== true) {
        throw new Error("Account deletion failed.");
      }

      const supabase = getSupabaseBrowserClient();
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) reportOperationalError(signOutError, "account-deletion-local-sign-out");
      window.location.assign(result.accountDisabled === true ? "/account-deleted?pending=1" : "/account-deleted");
    } catch (error) {
      reportOperationalError(error, "account-deletion");
      const directMessage = error instanceof AccountDeletionResponseError
        ? error.message
        : null;
      setDeleteNotice(directMessage ?? getFriendlyError(error, "账号暂时无法删除，请稍后重试。"));
    } finally {
      setPassword("");
      setDeleting(false);
    }
  };

  if (!user) return null;
  const blocked = Boolean(impact?.blocking_groups.length);

  return (
    <div className="data-portability-stack">
      <section className="settings-section-card" aria-labelledby="data-export-title">
        <div><p className="eyebrow">YOUR DATA</p><h2 id="data-export-title">导出我的数据</h2><p>下载你拥有的故事、时间、标签和路线。仍有权阅读的共同经历内容会标记为“参与者”，不会混作你的原创内容。</p></div>
        <div className="export-actions" aria-label="数据导出格式">
          <button className="secondary-button" type="button" disabled={busyExport !== null} onClick={() => void download("json")}>{busyExport === "json" ? "正在准备…" : "导出 JSON"}</button>
          <button className="secondary-button" type="button" disabled={busyExport !== null} onClick={() => void download("csv")}>{busyExport === "csv" ? "正在准备…" : "导出 CSV"}</button>
          <button className="secondary-button" type="button" disabled={busyExport !== null} onClick={() => void download("geojson")}>{busyExport === "geojson" ? "正在准备…" : "导出 GeoJSON"}</button>
        </div>
        <p className="field-meta">导出不包含邮箱、密码、登录令牌、Auth metadata 或其他用户的私密资料。</p>
        {exportNotice ? <div className="notice" role="status">{exportNotice}</div> : null}
      </section>

      <section className="settings-section-card settings-danger-card" aria-labelledby="delete-account-title">
        <div><p className="eyebrow">ACCOUNT</p><h2 id="delete-account-title">删除账号</h2><p>这是不可逆操作。开始前请先导出需要保留的数据。</p></div>
        {!deletionOpen ? <button className="text-danger-button" type="button" onClick={() => void openDeletion()}>查看删除影响</button> : null}

        {deletionOpen ? (
          <div className="account-deletion-form">
            {impactLoading ? <p role="status">正在计算数据影响…</p> : null}
            {impact ? (
              <div className="deletion-impact" aria-label="账号删除影响摘要">
                <span>公开故事 {impact.public_entries}</span><span>私密故事 {impact.private_entries}</span><span>群组故事 {impact.group_entries}</span><span>公开路线 {impact.public_routes}</span><span>其他路线 {impact.other_routes}</span><span>共同经历 {impact.collaborations}</span>
              </div>
            ) : null}

            {blocked && impact ? (
              <div className="inline-error" role="alert">
                <strong>请先处理群组职责</strong>
                <p>群主必须转移群主或归档群组；管理员需要先退出或由群主调整角色。</p>
                <ul>{impact.blocking_groups.map((group) => <li key={group.id}><Link href={`/groups/${group.slug}/members`}>{group.name}</Link> · {group.role === "owner" ? "群主" : "管理员"}</li>)}</ul>
              </div>
            ) : null}

            <fieldset disabled={deleting || blocked}>
              <legend>公开内容如何处理？</legend>
              <label><input type="radio" name="deletion-mode" value="preserve_public" checked={mode === "preserve_public"} onChange={() => setMode("preserve_public")} /><span><strong>匿名保留公开内容</strong><small>公开故事和公开路线继续存在，但作者改为“已注销用户”；精选状态会清除。</small></span></label>
              <label><input type="radio" name="deletion-mode" value="delete_all" checked={mode === "delete_all"} onChange={() => setMode("delete_all")} /><span><strong>删除我的全部内容</strong><small>删除你拥有的所有故事与路线；不会删除其他作者的共同经历内容。</small></span></label>
            </fieldset>

            <label><span>输入“删除我的账号” *</span><input autoComplete="off" value={confirmation} disabled={deleting || blocked} onChange={(event) => setConfirmation(event.target.value)} /></label>
            <label><span>再次输入登录密码 *</span><input type="password" autoComplete="current-password" value={password} disabled={deleting || blocked} onChange={(event) => setPassword(event.target.value)} /></label>
            <p className="field-meta">密码只用于本次身份确认，不会写入日志、页面状态以外的存储或数据库。</p>
            {deleteNotice ? <div className="inline-error" role="alert">{deleteNotice}</div> : null}
            <div className="form-actions"><button className="secondary-button" type="button" disabled={deleting} onClick={() => { setDeletionOpen(false); setPassword(""); setConfirmation(""); }}>取消</button><button className="danger-button" type="button" disabled={deleting || blocked || confirmation !== "删除我的账号" || !password} onClick={() => void deleteAccount()}>{deleting ? "正在删除账号…" : "永久删除账号"}</button></div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
