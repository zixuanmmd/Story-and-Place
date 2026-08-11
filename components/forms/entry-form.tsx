"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  entryFormSchema,
  TIME_PRECISION_LABELS,
  type EntryFormValues,
} from "@/lib/validation/entry";
import type {
  EntryEditableField,
  EntryDraft,
  MapEntryWithProfile,
} from "@/types/database";
import type { Coordinates } from "@/types/map";
import { entryToFormValues } from "@/lib/validation/entry";
import { getBrowserTimeZone } from "@/lib/time/local-date-time";
import { PLACE_CATEGORIES, PlaceCategoryIcon } from "@/lib/categories/registry";
import { useAuth } from "@/components/providers/auth-provider";
import { listVisibleGroups } from "@/lib/data/groups";
import type { Group } from "@/types/database";
import {
  formatEntryTagInput,
  tagInputSchema,
} from "@/lib/validation/tags";
import {
  formatUnlockAtForInput,
  unlockInputToIso,
} from "@/lib/time/time-capsule";
import { StoryTemplatePicker } from "@/components/forms/story-template-picker";
import {
  addTemplateTag,
  applyStoryTemplateDefaults,
  getStoryTemplate,
  type StoryTemplateId,
} from "@/lib/templates/story-templates";
import { ENTRY_AUDIENCE_PRESENTATION } from "@/lib/privacy/presentation";
import { createEntryDraftPayload } from "@/lib/validation/entry-draft";
import { useEntryAutosave } from "@/hooks/use-entry-autosave";
import type { EntryDraftRef } from "@/lib/data/entry-drafts";

type EntryFormProps = {
  mode: "create" | "edit";
  coordinates?: Coordinates;
  initialValues?: EntryFormValues;
  initialDraft?: EntryDraft;
  entry?: MapEntryWithProfile;
  onSave: (
    values: EntryFormValues,
    tagNames: string[],
    draft: EntryDraftRef | null,
  ) => Promise<void>;
  onCancel: () => void;
  onDraftCreated?: (id: string) => void;
  initialGroupId?: string;
  initialTemplateId?: StoryTemplateId | null;
  isOwner?: boolean;
  editableFields?: EntryEditableField[];
};

function getDefaults(
  coordinates?: Coordinates,
  entry?: MapEntryWithProfile,
  initialValues?: EntryFormValues,
  initialGroupId?: string,
  initialTemplateId?: StoryTemplateId | null,
): EntryFormValues {
  if (initialValues) return initialValues;
  if (entry) return entryToFormValues(entry);
  const defaults: EntryFormValues = {
    title: "",
    content: "",
    place_name: "",
    latitude: coordinates?.latitude ?? 0,
    longitude: coordinates?.longitude ?? 0,
    time_precision: "date",
    time_value: "",
    occurred_timezone: getBrowserTimeZone(),
    visibility: initialGroupId ? "group" : "private",
    group_id: initialGroupId ?? "",
    place_category_slug: "other",
    allow_comments: true,
    unlock_at: "",
  };
  return applyStoryTemplateDefaults(defaults, initialTemplateId ?? null);
}

