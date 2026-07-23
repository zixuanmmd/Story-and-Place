"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { AppHeader } from "@/components/navigation/app-header";
import { ProtectedState } from "@/components/layout/protected-state";
import { useAuth } from "@/components/providers/auth-provider";
import { saveProfile } from "@/lib/data/profiles";
import { getFriendlyError } from "@/lib/errors";
import { profileSchema, type ProfileFormValues } from "@/lib/validation/profile";

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
      await saveProfile(user.id, values);
      await refreshProfile();
      setNotice("个人资料已保存。 ");
    } catch (error) {
      setNotice(getFriendlyError(error, "个人资料保存失败，请稍后重试。"));
    }
  });

  let content;
  if (!configured) content = <ProtectedState kind="config" />;
  else if (loading) content = <ProtectedState kind="loading" />;
  else if (!user) content = <ProtectedState kind="signed-out" />;
  else {
    content = (
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
