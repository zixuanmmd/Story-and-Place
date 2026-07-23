"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { getFriendlyError } from "@/lib/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  loginFormSchema,
  registerSchema,
  type RegisterValues,
} from "@/lib/validation/auth";
import { useAuth } from "@/components/providers/auth-provider";
import { getSafeRedirectPath } from "@/lib/navigation/safe-redirect";

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const isRegister = mode === "register";
  const router = useRouter();
  const searchParams = useSearchParams();
  const { configured } = useAuth();
  const [notice, setNotice] = useState<string | null>(null);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(isRegister ? registerSchema : loginFormSchema),
    defaultValues: { displayName: "", email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setNotice(null);
    if (!configured) {
      setNotice("Supabase 尚未配置，请先填写本地环境变量。");
      return;
    }

    try {
      const supabase = getSupabaseBrowserClient();
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: {
            data: { display_name: values.displayName.trim() },
          },
        });
        if (error) throw error;

        if (!data.session) {
          setNotice("注册成功。请前往邮箱完成验证后再登录。");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });
        if (error) throw error;
      }

      router.replace(
        getSafeRedirectPath(searchParams.get("next"), window.location.origin),
      );
      router.refresh();
    } catch (error) {
      setNotice(getFriendlyError(error));
    }
  });

  return (
    <div className="auth-shell">
      <Link className="back-link" href="/">
        ← 返回地图
      </Link>
      <section className="auth-card">
        <p className="eyebrow">STORY & PLACE</p>
        <h1>{isRegister ? "创建你的故事档案" : "回到你的地图"}</h1>
        <p className="auth-intro">
          {isRegister
            ? "用一个名字开始，在地点与时间之间留下属于你的记录。"
            : "登录后可查看私密记录，并继续书写未完成的故事。"}
        </p>

        {!configured ? (
          <div className="notice notice--warning" role="alert">
            <strong>需要先连接 Supabase，登录和注册才能使用。</strong>
            <span>
              在项目的 Connect 页面复制 Project URL 和 Publishable key，写入
              <code>.env.local</code> 后重启本地服务。
            </span>
            <a
              className="notice-link"
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
            >
              打开 Supabase 控制台
            </a>
          </div>
        ) : null}

        <form className="stack-form" onSubmit={onSubmit} noValidate>
          {isRegister ? (
            <label>
              <span>显示名</span>
              <input
                autoComplete="nickname"
                maxLength={80}
                {...form.register("displayName")}
              />
              {form.formState.errors.displayName ? (
                <small>{form.formState.errors.displayName.message}</small>
              ) : null}
            </label>
          ) : null}

          <label>
            <span>邮箱</span>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              {...form.register("email")}
            />
            {form.formState.errors.email ? (
              <small>{form.formState.errors.email.message}</small>
            ) : null}
          </label>

          <label>
            <span>密码</span>
            <input
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              {...form.register("password")}
            />
            {form.formState.errors.password ? (
              <small>{form.formState.errors.password.message}</small>
            ) : null}
          </label>

          {notice ? (
            <div className="notice" role="status">
              {notice}
            </div>
          ) : null}

          <button
            className="primary-button w-full"
            type="submit"
            disabled={form.formState.isSubmitting || !configured}
          >
            {form.formState.isSubmitting
              ? "正在处理…"
              : isRegister
                ? "注册"
                : "登录"}
          </button>
        </form>

        <p className="auth-switch">
          {isRegister ? "已经有账户？" : "还没有账户？"}
          <Link
            href={isRegister ? "/login" : "/register"}
          >
            {isRegister ? "前往登录" : "创建账户"}
          </Link>
        </p>
      </section>
    </div>
  );
}
