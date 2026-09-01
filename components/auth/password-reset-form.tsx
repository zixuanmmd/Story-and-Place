"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useAuth } from "@/components/providers/auth-provider";
import { getFriendlyError, reportOperationalError } from "@/lib/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  passwordResetSchema,
  type PasswordResetValues,
} from "@/lib/validation/auth";

export function PasswordResetForm() {
  const router = useRouter();
  const { configured, loading, user } = useAuth();
  const [notice, setNotice] = useState<string | null>(null);
  const form = useForm<PasswordResetValues>({
    resolver: zodResolver(passwordResetSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const submit = form.handleSubmit(async ({ password }) => {
    setNotice(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      form.reset({ password: "", confirmPassword: "" });
      setNotice("密码已更新，正在返回设置页……");
      router.replace("/settings");
      router.refresh();
    } catch (error) {
      reportOperationalError(error, "auth:password-reset");
      setNotice(getFriendlyError(error, "密码没有更新，请重新打开重置邮件中的链接。"));
    }
  });

  const unavailable = !configured || (!loading && !user);

  return (
    <div className="auth-shell">
      <Link className="back-link" href="/login">← 返回登录</Link>
      <section className="auth-card">
        <p className="eyebrow">ACCOUNT SECURITY</p>
        <h1>设置新密码</h1>
        <p className="auth-intro">重置链接会建立临时安全会话。完成后，当前设备继续保持登录。</p>
        {loading ? <div className="page-inline-loading" role="status">正在验证重置链接…</div> : null}
        {unavailable ? (
          <div className="notice" role="alert">
            重置链接无效或已经过期。请重新申请密码重置邮件。
            <Link className="notice-action" href="/forgot-password">重新申请</Link>
          </div>
        ) : null}
        {!loading && user ? (
          <form className="stack-form" onSubmit={submit} noValidate>
            <label>
              <span>新密码</span>
              <input type="password" autoComplete="new-password" {...form.register("password")} />
              {form.formState.errors.password ? <small>{form.formState.errors.password.message}</small> : null}
            </label>
            <label>
              <span>再次输入新密码</span>
              <input type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
              {form.formState.errors.confirmPassword ? <small>{form.formState.errors.confirmPassword.message}</small> : null}
            </label>
            {notice ? <div className="notice" role="status">{notice}</div> : null}
            <button className="primary-button w-full" type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "正在更新…" : "更新密码"}
            </button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
