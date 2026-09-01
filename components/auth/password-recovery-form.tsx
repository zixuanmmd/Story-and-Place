"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { getErrorStatus, reportOperationalError } from "@/lib/errors";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  passwordRecoverySchema,
  type PasswordRecoveryValues,
} from "@/lib/validation/auth";

const GENERIC_SUCCESS =
  "如果该邮箱已注册，我们会发送密码重置邮件。请检查收件箱和垃圾邮件。";

export function PasswordRecoveryForm() {
  const [notice, setNotice] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const form = useForm<PasswordRecoveryValues>({
    resolver: zodResolver(passwordRecoverySchema),
    defaultValues: { email: "" },
  });

  const submit = form.handleSubmit(async ({ email }) => {
    setNotice(null);
    if (!isSupabaseConfigured) {
      setNotice("Supabase 尚未配置，暂时不能发送密码重置邮件。");
      return;
    }

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      setNotice(GENERIC_SUCCESS);
      form.reset({ email: "" });
    } catch (error) {
      reportOperationalError(error, "auth:password-recovery");
      if (getErrorStatus(error) === 429) {
        setNotice("重置邮件请求过于频繁，请稍后再试。");
        return;
      }
      // 对未知邮箱和邮件服务错误使用相同结果，避免泄露账户是否存在。
      setSent(true);
      setNotice(GENERIC_SUCCESS);
    }
  });

  return (
    <div className="auth-shell">
      <Link className="back-link" href="/login">← 返回登录</Link>
      <section className="auth-card">
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h1>重设密码</h1>
        <p className="auth-intro">输入注册邮箱，我们会发送一次性重置链接。</p>
        <form className="stack-form" onSubmit={submit} noValidate>
          <label>
            <span>邮箱</span>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              disabled={form.formState.isSubmitting}
              {...form.register("email")}
            />
            {form.formState.errors.email ? <small>{form.formState.errors.email.message}</small> : null}
          </label>
          {notice ? <div className={sent ? "inline-success" : "notice"} role="status">{notice}</div> : null}
          <button className="primary-button w-full" type="submit" disabled={form.formState.isSubmitting || !isSupabaseConfigured}>
            {form.formState.isSubmitting ? "正在发送…" : "发送重置邮件"}
          </button>
        </form>
      </section>
    </div>
  );
}
