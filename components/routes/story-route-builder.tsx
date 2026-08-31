"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { AppHeader } from "@/components/navigation/app-header";
import { ProtectedState } from "@/components/layout/protected-state";
import { useAuth } from "@/components/providers/auth-provider";
import { listMyEntries } from "@/lib/data/entries";
import { listGroupEntries, listVisibleGroups } from "@/lib/data/groups";
import {
  getStoryRouteBySlug,
  listStoryRouteItems,
  saveStoryRoute,
} from "@/lib/data/story-routes";
import { getFriendlyError } from "@/lib/errors";
import {
  parseRouteSelectionDraft,
  storyRouteSchema,
  type StoryRouteValues,
} from "@/lib/validation/story-route";
import { PlaceCategoryIcon, getCategoryLabel } from "@/lib/categories/registry";
import type { Group, MapEntryWithProfile } from "@/types/database";
import type { StoryRouteItemWithEntry } from "@/types/database";
import { ROUTE_AUDIENCE_PRESENTATION } from "@/lib/privacy/presentation";
import { moveRouteItem, sortRouteItems } from "@/lib/routes/ordering";
import { recordProductEvent } from "@/lib/analytics/provider";

const BuilderRouteMap = dynamic(
  () => import("./story-route-map").then((module) => module.StoryRouteMap),
  { ssr: false, loading: () => <div className="map-loading">正在生成路线预览…</div> },
);

export function StoryRouteBuilder({ shareSlug }: { shareSlug?: string }) {
  const { user } = useAuth();
  return <StoryRouteBuilderForScope key={`${user?.id ?? "anon"}:${shareSlug ?? "new"}`} shareSlug={shareSlug} />;
}

