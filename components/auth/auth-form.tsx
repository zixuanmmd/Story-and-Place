"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { getFriendlyError, reportOperationalError } from "@/lib/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isDisplayNameAvailable } from "@/lib/data/profiles";
import {
  DISPLAY_NAME_TAKEN_MESSAGE,
  normalizeDisplayNameForStorage,
} from "@/lib/profile/display-name";
import {
  loginFormSchema,
  registerSchema,
  type RegisterValues,
} from "@/lib/validation/auth";
import { useAuth } from "@/components/providers/auth-provider";
import {
  getAuthPageHref,
  getSafeRedirectPath,
} from "@/lib/navigation/safe-redirect";
import {
  requireEmailConfirmation,
  TEST_REGISTRATION_NOTICE,
} from "@/lib/auth/config";
import {
  EMAIL_ALREADY_REGISTERED_NOTICE,
  isDuplicateEmailError,
  resolveRegistrationOutcome,
} from "@/lib/auth/registration";
import { ensureOnboardingDecision } from "@/lib/data/onboarding";

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const isRegister = mode === "register";
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextCandidate = searchParams.get("next");
  const { configured, refreshAuth } = useAuth();
  const [notice, setNotice] = useState<string | null>(null);
  const [showLoginAction, setShowLoginAction] = useState(false);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(isRegister ? registerSchema : loginFormSchema),
    defaultValues: {
      displayName: "",
      email: isRegister ? "" : (searchParams.get("email") ?? ""),
      password: "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setNotice(null);
    setShowLoginAction(false);
    if (!configured) {
      setNotice("Supabase 尚未配置，请先填写本地环境变量。");
      return;
    }

    let signUpAttempted = false;
    let authenticatedUserId: string | null = null;
    try {
      const supabase = getSupabaseBrowserClient();
      if (isRegister) {
        const displayName = normalizeDisplayNameForStorage(values.displayName);
        form.setValue("displayName", displayName);
        const available = await isDisplayNameAvailable(displayName);
        if (!available) {
          form.setError("displayName", {
            type: "validate",
            message: DISPLAY_NAME_TAKEN_MESSAGE,
          });
          form.setFocus("displayName");
          return;
        }

        signUpAttempted = true;
        const { data, error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: {
            data: { display_name: displayName },
          },
        });
        if (error) throw error;
        authenticatedUserId = data.user?.id ?? null;

        const outcome = resolveRegistrationOutcome({
          hasSession: Boolean(data.session),
          user: data.user,
          emailConfirmationRequired: requireEmailConfirmation,
        });
        if (!outcome.shouldNavigate) {
          setNotice(outcome.notice);
          if (outcome.kind === "possibly-registered") {
            setShowLoginAction(true);
            form.resetField("password", { defaultValue: "" });
          }
          return;
        }
        setNotice("注册成功，正在进入地图……");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });
        if (error) throw error;
        authenticatedUserId = data.user.id;
      }

      await refreshAuth();
      let destination = getSafeRedirectPath(
        searchParams.get("next"),
        window.location.origin,
      );
      if (destination === "/" && authenticatedUserId) {
        try {
          const decision = await ensureOnboardingDecision(authenticatedUserId);
          if (decision.shouldOnboard) destination = "/onboarding";
        } catch (onboardingError) {
          reportOperationalError(onboardingError, "auth:onboarding-destination");
        }
      }
      router.replace(destination);
      router.refresh();
    } catch (error) {
      reportOperationalError(error, isRegister ? "auth:sign-up" : "auth:sign-in");
      if (isRegister && isDuplicateEmailError(error)) {
        setNotice(EMAIL_ALREADY_REGISTERED_NOTICE);
        setShowLoginAction(true);
        form.resetField("password", { defaultValue: "" });
        return;
      }

      if (isRegister && signUpAttempted) {
        try {
          const stillAvailable = await isDisplayNameAvailable(
            normalizeDisplayNameForStorage(form.getValues("displayName")),
          );
          if (!stillAvailable) {
            form.setError("displayName", {
              type: "validate",
              message: DISPLAY_NAME_TAKEN_MESSAGE,
            });
            form.setFocus("displayName");
            form.resetField("password", { defaultValue: "" });
            return;
          }
        } catch (availabilityError) {
          reportOperationalError(
            availabilityError,
            "auth:display-name-race-check",
          );
        }
      }

      setNotice(
        getFriendlyError(
          error,
          isRegister
            ? "注册暂时没有成功，请稍后重试。"
            : "登录暂时没有成功，请稍后重试。",
          {
          requireEmailConfirmation,
          },
        ),
      );
      if (isRegister) form.resetField("password", { defaultValue: "" });
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
            : "登录后可查看只与你相关的故事，并继续书写未完成的内容。"}
        </p>

        {isRegister && !requireEmailConfirmation ? (
          <p className="auth-test-notice" role="note">
            {TEST_REGISTRATION_NOTICE}
          </p>
        ) : null}

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
              {showLoginAction ? (
                <Link
                  className="notice-action"
                  href={getAuthPageHref(
                    "/login",
                    nextCandidate,
                    "http://local.story-map",
                    form.getValues("email"),
                  )}
                >
                  前往登录
                </Link>
              ) : null}
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
            href={getAuthPageHref(
              isRegister ? "/login" : "/register",
              nextCandidate,
              "http://local.story-map",
              isRegister ? form.getValues("email") : undefined,
            )}
          >
            {isRegister ? "前往登录" : "创建账户"}
          </Link>
        </p>
      </section>
    </div>
  );
}
