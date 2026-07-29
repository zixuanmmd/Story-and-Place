"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { useAuth } from "@/components/providers/auth-provider";
import { useScopedEntryQuery } from "@/hooks/use-scoped-entry-query";
import { EntryForm } from "@/components/forms/entry-form";
import { EntryDetail } from "@/components/entries/entry-detail";
import { FilterPanel } from "@/components/entries/filter-panel";
import { ConfirmDialog } from "@/components/entries/confirm-dialog";
import { MapErrorBoundary } from "@/components/map/map-error-boundary";
import {
  createEntry,
  deleteEntry,
  getEntryById,
  listVisibleEntries,
  updateEntry,
  updateEntryVisibility,
} from "@/lib/data/entries";
import {
  DEFAULT_ENTRY_FILTERS,
  filterEntries,
  type EntryFilters,
} from "@/lib/data/filters";
import { getFriendlyError, reportOperationalError } from "@/lib/errors";
import {
  getAuthDataScope,
  getRenderableSelectedEntry,
  type AuthDataScope,
} from "@/lib/data/scoped-query";
import { boundsMatch, coordinatesMatch } from "@/lib/map/view-state";
import { parseEntryDraft, serializeEntryDraft } from "@/lib/drafts/entry-draft";
import type { EntryFormValues } from "@/lib/validation/entry";
import type { MapEntryWithProfile } from "@/types/database";
import type { Group } from "@/types/database";
import type { Coordinates, MapBoundsValue } from "@/types/map";
import { settleAction } from "@/lib/actions/settle-action";
import { listVisibleGroups } from "@/lib/data/groups";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  canRenderGroupEntry,
  filterEntriesForActiveGroups,
} from "@/lib/data/group-scope";
import {
  getMyEntryParticipation,
  getParticipantEditableFields,
} from "@/lib/data/entry-collaboration";
import type { EntryParticipantWithProfile } from "@/types/database";
import { useEntryRealtime } from "@/hooks/use-entry-realtime";

const MapCanvas = dynamic(
  () => import("@/components/map/map-canvas").then((module) => module.MapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="map-loading" role="status">
        <span className="loading-dot" />正在展开地图…
      </div>
    ),
  },
);

type EditorState =
  | { mode: "create"; coordinates: Coordinates; initialValues?: EntryFormValues }
  | { mode: "edit"; entry: MapEntryWithProfile }
  | null;

type MobilePanel = "filters" | "details" | "editor" | null;
const DRAFT_STORAGE_KEY = "story-map-pending-entry";

export function MapExperience() {
  const { user, loading: authLoading, configured, authError } = useAuth();
  const scope = getAuthDataScope(user?.id);

  return (
    <MapExperienceForScope
      key={scope}
      scope={scope}
      user={user}
      authLoading={authLoading}
      configured={configured}
      authError={authError}
    />
  );
}

type MapExperienceForScopeProps = {
  scope: AuthDataScope;
  user: User | null;
  authLoading: boolean;
  configured: boolean;
  authError: string | null;
};

