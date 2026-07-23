"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  entryFormSchema,
  TIME_PRECISION_LABELS,
  type EntryFormValues,
} from "@/lib/validation/entry";
import type { MapEntry } from "@/types/database";
import type { Coordinates } from "@/types/map";
import { entryToFormValues } from "@/lib/validation/entry";
import { getBrowserTimeZone } from "@/lib/time/local-date-time";
import { PLACE_CATEGORIES, PlaceCategoryIcon } from "@/lib/categories/registry";
import { useAuth } from "@/components/providers/auth-provider";
import { listVisibleGroups } from "@/lib/data/groups";
import type { Group } from "@/types/database";

type EntryFormProps = {
  mode: "create" | "edit";
  coordinates?: Coordinates;
  initialValues?: EntryFormValues;
  entry?: MapEntry;
  onSave: (values: EntryFormValues) => Promise<void>;
  onCancel: () => void;
  initialGroupId?: string;
};

function getDefaults(
  coordinates?: Coordinates,
  entry?: MapEntry,
  initialValues?: EntryFormValues,
  initialGroupId?: string,
): EntryFormValues {
  if (entry) return entryToFormValues(entry);
  if (initialValues) return initialValues;
  return {
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
  };
}

export function EntryForm({
  mode,
  coordinates,
  initialValues,
  entry,
  onSave,
  onCancel,
  initialGroupId,
}: EntryFormProps) {
  const form = useForm<EntryFormValues>({
    resolver: zodResolver(entryFormSchema),
    defaultValues: getDefaults(coordinates, entry, initialValues, initialGroupId),
  });
  const precision = useWatch({ control: form.control, name: "time_precision" });
  const titleValue = useWatch({ control: form.control, name: "title" });
  const contentValue = useWatch({ control: form.control, name: "content" });
  const visibility = useWatch({ control: form.control, name: "visibility" });
  const category = useWatch({ control: form.control, name: "place_category_slug" });
  const { user } = useAuth();
  const [groupChoices, setGroupChoices] = useState<Group[]>([]);
  const [groupError, setGroupError] = useState<string | null>(null);

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
      onSubmit={form.handleSubmit(onSave)}
      noValidate
    >
      <div className="form-title-row">
        <div>
          <p className="eyebrow">{mode === "create" ? "新建记录" : "编辑记录"}</p>
          <h2>{mode === "create" ? "这里发生过什么？" : "修改这段故事"}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onCancel} aria-label="关闭表单">
          ×
        </button>
      </div>

      <label>
        <span>标题 *</span>
        <input maxLength={100} placeholder="给这段记忆一个名字" {...form.register("title")} />
        <span className="field-meta">
          {form.formState.errors.title?.message ?? `${titleValue.length}/100`}
        </span>
      </label>

      <label>
        <span>事件内容 *</span>
        <textarea
          rows={7}
          maxLength={5000}
          placeholder="写下在这个地点、这个时间发生的事……"
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

      <label>
        <span>地点名称</span>
        <input maxLength={200} placeholder="例如：外婆家的院子" {...form.register("place_name")} />
        {form.formState.errors.place_name ? (
          <small>{form.formState.errors.place_name.message}</small>
        ) : null}
      </label>

      <fieldset className="category-fieldset">
        <legend>地点分类 *</legend>
        <div className="category-choice-grid">
          {PLACE_CATEGORIES.map((item) => (
            <label key={item.slug} className={category === item.slug ? "category-choice is-selected" : "category-choice"}>
              <input type="radio" value={item.slug} {...form.register("place_category_slug")} />
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
            step="any"
            {...form.register("longitude", { valueAsNumber: true })}
          />
          {form.formState.errors.longitude ? (
            <small>{form.formState.errors.longitude.message}</small>
          ) : null}
        </label>
      </div>

      <fieldset className="visibility-fieldset">
        <legend>可见性 *</legend>
        <label>
          <input type="radio" value="public" {...form.register("visibility")} />
          <span><b aria-hidden="true">◉</b><strong>公开</strong><small>所有访客都可以在地图上看到</small></span>
        </label>
        <label>
          <input type="radio" value="private" {...form.register("visibility")} />
          <span><b aria-hidden="true">▣</b><strong>私密</strong><small>只有你登录后可以看到</small></span>
        </label>
        <label>
          <input type="radio" value="group" {...form.register("visibility")} />
          <span><b aria-hidden="true">◇</b><strong>群组</strong><small>只有所选群组的有效成员可见</small></span>
        </label>
      </fieldset>

      {visibility === "group" ? (
        <label>
          <span>发布到群组 *</span>
          <select {...form.register("group_id")}>
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

      {visibility !== "private" ? (
        <label className="check-row">
          <input type="checkbox" {...form.register("allow_comments")} />
          <span>允许登录用户评论</span>
        </label>
      ) : null}

      <div className="form-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>
          取消
        </button>
        <button className="primary-button" type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "正在保存…" : mode === "create" ? "创建记录" : "保存修改"}
        </button>
      </div>
    </form>
  );
}
