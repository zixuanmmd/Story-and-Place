"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { getBrowserTimeZone } from "@/lib/time/local-date-time";
import {
  entryFormSchema,
  TIME_PRECISION_LABELS,
  type EntryFormValues,
} from "@/lib/validation/entry";
import { deriveFirstStoryTitle } from "@/lib/validation/onboarding";
import { tagInputSchema } from "@/lib/validation/tags";
import type { Coordinates } from "@/types/map";
import { StoryTemplatePicker } from "@/components/forms/story-template-picker";
import {
  addTemplateTag,
  applyStoryTemplateDefaults,
  getStoryTemplate,
  type StoryTemplateId,
} from "@/lib/templates/story-templates";

const EMOTION_SUGGESTIONS = ["孤独", "重逢", "成长", "遗憾", "失去", "希望", "恐惧"];

export function OnboardingEntryForm({
  coordinates,
  initialValues,
  initialTemplateId = null,
  onSave,
  onCancel,
}: {
  coordinates: Coordinates;
  initialValues?: EntryFormValues;
  initialTemplateId?: StoryTemplateId | null;
  onSave: (values: EntryFormValues, tagNames: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const form = useForm<EntryFormValues>({
    resolver: zodResolver(entryFormSchema),
    defaultValues: applyStoryTemplateDefaults(initialValues ? {
      ...initialValues,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    } : {
      title: "我的第一个故事",
      content: "",
      place_name: "",
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      time_precision: "date",
      time_value: "",
      occurred_timezone: getBrowserTimeZone(),
      visibility: "private",
      group_id: "",
      place_category_slug: "other",
      allow_comments: true,
      unlock_at: "",
    }, initialTemplateId),
  });
  const precision = useWatch({ control: form.control, name: "time_precision" });
  const content = useWatch({ control: form.control, name: "content" });
  const placeName = useWatch({ control: form.control, name: "place_name" });
  const [tagInput, setTagInput] = useState(() => addTemplateTag("", initialTemplateId));
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<StoryTemplateId | null>(initialTemplateId);
  const [tagError, setTagError] = useState<string | null>(null);

  const selectTemplate = (templateId: StoryTemplateId | null) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const current = form.getValues();
    const next = applyStoryTemplateDefaults(current, templateId);
    if (next.place_category_slug !== current.place_category_slug) {
      form.setValue("place_category_slug", next.place_category_slug, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    if (next.time_precision !== current.time_precision) {
      form.setValue("time_precision", next.time_precision, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    setTagInput((currentTags) => addTemplateTag(currentTags, templateId));
  };

  useEffect(() => {
    form.setValue("latitude", coordinates.latitude, { shouldValidate: true });
    form.setValue("longitude", coordinates.longitude, { shouldValidate: true });
  }, [coordinates, form]);

  useEffect(() => {
    form.setValue("title", deriveFirstStoryTitle(content, placeName));
  }, [content, form, placeName]);

  const timeInput = precision === "exact"
    ? { type: "datetime-local", placeholder: "" }
    : precision === "date"
      ? { type: "date", placeholder: "" }
      : precision === "month"
        ? { type: "month", placeholder: "" }
        : precision === "year"
          ? { type: "number", placeholder: "例如 2018" }
          : { type: "text", placeholder: "例如：大学毕业前的夏天" };

  const toggleEmotion = (emotion: string) => {
    const current = tagInput.split(/[，,]/).map((value) => value.trim()).filter(Boolean);
    const next = current.includes(emotion)
      ? current.filter((value) => value !== emotion)
      : [...current, emotion];
    setTagInput(next.join("，"));
    setTagError(null);
  };

  const submit = async (values: EntryFormValues) => {
    const tags = tagInputSchema.safeParse(tagInput);
    if (!tags.success) {
      setTagError(tags.error.issues[0]?.message ?? "标签格式无效。");
      return;
    }
    await onSave({ ...values, title: deriveFirstStoryTitle(values.content, values.place_name) }, tags.data);
  };

  return (
    <form className="entry-form onboarding-entry-form stack-form" onSubmit={form.handleSubmit(submit)} noValidate>
      <div className="form-title-row">
        <div><p className="eyebrow">STEP 2 · FIRST PLACE</p><h2>从这个地方开始</h2></div>
        <button className="icon-button" type="button" onClick={onCancel} aria-label="关闭首次故事表单">×</button>
      </div>
      <p className="onboarding-form-intro">不用一次写得完整。先留下地点、时间和你最想记住的那句话。</p>

      <StoryTemplatePicker value={selectedTemplateId} onChange={selectTemplate} />

      <div className="onboarding-coordinate" aria-label="已选择地点坐标">
        <span aria-hidden="true">⌖</span>
        <div><strong>已选择地图位置</strong><small>{coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</small></div>
      </div>
      <input type="hidden" {...form.register("latitude", { valueAsNumber: true })} />
      <input type="hidden" {...form.register("longitude", { valueAsNumber: true })} />
      <label>
        <span>地点名称</span>
        <input maxLength={200} placeholder="例如：外婆家的院子" {...form.register("place_name")} />
        {form.formState.errors.place_name ? <small>{form.formState.errors.place_name.message}</small> : null}
      </label>

      <div className="form-grid">
        <label>
          <span>时间表达 *</span>
          <select {...form.register("time_precision", { onChange: () => form.setValue("time_value", "") })}>
            {Object.entries(TIME_PRECISION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>发生时间 *</span>
          <input key={precision} type={timeInput.type} placeholder={timeInput.placeholder} min={precision === "year" ? 1 : undefined} max={precision === "year" ? 9999 : undefined} {...form.register("time_value")} />
          {form.formState.errors.time_value ? <small>{form.formState.errors.time_value.message}</small> : null}
        </label>
      </div>

      <label>
        <span>故事内容 *</span>
        <textarea
          rows={9}
          maxLength={5000}
          placeholder={
            getStoryTemplate(selectedTemplateId)?.contentPlaceholder
            ?? "这里发生过什么？为什么你还记得它？"
          }
          {...form.register("content")}
        />
        <span className="field-meta">{form.formState.errors.content?.message ?? `${content.length}/5000`}</span>
      </label>

      <details className="onboarding-advanced">
        <summary>稍后也可以完善标签、情绪和人物</summary>
        <div className="stack-form">
          <label><span>自动生成的故事标题</span><input maxLength={100} {...form.register("title")} /></label>
          <label><span>标签</span><input value={tagInput} maxLength={500} placeholder="例如：大学，老街" onChange={(event) => { setTagInput(event.target.value); setTagError(null); }} /><small>{tagError ?? "用逗号分隔，最多 10 个"}</small></label>
          <fieldset className="onboarding-emotions"><legend>此刻的情绪</legend><div>{EMOTION_SUGGESTIONS.map((emotion) => <button key={emotion} type="button" aria-pressed={tagInput.split(/[，,]/).map((value) => value.trim()).includes(emotion)} onClick={() => toggleEmotion(emotion)}>#{emotion}</button>)}</div></fieldset>
          <p className="field-meta">图片、引用和共同经历者不会被伪造成未实现的字段；创建完成后可继续编辑并邀请共同经历者。</p>
        </div>
      </details>

      <p className="privacy-note"><span aria-hidden="true">🔒</span>首次故事默认只对你和后来接受邀请的共同经历者可见，创建后可以调整。</p>
      <div className="form-actions"><button className="secondary-button" type="button" onClick={onCancel}>返回</button><button className="primary-button" type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "正在保存…" : "完成第一个故事"}</button></div>
    </form>
  );
}