function MapExperienceForScope({
  scope,
  user,
  authLoading,
  configured,
  authError,
}: MapExperienceForScopeProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledUrlEntry = useRef<string | null>(null);
  const handledGroupDraft = useRef<string | null>(null);
  const restoredDraftForUser = useRef<string | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<MapEntryWithProfile | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [deleteTarget, setDeleteTarget] = useState<MapEntryWithProfile | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [filters, setFilters] = useState<EntryFilters>(DEFAULT_ENTRY_FILTERS);
  const [bounds, setBounds] = useState<MapBoundsValue | null>(null);
  const [viewCenter, setViewCenter] = useState<Coordinates>({ latitude: 25, longitude: 15 });
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [groupOptions, setGroupOptions] = useState<Array<Pick<Group, "id" | "name">>>([]);
  const [activeGroupIds, setActiveGroupIds] = useState<string[]>([]);
  const [groupsReady, setGroupsReady] = useState(false);
  const [myParticipation, setMyParticipation] =
    useState<EntryParticipantWithProfile | null>(null);

  const loadVisible = useCallback(() => listVisibleEntries(), []);
  const entryQuery = useScopedEntryQuery<MapEntryWithProfile>({
    scope,
    enabled: configured && !authLoading,
    load: loadVisible,
    errorFallback: "记录加载失败，请稍后重试。",
  });
  const { entries, loading, reload: reloadEntries } = entryQuery;
  const loadError = configured
    ? entryQuery.error
    : "Supabase 尚未配置。请填写环境变量后刷新页面。";

  const refreshEntryData = useCallback(() => {
    void reloadEntries();
    if (selectedEntry) {
      void getEntryById(selectedEntry.id).then((entry) => {
        setSelectedEntry(entry);
        if (!entry) {
          setEditor(null);
          setMobilePanel(null);
        }
      }).catch(() => {
        setSelectedEntry(null);
        setEditor(null);
      });
    }
  }, [reloadEntries, selectedEntry]);
  useEntryRealtime({
    enabled: configured,
    scopeKey: `map-${user?.id ?? "anon"}`,
    includeCollaboration: Boolean(user),
    onChange: refreshEntryData,
  });

  useEffect(() => {
    if (!user || !configured) return;
    let current = true;
    void listVisibleGroups(user.id)
      .then(({ groups, memberships }) => {
        if (!current) return;
        const joined = new Set(memberships.map((membership) => membership.group_id));
        setActiveGroupIds([...joined]);
        setGroupOptions(
          groups
            .filter((group) => joined.has(group.id) && !group.archived_at)
            .map(({ id, name }) => ({ id, name })),
        );
        setGroupsReady(true);
      })
      .catch(() => {
        if (current) {
          setGroupOptions([]);
          setGroupsReady(true);
        }
      });
    return () => {
      current = false;
    };
  }, [configured, user]);

  useEffect(() => {
    if (!user || !configured) return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`membership-map-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "group_members",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const membership = payload.new as Record<string, unknown>;
          const groupId = typeof membership.group_id === "string" ? membership.group_id : null;
          if (!groupId) return;
          if (membership.status !== "active") {
            setActiveGroupIds((current) => current.filter((id) => id !== groupId));
            setGroupOptions((current) => current.filter((group) => group.id !== groupId));
            setSelectedEntry((current) => current?.group_id === groupId ? null : current);
            setEditor((current) =>
              current?.mode === "edit" && current.entry.group_id === groupId ? null : current,
            );
          } else {
            void reloadEntries();
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [configured, reloadEntries, user]);

  useEffect(() => {
    if (authLoading || loading || !configured) return;
    const requestedId = searchParams.get("entry");
    if (!requestedId || handledUrlEntry.current === requestedId) return;
    handledUrlEntry.current = requestedId;

    const selectRequestedEntry = async () => {
      try {
        const localEntry = entries.find((entry) => entry.id === requestedId);
        const entry = localEntry ?? (await getEntryById(requestedId));
        if (!entry) {
          setStatus("这条记录不存在，或你没有权限查看它。");
          return;
        }
        if (!localEntry) entryQuery.upsert(entry);
        setSelectedEntry(entry);
        setMobilePanel("details");
        const participation = user && entry.user_id !== user.id
          ? await getMyEntryParticipation(entry.id, user.id)
          : null;
        setMyParticipation(participation);
        if (searchParams.get("edit") === "1") {
          if (
            entry.user_id === user?.id
            || (participation?.editable_fields.length ?? 0) > 0
          ) {
            setEditor({ mode: "edit", entry });
            setMobilePanel("editor");
          } else {
            setStatus("你没有这条记录的字段编辑权限。");
          }
        }
      } catch (error) {
        setStatus(getFriendlyError(error, "无法打开这条记录。"));
      }
    };
    void selectRequestedEntry();
  }, [authLoading, configured, entries, entryQuery, loading, searchParams, user]);

  useEffect(() => {
    if (!user || restoredDraftForUser.current === user.id) return;
    restoredDraftForUser.current = user.id;
    const stored = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!stored) return;
    const values = parseEntryDraft(stored);
    if (!values) {
      window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }
    const result = { latitude: values.latitude, longitude: values.longitude };
    const timer = window.setTimeout(() => {
      setEditor({ mode: "create", coordinates: result, initialValues: values });
      setMobilePanel("editor");
      setStatus("登录成功，刚才未提交的记录已恢复。请确认后保存。");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(null), 5000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const membershipSafeEntries = useMemo(
    () => filterEntriesForActiveGroups(entries, activeGroupIds),
    [activeGroupIds, entries],
  );
  const filteredEntries = useMemo(
    () => filterEntries(membershipSafeEntries, filters, user?.id ?? null, bounds),
    [bounds, filters, membershipSafeEntries, user?.id],
  );
  const selectedForIdentity = getRenderableSelectedEntry(
    selectedEntry,
    user?.id ?? null,
  );
  const renderableSelectedEntry =
    canRenderGroupEntry(selectedForIdentity, activeGroupIds)
      ? selectedForIdentity
      : null;

  const startCreate = useCallback((coordinates: Coordinates) => {
    setSelectedEntry(null);
    setEditor({ mode: "create", coordinates });
    setMobilePanel("editor");
    setStatus(null);
  }, []);

  useEffect(() => {
    const requestedGroupId = searchParams.get("group");
    if (!requestedGroupId || handledGroupDraft.current === requestedGroupId) {
      return;
    }
    if (!user || !groupsReady) return;

    handledGroupDraft.current = requestedGroupId;
    const timer = window.setTimeout(() => {
      if (!activeGroupIds.includes(requestedGroupId)) {
        setStatus("你已经不是这个群组的有效成员，不能发布群组记录。");
        return;
      }
      startCreate(viewCenter);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    activeGroupIds,
    groupsReady,
    searchParams,
    startCreate,
    user,
    viewCenter,
  ]);

  const selectEntry = useCallback((entry: MapEntryWithProfile) => {
    setEditor(null);
    setSelectedEntry(entry);
    setMyParticipation(null);
    setMobilePanel("details");
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("entry", entry.id);
    nextUrl.searchParams.delete("edit");
    window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}`);
  }, []);

  useEffect(() => {
    if (!selectedEntry || !user || selectedEntry.user_id === user.id) {
      return;
    }
    let active = true;
    void getMyEntryParticipation(selectedEntry.id, user.id)
      .then((participation) => {
        if (active) setMyParticipation(participation);
      })
      .catch(() => {
        if (active) setMyParticipation(null);
      });
    return () => {
      active = false;
    };
  }, [selectedEntry, user]);
  const activeParticipation =
    myParticipation?.entry_id === selectedEntry?.id ? myParticipation : null;

  const handleViewChange = useCallback(
    (center: Coordinates, nextBounds: MapBoundsValue) => {
      setViewCenter((current) =>
        coordinatesMatch(current, center) ? current : center,
      );
      setBounds((current) =>
        current && boundsMatch(current, nextBounds) ? current : nextBounds,
      );
    },
    [],
  );

  const handleTileError = useCallback(() => {
    setMapError((current) =>
      current ?? "地图瓦片暂时无法加载，请检查网络后重试。",
    );
  }, []);

  const saveEntry = async (values: EntryFormValues, tagNames: string[]) => {
    if (!user) {
      window.sessionStorage.setItem(DRAFT_STORAGE_KEY, serializeEntryDraft(values));
      router.push(`/login?next=${encodeURIComponent("/?restoreDraft=1")}`);
      return;
    }

    const outcome = await settleAction(async () =>
        editor?.mode === "edit"
          ? await updateEntry(
              editor.entry.id,
              values,
              editor.entry.user_id === user.id
                || activeParticipation?.editable_fields.includes("tags")
                ? tagNames
                : null,
              editor.entry.user_id === user.id
                ? null
                : activeParticipation?.editable_fields ?? [],
            )
          : await createEntry(values, tagNames),
    );
    if (!outcome.ok) {
      reportOperationalError(outcome.error, "save-entry");
      setStatus(getFriendlyError(outcome.error, "保存失败，请检查内容后重试。"));
      return;
    }

    const saved = outcome.value;
    window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    entryQuery.upsert(saved);
    setSelectedEntry(saved);
    setEditor(null);
    setMobilePanel("details");
    setStatus(editor?.mode === "edit" ? "记录已更新。" : "记录已创建，并已显示在地图上。 ");
  };

  const toggleVisibility = async (entry: MapEntryWithProfile) => {
    setActionBusy(true);
    try {
      const updated = await updateEntryVisibility(
        entry.id,
        entry.visibility === "public" ? "private" : "public",
      );
      entryQuery.upsert(updated);
      setSelectedEntry(updated);
      setStatus(updated.visibility === "private" ? "记录已设为私密。" : "记录已设为公开。 ");
    } catch (error) {
      setStatus(getFriendlyError(error, "可见性更新失败。"));
    } finally {
      setActionBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setActionBusy(true);
    try {
      await deleteEntry(deleteTarget.id);
      entryQuery.remove(deleteTarget.id);
      if (selectedEntry?.id === deleteTarget.id) setSelectedEntry(null);
      setEditor(null);
      setDeleteTarget(null);
      setMobilePanel(null);
      setStatus("记录已删除。 ");
    } catch (error) {
      setStatus(getFriendlyError(error, "删除失败，请稍后重试。"));
    } finally {
      setActionBusy(false);
    }
  };

  const closePanels = () => {
    setEditor(null);
    setSelectedEntry(null);
    setMobilePanel(null);
    window.history.replaceState(null, "", "/");
  };

  const panelContent = editor ? (
    editor.mode === "create" ? (
      <EntryForm mode="create" coordinates={editor.coordinates} initialValues={editor.initialValues} initialGroupId={searchParams.get("group") ?? undefined} onSave={saveEntry} onCancel={closePanels} />
    ) : (
      <EntryForm
        mode="edit"
        entry={editor.entry}
        isOwner={editor.entry.user_id === user?.id}
        editableFields={getParticipantEditableFields(
          editor.entry,
          user?.id ?? null,
          activeParticipation,
        )}
        onSave={saveEntry}
        onCancel={() => { setEditor(null); setMobilePanel("details"); }}
      />
    )
  ) : renderableSelectedEntry ? (
    <EntryDetail
      entry={renderableSelectedEntry}
      isOwner={renderableSelectedEntry.user_id === user?.id}
      canEdit={
        renderableSelectedEntry.user_id === user?.id
        || (activeParticipation?.editable_fields.length ?? 0) > 0
      }
      canCollaborate={
        renderableSelectedEntry.user_id === user?.id
        || activeParticipation?.status === "accepted"
      }
      busy={actionBusy}
      onClose={closePanels}
      onEdit={() => { setEditor({ mode: "edit", entry: renderableSelectedEntry }); setMobilePanel("editor"); }}
      onDelete={() => setDeleteTarget(renderableSelectedEntry)}
      onToggleVisibility={() => void toggleVisibility(renderableSelectedEntry)}
    />
  ) : (
    <div className="panel-empty">
      <span className="compass" aria-hidden="true">✦</span>
      <h2>选择一处地点</h2>
      <p>点击地图空白处新建记录，或选择一个标记阅读故事。</p>
    </div>
  );

  return (
    <main className="h-dvh overflow-hidden bg-[#f4f1e9] text-[#26251f]">
      <AppHeader />
      <section className="map-layout">
        <aside className="filter-panel" aria-label="记录筛选">
          <FilterPanel filters={filters} entries={filteredEntries} isLoggedIn={Boolean(user)} groupOptions={groupOptions} truncated={entryQuery.truncated} onChange={setFilters} onSelectEntry={selectEntry} />
        </aside>

        <div className="map-stage">
          <MapErrorBoundary>
            <MapCanvas
              entries={filteredEntries}
              selectedEntryId={renderableSelectedEntry?.id ?? null}
              draftCoordinates={editor?.mode === "create" ? editor.coordinates : null}
              onMapClick={startCreate}
              onEntryClick={selectEntry}
              onTileError={handleTileError}
              onLocationError={setStatus}
              onViewChange={handleViewChange}
            />
          </MapErrorBoundary>

          {loading ? <div className="map-status-overlay" role="status">正在读取可见记录…</div> : null}
          {mapError ? <div className="map-error" role="alert">{mapError}</div> : null}
          {loadError ? (
            <div className="map-error map-error--persistent" role="alert">
              <span>{loadError}</span>
              {configured ? <button type="button" onClick={() => void entryQuery.reload()}>重试</button> : null}
            </div>
          ) : null}
          {authError ? <div className="map-error" role="alert">{authError}</div> : null}
          {status ? <div className="toast-message" role="status">{status}</div> : null}

          <button className="mobile-filter-button" type="button" onClick={() => setMobilePanel("filters")}>☷ 筛选</button>
          <button className="floating-create" type="button" onClick={() => startCreate(viewCenter)}>
            <span aria-hidden="true">＋</span>新建记录
          </button>
        </div>

        <aside
          className={`detail-panel ${
            mobilePanel === "editor" || mobilePanel === "details"
              ? "detail-panel--mobile-open"
              : ""
          } ${mobilePanel === "editor" ? "detail-panel--mobile-editor" : ""}`}
          aria-label="记录详情"
        >
          {panelContent}
        </aside>
      </section>

      {mobilePanel === "filters" ? (
        <div className="mobile-sheet mobile-sheet--filters">
          <FilterPanel filters={filters} entries={filteredEntries} isLoggedIn={Boolean(user)} groupOptions={groupOptions} truncated={entryQuery.truncated} onChange={setFilters} onSelectEntry={selectEntry} onClose={() => setMobilePanel(null)} />
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除这条记录？"
        description="删除后无法恢复。这段故事将立即从地图和你的记录中消失。"
        busy={actionBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </main>
  );
}