export function EntryForm({
  mode,
  coordinates,
  initialValues,
  initialDraft,
  entry,
  onSave,
  onCancel,
  onDraftCreated,
  initialGroupId,
  initialTemplateId = null,
  isOwner = true,
  editableFields,
}: EntryFormProps) {
  const form = useForm<EntryFormValues>({
    resolver: zodResolver(entryFormSchema),
    defaultValues: getDefaults(
      coordinates,
      entry,
      initialValues,
      initialGroupId,
      mode === "create" ? initialTemplateId : null,
    ),
  });
  const precision = useWatch({ control: form.control, name: "time_precision" });
  const titleValue = useWatch({ control: form.control, name: "title" });
  const contentValue = useWatch({ control: form.control, name: "content" });
  const visibility = useWatch({ control: form.control, name: "visibility" });
  const category = useWatch({ control: form.control, name: "place_category_slug" });
  const watchedValues = useWatch({ control: form.control });
  const { user } = useAuth();
  const [groupChoices, setGroupChoices] = useState<Group[]>([]);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState(() =>
    initialDraft
      ? initialDraft.tag_input
      : entry
      ? formatEntryTagInput(entry)
      : addTemplateTag("", mode === "create" ? initialTemplateId : null),
  );
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<StoryTemplateId | null>(mode === "create" ? initialTemplateId : null);
  const [minimumUnlockAt] = useState(() =>
    formatUnlockAtForInput(new Date().toISOString()),
  );
  const [tagError, setTagError] = useState<string | null>(null);
  const draftPayload = useMemo(
    () => createEntryDraftPayload(watchedValues as EntryFormValues),
    [watchedValues],
  );
  const autosaveEnabled = Boolean(user) && (mode === "create" || isOwner);
  const autosave = useEntryAutosave({
    enabled: autosaveEnabled,
    sourceEntryId: mode === "edit" ? entry?.id ?? null : null,
    payload: draftPayload,
    tagInput,
    initialDraft,
    onDraftCreated,
  });
  const canEdit = (field: EntryEditableField) =>
    mode === "create" || isOwner || editableFields?.includes(field);
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
  const submit = async (values: EntryFormValues) => {
    setTagError(null);
    const nextUnlockAt = values.unlock_at
      ? unlockInputToIso(values.unlock_at)
      : null;
    if (
      nextUnlockAt &&
      nextUnlockAt !== entry?.unlock_at &&
      new Date(nextUnlockAt).getTime() <= new Date(minimumUnlockAt).getTime()
    ) {
      form.setError("unlock_at", {
        type: "validate",
        message: "新的解锁时间必须晚于现在。",
      });
      return;
    }
    const result = tagInputSchema.safeParse(tagInput);
    if (!result.success) {
      setTagError(result.error.issues[0]?.message ?? "标签格式无效。");
      return;
    }
    try {
      const draft = await autosave.flush();
      await onSave(values, result.data, draft);
    } catch {
      setTagError(autosave.message ?? "草稿尚未安全保存，请稍后重试。");
    }
  };

  const cancel = () => {
    void autosave.flush().catch(() => undefined).then(onCancel);
  };

  useEffect(() => {
    if (!user) return;
    let active = true;
    void listVisibleGroups(user.id)
      .then(({ groups, memberships }) => {
        if (!active) return;
        const joined = new Set(memberships.map((membership) => membership.group_id));
        setGroupChoices(groups.filter((group) => joined.has(group.id) && !group.archived_at));
      })
      .catch(() => {
        if (active) setGroupError("暂时无法读取你的群组。");
      });
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (visibility !== "group" && form.getValues("group_id")) {
      form.setValue("group_id", "", { shouldValidate: true });
    }
  }, [form, visibility]);

  useEffect(() => {
    if (mode === "create" && coordinates) {
      form.setValue("latitude", coordinates.latitude, { shouldValidate: true });
      form.setValue("longitude", coordinates.longitude, { shouldValidate: true });
    }
  }, [coordinates, form, mode]);

  const timeInput = (() => {
    if (precision === "exact") return { type: "datetime-local", placeholder: "" };
    if (precision === "date") return { type: "date", placeholder: "" };
    if (precision === "month") return { type: "month", placeholder: "" };
    if (precision === "year") return { type: "number", placeholder: "例如 2008" };
    return { type: "text", placeholder: "例如：2008 年夏天、童年时期" };
  })();

  return (
    <form
      className="entry-form stack-form"
      onSubmit={form.handleSubmit(submit)}
      noValidate
    >
      <div className="form-title-row">
        <div>
          <p className="eyebrow">{mode === "create" ? "新建记录" : "编辑记录"}</p>
          <h2>{mode === "create" ? "这里发生过什么？" : "修改这段故事"}</h2>
        </div>
        <button className="icon-button" type="button" onClick={cancel} aria-label="关闭表单">
          ×
        </button>
      </div>

      {mode === "create" ? (
        <StoryTemplatePicker value={selectedTemplateId} onChange={selectTemplate} />
      ) : null}

      <label>
        <span>标题 *</span>
        <input disabled={!canEdit("title")} maxLength={100} placeholder="给这段记忆一个名字" {...form.register("title")} />
        <span className="field-meta">
          {form.formState.errors.title?.message ?? `${titleValue.length}/100`}
        </span>
      </label>

      <label>
        <span>事件内容 *</span>
        <textarea
          rows={7}
          disabled={!canEdit("content")}
          maxLength={5000}
          placeholder={
            getStoryTemplate(selectedTemplateId)?.contentPlaceholder
            ?? "写下在这个地点、这个时间发生的事……"
          }
          {...form.register("content")}
        />
        <span className="field-meta">
          {form.formState.errors.content?.message ?? `${contentValue.length}/5000`}
        </span>
      </label>

      <div className="form-grid">
        <label>
          <span>时间精度 *</span>
          <select
            disabled={!canEdit("time")}
            {...form.register("time_precision", {
              onChange: (event) => {
                form.setValue("time_value", "", { shouldValidate: false });
                if (
                  event.target.value === "exact" &&
                  !form.getValues("occurred_timezone")
                ) {
                  form.setValue("occurred_timezone", getBrowserTimeZone());
                }
              },
            })}
          >
            {Object.entries(TIME_PRECISION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>发生时间 *</span>
          <input
            key={precision}
            type={timeInput.type}
            disabled={!canEdit("time")}
            placeholder={timeInput.placeholder}
            min={precision === "year" ? 1 : undefined}
            max={precision === "year" ? 9999 : undefined}
            {...form.register("time_value")}
          />
          {form.formState.errors.time_value ? (
            <small>{form.formState.errors.time_value.message}</small>
          ) : null}
        </label>
      </div>

      {precision === "exact" ? (
        <label>
          <span>事件当地时区（可选）</span>
          <input
            placeholder="例如 Asia/Shanghai；不确定可留空"
            disabled={!canEdit("time")}
            maxLength={100}
            {...form.register("occurred_timezone")}
          />
          {form.formState.errors.occurred_timezone ? (
            <small>{form.formState.errors.occurred_timezone.message}</small>
          ) : (
            <span className="field-meta">
              当地时间会原样保存；只有明确填写时区时才记录时区语义。
            </span>
          )}
        </label>
      ) : null}

      {mode === "create" || isOwner ? (
        <label>
          <span>时间胶囊解锁时间（可选）</span>
          <input
            type="datetime-local"
            min={minimumUnlockAt}
            {...form.register("unlock_at")}
          />
          {form.formState.errors.unlock_at ? (
            <small>{form.formState.errors.unlock_at.message}</small>
          ) : (
            <span className="field-meta">
              设置后，解锁前只有你能看到；到达该时刻后自动恢复你选择的阅读范围。
            </span>
          )}
        </label>
      ) : null}

      <label>
        <span>地点名称</span>
        <input disabled={!canEdit("place")} maxLength={200} placeholder="例如：外婆家的院子" {...form.register("place_name")} />
        {form.formState.errors.place_name ? (
          <small>{form.formState.errors.place_name.message}</small>
        ) : null}
      </label>

      <fieldset className="category-fieldset">
        <legend>地点分类 *</legend>
        <div className="category-choice-grid">
          {PLACE_CATEGORIES.map((item) => (
            <label key={item.slug} className={category === item.slug ? "category-choice is-selected" : "category-choice"}>
              <input disabled={!canEdit("category")} type="radio" value={item.slug} {...form.register("place_category_slug")} />
              <PlaceCategoryIcon category={item.slug} />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
        {form.formState.errors.place_category_slug ? (
          <small>{form.formState.errors.place_category_slug.message}</small>
        ) : null}
      </fieldset>

      <div className="form-grid">
        <label>
          <span>纬度 *</span>
          <input
            type="number"
            disabled={!canEdit("location")}
            step="any"
            {...form.register("latitude", { valueAsNumber: true })}
          />
          {form.formState.errors.latitude ? (
            <small>{form.formState.errors.latitude.message}</small>
          ) : null}
        </label>
        <label>
          <span>经度 *</span>
          <input
            type="number"
            disabled={!canEdit("location")}
            step="any"
            {...form.register("longitude", { valueAsNumber: true })}
          />
          {form.formState.errors.longitude ? (
            <small>{form.formState.errors.longitude.message}</small>
          ) : null}
        </label>
      </div>

      <fieldset className="visibility-fieldset">
        <legend>谁可以看到？ *</legend>
        <label>
          <input disabled={mode === "edit" && !isOwner} type="radio" value="private" {...form.register("visibility")} />
          <span><b aria-hidden="true">{ENTRY_AUDIENCE_PRESENTATION.private.glyph}</b><strong>{ENTRY_AUDIENCE_PRESENTATION.private.label}</strong><small>{ENTRY_AUDIENCE_PRESENTATION.private.description}</small></span>
        </label>
        <label>
          <input disabled={mode === "edit" && !isOwner} type="radio" value="group" {...form.register("visibility")} />
          <span><b aria-hidden="true">{ENTRY_AUDIENCE_PRESENTATION.group.glyph}</b><strong>{ENTRY_AUDIENCE_PRESENTATION.group.label}</strong><small>{ENTRY_AUDIENCE_PRESENTATION.group.description}</small></span>
        </label>
        <label>
          <input disabled={mode === "edit" && !isOwner} type="radio" value="public" {...form.register("visibility")} />
          <span><b aria-hidden="true">{ENTRY_AUDIENCE_PRESENTATION.public.glyph}</b><strong>{ENTRY_AUDIENCE_PRESENTATION.public.label}</strong><small>{ENTRY_AUDIENCE_PRESENTATION.public.description}</small></span>
        </label>
      </fieldset>

      {visibility === "group" ? (
        <label>
          <span>发布到群组 *</span>
          <select disabled={mode === "edit" && !isOwner} {...form.register("group_id")}>
            <option value="">请选择群组</option>
            {groupChoices.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
          {form.formState.errors.group_id ? <small>{form.formState.errors.group_id.message}</small> : null}
          {groupError ? <small>{groupError}</small> : null}
          {!groupChoices.length && !groupError ? (
            <span className="field-meta">你需要先加入一个未归档群组。</span>
          ) : null}
        </label>
      ) : null}

      <label>
        <span>标签</span>
        <input
          disabled={!canEdit("tags")}
          value={tagInput}
          maxLength={500}
          placeholder="用逗号分隔，最多 10 个"
          onChange={(event) => {
            setTagInput(event.target.value);
            setTagError(null);
          }}
        />
        <span className="field-meta">
          {tagError ?? "例如：童年，老街，毕业旅行"}
        </span>
      </label>

      {visibility !== "private" ? (
        <label className="check-row">
          <input disabled={mode === "edit" && !isOwner} type="checkbox" {...form.register("allow_comments")} />
          <span>允许登录用户评论</span>
        </label>
      ) : null}

      <div className="form-actions">
        <div className={`draft-save-state draft-save-state--${autosave.status}`} role="status">
          {autosaveEnabled
            ? autosave.message ?? ({
                idle: "尚未保存草稿",
                pending: "等待自动保存…",
                saving: "正在保存草稿…",
                saved: "草稿已保存",
                error: "草稿保存失败",
                conflict: "草稿存在编辑冲突",
              }[autosave.status])
            : mode === "edit" && !isOwner
              ? "共同经历者的修改将在提交时保存，不生成个人草稿。"
              : null}
        </div>
        <button className="secondary-button" type="button" onClick={cancel}>
          取消
        </button>
        <button
          className="primary-button"
          type="submit"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "正在保存…" : mode === "create" ? "创建记录" : "保存修改"}
        </button>
      </div>
    </form>
  );
}
