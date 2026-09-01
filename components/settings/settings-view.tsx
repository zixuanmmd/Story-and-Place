"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { AppHeader } from "@/components/navigation/app-header";
import { ProtectedState } from "@/components/layout/protected-state";
import { useAuth } from "@/components/providers/auth-provider";
import { isDisplayNameAvailable, saveProfile } from "@/lib/data/profiles";
import {
  getErrorCode,
  getFriendlyError,
  reportOperationalError,
} from "@/lib/errors";
import {
  DISPLAY_NAME_TAKEN_MESSAGE,
  normalizeDisplayNameForStorage,
} from "@/lib/profile/display-name";
import { profileSchema, type ProfileFormValues } from "@/lib/validation/profile";
import { DataPortabilityPanel } from "@/components/settings/data-portability-panel";
import { SessionSecurityPanel } from "@/components/settings/session-security-panel";
import Link from "next/link";

export function SettingsView() {
  const { user, profile, loading, configured, refreshProfile } = useAuth();
  const [notice, setNotice] = useState<string | null>(null);
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { display_name: "", bio: "", avatar_url: "" },
  });
  const avatarUrl = useWatch({ control: form.control, name: "avatar_url" });
  const displayName = useWatch({ control: form.control, name: "display_name" });
  const bio = useWatch({ control: form.control, name: "bio" });

  useEffect(() => {
    if (profile) {
      form.reset({
        display_name: profile.display_name,
        bio: profile.bio ?? "",
        avatar_url: profile.avatar_url ?? "",
      });
    }
  }, [form, profile]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!user) return;
    setNotice(null);
    try {
      const displayName = normalizeDisplayNameForStorage(values.display_name);
      form.setValue("display_name", displayName);
      const available = await isDisplayNameAvailable(displayName);
      if (!available) {
        form.setError("display_name", {
          type: "validate",
          message: DISPLAY_NAME_TAKEN_MESSAGE,
        });
        form.setFocus("display_name");
        return;
      }

      await saveProfile(user.id, { ...values, display_name: displayName });
      await refreshProfile();
      setNotice("个人资料已保存。");
    } catch (error) {
      reportOperationalError(error, "profile:update");
      if (getErrorCode(error) === "23505") {
        form.setError("display_name", {
          type: "validate",
          message: DISPLAY_NAME_TAKEN_MESSAGE,
        });
        form.setFocus("display_name");
        return;
      }
      setNotice(getFriendlyError(error, "个人资料保存失败，请稍后重试。"));
    }
  });

  let content;
  if (!configured) content = <ProtectedState kind="config" />;
  else if (loading) content = <ProtectedState kind="loading" />;
  else if (!user) content = <ProtectedState kind="signed-out" nextPath="/settings" signedOutDescription="登录后可以修改显示名、简介和头像地址。" />;
  else {
    content = (
      <>
      <section className="settings-card">
        <div className="profile-preview">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- 用户提供的任意远程 URL 无法预先配置 Next Image 域名。
            <img src={avatarUrl} alt="头像预览" onError={(event) => { event.currentTarget.style.display = "none"; }} />
          ) : (
            <span aria-hidden="true">{(displayName || "旅").slice(0, 1)}</span>
          )}
          <div><strong>{displayName || "地图旅人"}</strong><small>公开资料预览</small></div>
        </div>

        <form className="stack-form settings-form" onSubmit={onSubmit} noValidate>
          <label><span>显示名 *</span><input maxLength={80} {...form.register("display_name")} />{form.formState.errors.display_name ? <small>{form.formState.errors.display_name.message}</small> : null}</label>
          <label><span>简介</span><textarea rows={6} maxLength={1000} placeholder="简单介绍一下自己，或你记录这些故事的原因。" {...form.register("bio")} /><span className="field-meta">{form.formState.errors.bio?.message ?? `${bio.length}/1000`}</span></label>
          <label><span>头像 URL</span><input type="url" inputMode="url" placeholder="https://example.com/avatar.jpg" {...form.register("avatar_url")} />{form.formState.errors.avatar_url ? <small>{form.formState.errors.avatar_url.message}</small> : <span className="field-hint">第一版使用图片链接，不上传头像文件。</span>}</label>
          {notice ? <div className={notice.includes("已保存") ? "inline-success" : "notice"} role="status">{notice}</div> : null}
          <div className="form-actions"><button className="primary-button" type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "正在保存…" : "保存设置"}</button></div>
        </form>
      </section>
      <SessionSecurityPanel />
      <section className="settings-section-card" aria-labelledby="notification-settings-title">
        <h2 id="notification-settings-title">通知</h2>
        <p>管理共同经历、群组、时间胶囊与账号安全提醒的接收方式。</p>
        <Link className="secondary-button nav-link" href="/settings/notifications">打开通知设置</Link>
      </section>
      <section className="settings-section-card" aria-labelledby="usage-settings-title">
        <h2 id="usage-settings-title">套餐与使用量</h2>
        <p>查看故事、故事线路、图片文件与存储空间的当前使用情况。</p>
        <Link className="secondary-button nav-link" href="/settings/usage">查看套餐与使用量</Link>
      </section>
      <DataPortabilityPanel />
      </>
    );
  }

  return (
    <main className="content-page">
      <AppHeader />
      <div className="content-container content-container--narrow">
        <div className="page-heading"><div><p className="eyebrow">PROFILE</p><h1>用户设置</h1><p>这些资料会显示在你的公开记录旁，不会展示邮箱。</p></div></div>
        {content}
      </div>
    </main>
  );
}
