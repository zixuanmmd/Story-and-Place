"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { groupFormSchema, type GroupFormValues } from "@/lib/validation/groups";
import { GROUP_DISCOVERY_PRESENTATION } from "@/lib/privacy/presentation";

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
        <legend>谁可以发现并加入？ *</legend>
        <label>
          <input disabled={!canEditIdentity} type="radio" value="public" {...form.register("visibility")} />
          <span><b aria-hidden="true">{GROUP_DISCOVERY_PRESENTATION.public.glyph}</b><strong>{GROUP_DISCOVERY_PRESENTATION.public.label}</strong><small>{GROUP_DISCOVERY_PRESENTATION.public.description}</small></span>
        </label>
        <label>
          <input disabled={!canEditIdentity} type="radio" value="private" {...form.register("visibility")} />
          <span><b aria-hidden="true">{GROUP_DISCOVERY_PRESENTATION.private.glyph}</b><strong>{GROUP_DISCOVERY_PRESENTATION.private.label}</strong><small>{GROUP_DISCOVERY_PRESENTATION.private.description}</small></span>
        </label>
      </fieldset>
      <button className="primary-button" type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "正在保存…" : submitLabel}
      </button>
    </form>
  );
}