function StoryRouteBuilderForScope({ shareSlug }: { shareSlug?: string }) {
  const { user, loading: authLoading, configured } = useAuth();
  const router = useRouter();
  const [ownEntries, setOwnEntries] = useState<MapEntryWithProfile[]>([]);
  const [groupEntries, setGroupEntries] = useState<MapEntryWithProfile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const form = useForm<StoryRouteValues>({
    resolver: zodResolver(storyRouteSchema),
    defaultValues: {
      id: null,
      title: "",
      description: "",
      visibility: "private",
      group_id: null,
      publish: false,
      items: [],
    },
  });
  const items = useFieldArray({ control: form.control, name: "items" });
  const visibility = useWatch({ control: form.control, name: "visibility" });
  const groupId = useWatch({ control: form.control, name: "group_id" });
  const watchedItems = useWatch({ control: form.control, name: "items" });
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null);

  const initialize = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const [ownResult, groupResult] = await Promise.all([
        listMyEntries(user.id),
        listVisibleGroups(user.id),
      ]);
      setOwnEntries(ownResult.entries);
      const joined = new Set(groupResult.memberships.map((membership) => membership.group_id));
      setGroups(groupResult.groups.filter((group) => joined.has(group.id) && !group.archived_at));

      if (shareSlug) {
        const route = await getStoryRouteBySlug(shareSlug);
        if (!route || route.created_by !== user.id || route.archived_at) {
          setStatus("这条路线不存在，或你不能编辑它。");
          return;
        }
        const routeItems = await listStoryRouteItems(route.id);
        form.reset({
          id: route.id,
          title: route.title,
          description: route.description,
          visibility: route.visibility,
          group_id: route.group_id,
          publish: Boolean(route.published_at),
          items: routeItems.map((item) => ({
            entry_id: item.entry_id,
            position: item.position,
            note: item.note,
          })),
        });
      } else {
        const selected = parseRouteSelectionDraft(
          sessionStorage.getItem("story-route-selection-v1"),
        );
        sessionStorage.removeItem("story-route-selection-v1");
        const allowedItems = selected
          .filter((id) => ownResult.entries.some((entry) => entry.id === id))
          .map((entryId, index) => ({ entry_id: entryId, position: index + 1, note: "" }));
        items.replace(sortRouteItems(allowedItems, ownResult.entries, "event-time"));
      }
    } catch (error) {
      setStatus(getFriendlyError(error, "路线编辑器暂时无法加载。请确认最新 migration 已执行。"));
    } finally {
      setLoading(false);
    }
  }, [form, items, shareSlug, user]);

  useEffect(() => {
    if (authLoading) return;
    const timer = window.setTimeout(() => void initialize(), 0);
    return () => window.clearTimeout(timer);
  }, [authLoading, initialize]);

  useEffect(() => {
    if (visibility !== "group") {
      if (groupId) {
        const timer = window.setTimeout(
          () => form.setValue("group_id", null, { shouldValidate: true }),
          0,
        );
        return () => window.clearTimeout(timer);
      }
      return;
    }
    if (!groupId) return;
    let active = true;
    void listGroupEntries(groupId, 200)
      .then((result) => {
        if (active) setGroupEntries(result.entries);
      })
      .catch((error) => {
        if (active) setStatus(getFriendlyError(error, "群组记录暂时无法读取。"));
      });
    return () => {
      active = false;
    };
  }, [form, groupId, visibility]);

  const choices = useMemo(() => {
    const merged = new Map<string, MapEntryWithProfile>();
    for (const entry of ownEntries) merged.set(entry.id, entry);
    if (visibility === "group") {
      for (const entry of groupEntries) merged.set(entry.id, entry);
    }
    return [...merged.values()].filter((entry) => {
      if (visibility === "public") return entry.visibility === "public";
      if (visibility === "group") {
        return entry.visibility === "public"
          ? entry.user_id === user?.id
          : entry.visibility === "group" && entry.group_id === groupId;
      }
      return entry.user_id === user?.id;
    });
  }, [groupEntries, groupId, ownEntries, user, visibility]);
  const selectedIds = new Set(items.fields.map((item) => item.entry_id));
  const entryById = useMemo(() => new Map(
    [...ownEntries, ...groupEntries].map((entry) => [entry.id, entry]),
  ), [groupEntries, ownEntries]);

  const add = (entryId: string) => {
    if (items.fields.length >= 200 || selectedIds.has(entryId)) return;
    items.append({ entry_id: entryId, position: items.fields.length + 1, note: "" });
  };
  const remove = (index: number) => {
    const next = form.getValues("items").filter((_, itemIndex) => itemIndex !== index);
    items.replace(next.map((item, itemIndex) => ({ ...item, position: itemIndex + 1 })));
  };
  const move = (from: number, to: number) => {
    items.replace(moveRouteItem(form.getValues("items"), from, to));
  };
  const autoSort = (mode: "event-time" | "created-time") => {
    items.replace(sortRouteItems(
      form.getValues("items"),
      [...ownEntries, ...groupEntries],
      mode,
    ));
  };
  const previewItems = useMemo(() => (watchedItems ?? []).map((item) => ({
    id: `preview-${item.entry_id}`,
    route_id: "preview",
    entry_id: item.entry_id,
    position: item.position,
    note: item.note,
    created_at: "",
    map_entries: entryById.get(item.entry_id) ?? null,
  })) as StoryRouteItemWithEntry[], [entryById, watchedItems]);

  const submit = async (values: StoryRouteValues) => {
    setStatus(null);
    try {
      const routeId = await saveStoryRoute(values);
      if (!shareSlug) {
        recordProductEvent("route_created", {
          source: "route-builder",
          content_type: "route",
          visibility: values.visibility,
        });
      }
      router.push(`/routes?created=${encodeURIComponent(routeId)}`);
    } catch (error) {
      setStatus(getFriendlyError(error, "路线保存失败，请检查节点权限后重试。"));
    }
  };

  return (
    <main className="content-page route-builder-page">
      <AppHeader />
      <div className="content-container">
        <div className="page-heading"><div><p className="eyebrow">CURATE A JOURNEY</p><h1>{shareSlug ? "编辑故事路线" : "创建故事路线"}</h1><p>路线只保存原记录的引用和顺序，不复制地点、正文或坐标。</p></div><Link href="/routes">返回路线列表</Link></div>
        {!configured ? <ProtectedState kind="config" /> : authLoading ? <ProtectedState kind="loading" /> : !user ? <ProtectedState kind="signed-out" nextPath={shareSlug ? `/routes/${shareSlug}/edit` : "/routes/new"} signedOutDescription="登录后可以从已有地点故事中整理一条故事路线。" /> : loading ? <div className="content-state" role="status">正在准备可用记录…</div> : (
          <form className="route-builder-layout" onSubmit={form.handleSubmit(submit)} noValidate>
            <section className="route-builder-settings">
              <label><span>路线标题 *</span><input maxLength={100} {...form.register("title")} />{form.formState.errors.title ? <small>{form.formState.errors.title.message}</small> : null}</label>
              <label><span>路线说明</span><textarea rows={5} maxLength={2000} {...form.register("description")} />{form.formState.errors.description ? <small>{form.formState.errors.description.message}</small> : null}</label>
              <fieldset className="visibility-fieldset"><legend>谁可以看到这条路线？</legend>
                <label><input type="radio" value="private" {...form.register("visibility")} /><span><b aria-hidden="true">{ROUTE_AUDIENCE_PRESENTATION.private.glyph}</b><strong>{ROUTE_AUDIENCE_PRESENTATION.private.label}</strong><small>{ROUTE_AUDIENCE_PRESENTATION.private.description}</small></span></label>
                <label><input type="radio" value="group" {...form.register("visibility")} /><span><b aria-hidden="true">{ROUTE_AUDIENCE_PRESENTATION.group.glyph}</b><strong>{ROUTE_AUDIENCE_PRESENTATION.group.label}</strong><small>{ROUTE_AUDIENCE_PRESENTATION.group.description}</small></span></label>
                <label><input type="radio" value="public" {...form.register("visibility")} /><span><b aria-hidden="true">{ROUTE_AUDIENCE_PRESENTATION.public.glyph}</b><strong>{ROUTE_AUDIENCE_PRESENTATION.public.label}</strong><small>{ROUTE_AUDIENCE_PRESENTATION.public.description}</small></span></label>
              </fieldset>
              {visibility === "group" ? <label><span>所属群组 *</span><select value={groupId ?? ""} onChange={(event) => form.setValue("group_id", event.target.value || null, { shouldValidate: true })}><option value="">请选择群组</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>{form.formState.errors.group_id ? <small>{form.formState.errors.group_id.message}</small> : null}</label> : null}
              <label className="check-row"><input type="checkbox" {...form.register("publish")} />立即发布（至少 2 个节点）</label>
              {form.formState.errors.items?.message ? <div className="inline-error">{form.formState.errors.items.message}</div> : null}
              {status ? <div className="inline-error" role="alert">{status}</div> : null}
              <div className="record-actions"><button className="primary-button" type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "保存中…" : "保存路线"}</button><Link className="secondary-button nav-link" href="/routes">取消</Link></div>
            </section>

            <section className="route-entry-picker">
              <h2>可选记录</h2>
              <p>当前有 {choices.length} 条符合所选阅读范围。群组路线可以使用本群组成员发布的群组记录。</p>
              <div className="route-choice-list">
                {choices.map((entry) => <button key={entry.id} type="button" disabled={selectedIds.has(entry.id) || items.fields.length >= 200} onClick={() => add(entry.id)}><PlaceCategoryIcon category={entry.place_category_slug} /><span><strong>{entry.title}</strong><small>{entry.time_label} · {getCategoryLabel(entry.place_category_slug)}</small></span><span>{selectedIds.has(entry.id) ? "已加入" : "加入"}</span></button>)}
              </div>
            </section>

            <section className="route-order-editor">
              <div className="section-heading"><h2>路线顺序 · {items.fields.length}/200</h2><div className="record-actions"><button type="button" onClick={() => autoSort("event-time")}>按事件时间</button><button type="button" onClick={() => autoSort("created-time")}>按创建时间</button></div></div>
              {previewItems.length ? <div className="route-builder-preview"><BuilderRouteMap items={previewItems} selectedItemId={selectedPreviewId} onSelect={(item) => setSelectedPreviewId(item.id)} onTileError={() => setStatus("路线预览地图瓦片加载失败。")} /></div> : null}
              {items.fields.map((field, index) => {
                const entry = entryById.get(field.entry_id);
                return (
                  <article key={field.id} className="route-order-row">
                    <span className="route-order-number">{index + 1}</span>
                    <div><strong>{entry?.title ?? "节点暂不可用"}</strong><small>{entry?.time_label ?? "原记录权限可能已变化"}</small></div>
                    <label><span className="sr-only">节点注记</span><input maxLength={500} placeholder="可选路线注记" {...form.register(`items.${index}.note`)} /></label>
                    <div className="route-order-actions"><button type="button" aria-label="上移" disabled={index === 0} onClick={() => move(index, index - 1)}>↑</button><button type="button" aria-label="下移" disabled={index === items.fields.length - 1} onClick={() => move(index, index + 1)}>↓</button><button type="button" aria-label="移除" onClick={() => remove(index)}>×</button></div>
                    <input type="hidden" {...form.register(`items.${index}.entry_id`)} />
                    <input type="hidden" value={index + 1} {...form.register(`items.${index}.position`, { valueAsNumber: true })} />
                  </article>
                );
              })}
              {!items.fields.length ? <div className="small-empty">从左侧选择故事，至少一个节点可保存草稿。</div> : null}
            </section>
          </form>
        )}
      </div>
    </main>
  );
}
