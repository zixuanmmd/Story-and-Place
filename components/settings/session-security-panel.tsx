"use client";

import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { getFriendlyError, reportOperationalError } from "@/lib/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function formatTimestamp(value: string | number | null | undefined) {
  if (!value) return "未知";
  const milliseconds = typeof value === "number" ? value * 1000 : Date.parse(value);
  if (!Number.isFinite(milliseconds)) return "未知";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(milliseconds));
}

export function SessionSecurityPanel() {
  const { session, user } = useAuth();
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!session || !user) return null;

  const signOutOthers = async () => {
    setSubmitting(true);
    setNotice(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) throw error;
      setNotice("其他设备的刷新会话已撤销。它们现有的短期会话会在过期后结束。");
    } catch (error) {
      reportOperationalError(error, "auth:sign-out-other-sessions");
      setNotice(getFriendlyError(error, "暂时无法退出其他设备，请稍后重试。"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="settings-section-card" aria-labelledby="session-security-title">
      <div>
        <p className="eyebrow">ACCOUNT SECURITY</p>
        <h2 id="session-security-title">登录设备</h2>
        <p>Supabase 当前不提供可靠的设备名称列表，因此这里只展示当前会话，不虚构设备信息。</p>
      </div>
      <dl className="session-summary">
        <div><dt>当前账户</dt><dd>{user.email ?? "已登录账户"}</dd></div>
        <div><dt>最近登录</dt><dd>{formatTimestamp(user.last_sign_in_at)}</dd></div>
        <div><dt>当前会话到期</dt><dd>{formatTimestamp(session.expires_at)}</dd></div>
      </dl>
      {notice ? <div className={notice.startsWith("其他设备") ? "inline-success" : "notice"} role="status">{notice}</div> : null}
      <div className="form-actions">
        <button className="secondary-button" type="button" onClick={() => void signOutOthers()} disabled={submitting}>
          {submitting ? "正在退出…" : "退出其他设备"}
        </button>
      </div>
    </section>
  );
}

export { formatTimestamp };
