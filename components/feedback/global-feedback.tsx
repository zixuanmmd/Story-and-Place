"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  feedbackSubmissionSchema,
  normalizeFeedbackRoute,
  type FeedbackCategory,
} from "@/lib/validation/feedback";

const CATEGORIES: Array<{ value: FeedbackCategory; label: string }> = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "功能建议" },
  { value: "content", label: "内容问题" },
  { value: "other", label: "其他" },
];

async function responseMessage(response: Response) {
  try {
    const payload = await response.json() as { message?: unknown };
    return typeof payload.message === "string" ? payload.message : null;
  } catch {
    return null;
  }
}

export function GlobalFeedback() {
  const pathname = usePathname();
  const { session } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => dialogRef.current?.close(), []);

  const open = () => {
    setError(null);
    setNotice(null);
    dialogRef.current?.showModal();
  };

  const close = () => dialogRef.current?.close();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = feedbackSubmissionSchema.safeParse({
      category,
      message,
      currentRoute: normalizeFeedbackRoute(pathname),
    });
    if (!values.success) {
      setError(values.error.issues[0]?.message ?? "请检查反馈内容。" );
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(session?.access_token
            ? { authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify(values.data),
      });
      const serverMessage = await responseMessage(response);
      if (!response.ok) {
        setError(serverMessage ?? "反馈暂时没有提交成功，请稍后重试。");
        return;
      }
      setMessage("");
      setNotice(serverMessage ?? "感谢你的反馈，我们已经收到。");
      close();
    } catch {
      setError("网络连接失败，请检查网络后重试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="global-feedback-control">
      <button
        ref={triggerRef}
        className="global-feedback-trigger"
        type="button"
        onClick={open}
        aria-haspopup="dialog"
      >
        反馈
      </button>
      {notice ? <div className="feedback-toast" role="status">{notice}</div> : null}
      <dialog
        className="app-dialog feedback-dialog"
        ref={dialogRef}
        aria-labelledby="global-feedback-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
        onClose={() => triggerRef.current?.focus()}
      >
        <form onSubmit={submit} noValidate>
          <div className="form-title-row">
            <div>
              <p className="eyebrow">FEEDBACK</p>
              <h2 id="global-feedback-title">告诉我们你的感受</h2>
            </div>
            <button className="icon-button" type="button" onClick={close} aria-label="关闭反馈窗口">×</button>
          </div>
          <p className="field-hint">不会自动收集故事正文、密码、登录令牌或截图。</p>
          <label htmlFor="global-feedback-category">
            <span>反馈类型</span>
            <select
              id="global-feedback-category"
              name="category"
              value={category}
              onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
            >
              {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label htmlFor="global-feedback-message">
            <span>反馈内容 *</span>
            <textarea
              id="global-feedback-message"
              name="message"
              rows={6}
              maxLength={2000}
              value={message}
              aria-describedby="feedback-message-meta"
              aria-invalid={Boolean(error)}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="描述你遇到的问题，或希望产品变得怎样。"
            />
            <small id="feedback-message-meta">{message.length}/2000</small>
          </label>
          {error ? <div className="notice" role="alert">{error}</div> : null}
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={close}>取消</button>
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "提交中…" : "提交反馈"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
