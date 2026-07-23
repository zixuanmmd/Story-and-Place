"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { groupFormSchema, type GroupFormValues } from "@/lib/validation/groups";

export function GroupForm({
  initialValues,
  submitLabel,
  onSubmit,
  canEditIdentity = true,
}: {
  initialValues?: GroupFormValues;
  submitLabel: string;
  onSubmit: (values: GroupFormValues) => Promise<void>;
  canEditIdentity?: boolean;
}) {
  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: initialValues ?? {
      name: "",
      slug: "",
      description: "",
      avatar_url: "",
      visibility: "public",
    },
  });
  return (
    <form className="stack-form narrative-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <label>
        <span>群组名称 *</span>
        <input maxLength={80} {...form.register("name")} />
        {form.formState.errors.name ? <small>{form.formState.errors.name.message}</small> : null}
      </label>
      <label>
        <span>群组地址 *</span>
        <input disabled={!canEditIdentity} maxLength={48} placeholder="例如 old-town-stories" {...form.register("slug")} />
        <span className="field-meta">只使用小写字母、数字和连字符。</span>
        {form.formState.errors.slug ? <small>{form.formState.errors.slug.message}</small> : null}
      </label>
      <label>
        <span>简介</span>
        <textarea rows={6} maxLength={2000} {...form.register("description")} />
        {form.formState.errors.description ? <small>{form.formState.errors.description.message}</small> : null}
      </label>
      <label>
        <span>头像 URL</span>
        <input type="url" maxLength={2048} {...form.register("avatar_url")} />
        {form.formState.errors.avatar_url ? <small>{form.formState.errors.avatar_url.message}</small> : null}
      </label>
      <fieldset className="visibility-fieldset">
        <legend>群组类型 *</legend>
        <label>
          <input disabled={!canEditIdentity} type="radio" value="public" {...form.register("visibility")} />
          <span><b aria-hidden="true">◉</b><strong>公开群组</strong><small>所有人可查看简介，登录用户可直接加入</small></span>
        </label>
        <label>
          <input disabled={!canEditIdentity} type="radio" value="private" {...form.register("visibility")} />
          <span><b aria-hidden="true">▣</b><strong>私密群组</strong><small>只有受邀并接受的成员可进入</small></span>
        </label>
      </fieldset>
      <button className="primary-button" type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "正在保存…" : submitLabel}
      </button>
    </form>
  );
}
