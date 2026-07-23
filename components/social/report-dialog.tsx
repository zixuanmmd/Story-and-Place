"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { submitReport } from "@/lib/data/social";
import { getFriendlyError } from "@/lib/errors";
import type { ReportTargetType } from "@/types/database";

const REASONS = [
  ["spam", "垃圾内容"],
  ["harassment", "骚扰"],
  ["hate", "仇恨或攻击"],
  ["privacy", "隐私泄露"],
  ["misinformation", "虚假信息"],
  ["other", "其他"],
] as const;

export function ReportDialog({
  targetType,
  targetId,
}: {
  targetType: ReportTargetType;
  targetId: string;
}) {
  const { user } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<(typeof REASONS)[number][0]>("spam");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => dialogRef.current?.close(), []);

  const open = () => {
    if (!user) {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setStatus(null);
    dialogRef.current?.showModal();
  };

  const submit = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await submitReport(user.id, {
        target_type: targetType,
        target_id: targetId,
        reason,
        description,
      });
      dialogRef.current?.close();
      setDescription("");
      setStatus("举报已提交，我们会在后续审核流程中处理。");
    } catch (error) {
      setStatus(getFriendlyError(error, "举报提交失败，请稍后重试。"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="report-control">
      <button className="quiet-button" type="button" onClick={open}>举报</button>
      {status ? <span className="field-meta" role="status">{status}</span> : null}
      <dialog className="app-dialog" ref={dialogRef} aria-labelledby={`report-${targetId}`}>
        <form method="dialog" onSubmit={(event) => event.preventDefault()}>
          <div className="form-title-row">
            <h2 id={`report-${targetId}`}>举报不当内容</h2>
            <button className="icon-button" type="button" onClick={() => dialogRef.current?.close()} aria-label="关闭">×</button>
          </div>
          <label>
            <span>原因</span>
            <select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)}>
              {REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span>补充说明</span>
            <textarea maxLength={1000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={() => dialogRef.current?.close()}>取消</button>
            <button className="primary-button" type="button" disabled={busy} onClick={() => void submit()}>
              {busy ? "提交中…" : "提交举报"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

