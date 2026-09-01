"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
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
import { OnboardingEntryForm } from "@/components/onboarding/onboarding-entry-form";
import { GuidedEmptyState } from "@/components/ui/guided-empty-state";
import { EntryDetail } from "@/components/entries/entry-detail";
import { FilterPanel } from "@/components/entries/filter-panel";
import { ConfirmDialog } from "@/components/entries/confirm-dialog";
import { MapErrorBoundary } from "@/components/map/map-error-boundary";
import { TimePlaybackControl } from "@/components/map/time-playback-control";
import { PlaceStoryLayer } from "@/components/map/place-story-layer";
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
import { ensureOnboardingDecision } from "@/lib/data/onboarding";
import { parseStoryTemplateId } from "@/lib/templates/story-templates";
import { listFeaturedPublicEntries } from "@/lib/data/explore";
import {
  getEntryDraft,
  publishEntryDraft,
  type EntryDraftRef,
} from "@/lib/data/entry-drafts";
import {
  draftPayloadToFormValues,
  parseEntryDraftPayload,
} from "@/lib/validation/entry-draft";
import type { EntryDraft } from "@/types/database";
import {
  DEFAULT_TIME_PLAYBACK_STATE,
  filterEntriesForTimePlayback,
  type TimePlaybackState,
} from "@/lib/map/time-playback";
import {
  clusterEntriesByPlace,
  type PlaceStoryCluster,
} from "@/lib/map/place-story-clusters";
import { recordProductEvent } from "@/lib/analytics/provider";

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
  | { mode: "create"; coordinates: Coordinates; initialValues?: EntryFormValues; initialDraft?: EntryDraft }
  | { mode: "edit"; entry: MapEntryWithProfile; initialValues?: EntryFormValues; initialDraft?: EntryDraft }
  | null;

type MobilePanel = "filters" | "details" | "editor" | null;
const DRAFT_STORAGE_KEY = "story-map-pending-entry";

export function MapExperience() {
  const {
    user,
    loading: authLoading,
    dataScope,
    configured,
    authError,
  } = useAuth();
  const scope = getAuthDataScope(dataScope);

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
  const handledUrlDraft = useRef<string | null>(null);
  const handledGroupDraft = useRef<string | null>(null);
  const restoredDraftForUser = useRef<string | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<MapEntryWithProfile | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [deleteTarget, setDeleteTarget] = useState<MapEntryWithProfile | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [filters, setFilters] = useState<EntryFilters>(DEFAULT_ENTRY_FILTERS);
  const [timePlayback, setTimePlayback] = useState<TimePlaybackState>(
    DEFAULT_TIME_PLAYBACK_STATE,
  );
  const [selectedPlaceClusterId, setSelectedPlaceClusterId] = useState<string | null>(null);
  const [bounds, setBounds] = useState<MapBoundsValue | null>(null);
  const [viewCenter, setViewCenter] = useState<Coordinates>({ latitude: 25, longitude: 15 });
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [groupOptions, setGroupOptions] = useState<Array<Pick<Group, "id" | "name">>>([]);
  const [activeGroupIds, setActiveGroupIds] = useState<string[]>([]);
  const [groupsReady, setGroupsReady] = useState(false);
  const [myParticipation, setMyParticipation] =
    useState<EntryParticipantWithProfile | null>(null);
  const [featuredHomeEntry, setFeaturedHomeEntry] =
    useState<MapEntryWithProfile | null>(null);
  const isOnboardingFlow = searchParams.get("onboarding") === "1";
  const initialTemplateId = isOnboardingFlow
    ? parseStoryTemplateId(searchParams.get("template"))
    : null;
  const hasIntentQuery = searchParams.size > 0;
  const [onboardingCheckedUserId, setOnboardingCheckedUserId] = useState<string | null>(null);
  const onboardingGateReady = !user || hasIntentQuery || onboardingCheckedUserId === user.id;

  useEffect(() => {
    if (!user || authLoading || !configured || hasIntentQuery) return;
    let active = true;
    void ensureOnboardingDecision(user.id)
      .then((decision) => {
        if (!active) return;
        if (decision.shouldOnboard) router.replace("/onboarding");
        else setOnboardingCheckedUserId(user.id);
      })
      .catch((error) => {
        if (!active) return;
        setStatus(getFriendlyError(error, "首次使用引导暂时不可用，已继续打开地图。"));
        setOnboardingCheckedUserId(user.id);
      });
    return () => { active = false; };
  }, [authLoading, configured, hasIntentQuery, router, user]);

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

  useEffect(() => {
    if (!configured || authLoading) return;
    let active = true;
    void listFeaturedPublicEntries(1)
      .then((featuredEntries) => {
        if (active) setFeaturedHomeEntry(featuredEntries[0] ?? null);
      })
      .catch((error) => {
        if (!active) return;
        setFeaturedHomeEntry(null);
        reportOperationalError(error, "load-home-featured-entry");
      });
    return () => {
      active = false;
    };
  }, [authLoading, configured]);

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
    if (searchParams.get("draft")) return;
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
    const draftId = searchParams.get("draft");
    if (!user || authLoading || loading || !configured || !draftId) return;
    if (handledUrlDraft.current === draftId) return;
    handledUrlDraft.current = draftId;
    let active = true;
    void getEntryDraft(draftId).then(async (draft) => {
      if (!active) return;
      const payload = draft ? parseEntryDraftPayload(draft.payload) : null;
      if (!draft || !payload) {
        setStatus("这份草稿不存在，或你已经没有访问权限。");
        return;
      }
      if (draft.source_entry_id) {
        const entry = await getEntryById(draft.source_entry_id);
        if (!active) return;
        if (!entry || entry.user_id !== user.id) {
          setStatus("原故事已不存在，或草稿不再可编辑。");
          return;
        }
        setSelectedEntry(entry);
        setEditor({
          mode: "edit",
          entry,
          initialDraft: draft,
          initialValues: draftPayloadToFormValues(payload, entry),
        });
      } else {
        const initialValues = draftPayloadToFormValues(payload, { latitude: 25, longitude: 15 });
        setSelectedEntry(null);
        setEditor({
          mode: "create",
          coordinates: {
            latitude: initialValues.latitude,
            longitude: initialValues.longitude,
          },
          initialValues,
          initialDraft: draft,
        });
      }
      recordProductEvent("draft_resumed", { source: "map-draft-url", content_type: "draft" });
      setMobilePanel("editor");
      setStatus("草稿已恢复，可以继续写作。");
    }).catch((error) => {
      if (active) setStatus(getFriendlyError(error, "草稿加载失败，请稍后重试。"));
    });
    return () => { active = false; };
  }, [authLoading, configured, loading, searchParams, user]);

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
  const baseFilteredEntries = useMemo(
    () => filterEntries(membershipSafeEntries, filters, user?.id ?? null, bounds),
    [bounds, filters, membershipSafeEntries, user?.id],
  );
  const filteredEntries = useMemo(
    () => filterEntriesForTimePlayback(
      baseFilteredEntries,
      timePlayback,
      user?.id ?? null,
    ),
    [baseFilteredEntries, timePlayback, user?.id],
  );
  const placeClusters = useMemo(
    () => clusterEntriesByPlace(filteredEntries),
    [filteredEntries],
  );
  const selectedPlaceCluster = selectedPlaceClusterId
    ? placeClusters.find((cluster) => cluster.id === selectedPlaceClusterId) ?? null
    : null;
  const changeFilters = useCallback((nextFilters: EntryFilters) => {
    setSelectedPlaceClusterId(null);
    setFilters(nextFilters);
  }, []);
  const changeTimePlayback = useCallback((nextState: TimePlaybackState) => {
    setSelectedPlaceClusterId(null);
    setTimePlayback(nextState);
  }, []);
  const startCreate = useCallback((coordinates: Coordinates) => {
    recordProductEvent("story_create_started", { source: "map" });
    setSelectedEntry(null);
    setSelectedPlaceClusterId(null);
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
    setSelectedPlaceClusterId(null);
    setMyParticipation(null);
    setMobilePanel("details");
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("entry", entry.id);
    nextUrl.searchParams.delete("edit");
    window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}`);
  }, []);

  const selectPlaceCluster = useCallback((cluster: PlaceStoryCluster) => {
    setEditor(null);
    setSelectedEntry(null);
    setMyParticipation(null);
    setSelectedPlaceClusterId(cluster.id);
    setMobilePanel("details");
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("entry");
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
  const selectedForIdentity = getRenderableSelectedEntry(
    selectedEntry,
    user?.id ?? null,
    activeParticipation?.status === "accepted",
  );
  const renderableSelectedEntry =
    canRenderGroupEntry(selectedForIdentity, activeGroupIds)
      ? selectedForIdentity
      : null;

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

  const saveEntry = async (
    values: EntryFormValues,
    tagNames: string[],
    draft: EntryDraftRef | null,
  ) => {
    if (!user) {
      window.sessionStorage.setItem(DRAFT_STORAGE_KEY, serializeEntryDraft(values));
      if (isOnboardingFlow) window.sessionStorage.setItem("story-map-onboarding-draft", "1");
      const restoreParams = new URLSearchParams({ restoreDraft: "1" });
      if (isOnboardingFlow) {
        restoreParams.set("onboarding", "1");
        if (initialTemplateId) restoreParams.set("template", initialTemplateId);
      }
      const restorePath = `/?${restoreParams.toString()}`;
      router.push(`/login?next=${encodeURIComponent(restorePath)}`);
      return;
    }

    const outcome = await settleAction(async () =>
        draft && (editor?.mode !== "edit" || editor.entry.user_id === user.id)
          ? await publishEntryDraft(draft, values, tagNames)
          : editor?.mode === "edit"
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
    const created = editor?.mode !== "edit";
    if (created) {
      recordProductEvent("story_created", {
        source: isOnboardingFlow ? "onboarding" : "map",
        content_type: "entry",
        visibility: saved.visibility,
      });
      recordProductEvent("story_published", {
        source: isOnboardingFlow ? "onboarding" : "map",
        content_type: "entry",
        visibility: saved.visibility,
      });
    }
    window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    window.sessionStorage.removeItem("story-map-onboarding-draft");
    entryQuery.upsert(saved);
    if (editor?.mode === "create" && isOnboardingFlow) {
      router.push(`/onboarding/complete?entry=${encodeURIComponent(saved.id)}`);
      return;
    }
    setSelectedEntry(saved);
    setEditor(null);
    setMobilePanel("details");
    window.history.replaceState(null, "", `/?entry=${saved.id}`);
    setStatus(editor?.mode === "edit" ? "记录已更新。" : "记录已创建，并已显示在地图上。 ");
  };

  const handleDraftCreated = useCallback((draftId: string) => {
    handledUrlDraft.current = draftId;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("draft", draftId);
    window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}`);
  }, []);

  const toggleVisibility = async (entry: MapEntryWithProfile) => {
    setActionBusy(true);
    try {
      const updated = await updateEntryVisibility(
        entry.id,
        entry.visibility === "public" ? "private" : "public",
      );
      entryQuery.upsert(updated);
      setSelectedEntry(updated);
      setStatus(updated.visibility === "private" ? "这条故事现在只对你和已接受邀请的共同经历者开放。" : "这条故事现在所有人都可以看到。");
    } catch (error) {
      setStatus(getFriendlyError(error, "阅读范围更新失败。"));
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
    setSelectedPlaceClusterId(null);
    setMobilePanel(null);
    window.history.replaceState(null, "", "/");
  };

  const panelContent = editor ? (
    editor.mode === "create" ? (
      isOnboardingFlow ? (
        <OnboardingEntryForm
          key={editor.initialDraft?.id ?? `onboarding-${editor.coordinates.latitude}-${editor.coordinates.longitude}`}
          coordinates={editor.coordinates}
          initialValues={editor.initialValues}
          initialDraft={editor.initialDraft}
          initialTemplateId={initialTemplateId}
          onSave={saveEntry}
          onDraftCreated={handleDraftCreated}
          onCancel={closePanels}
        />
      ) : (
        <EntryForm
          key={editor.initialDraft?.id ?? `create-${editor.coordinates.latitude}-${editor.coordinates.longitude}`}
          mode="create"
          coordinates={editor.coordinates}
          initialValues={editor.initialValues}
          initialDraft={editor.initialDraft}
          initialGroupId={searchParams.get("group") ?? undefined}
          initialTemplateId={initialTemplateId}
          onSave={saveEntry}
          onDraftCreated={handleDraftCreated}
          onCancel={closePanels}
        />
      )
    ) : (
      <EntryForm
        key={editor.initialDraft?.id ?? `edit-${editor.entry.id}`}
        mode="edit"
        entry={editor.entry}
        initialValues={editor.initialValues}
        initialDraft={editor.initialDraft}
        isOwner={editor.entry.user_id === user?.id}
        editableFields={getParticipantEditableFields(
          editor.entry,
          user?.id ?? null,
          activeParticipation,
        )}
        onSave={saveEntry}
        onDraftCreated={handleDraftCreated}
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
  ) : selectedPlaceCluster ? (
    <PlaceStoryLayer
      cluster={selectedPlaceCluster}
      onClose={closePanels}
      onSelectEntry={selectEntry}
    />
  ) : (
    user && !entries.some((entry) => entry.user_id === user.id) ? (
      <GuidedEmptyState eyebrow="YOUR FIRST PLACE" title="你的故事地图还是空白。" description="从一个地方开始。点击地图，留下时间和你仍然记得的事情。"><button className="primary-button" type="button" onClick={() => startCreate(viewCenter)}>选择地图中心</button></GuidedEmptyState>
    ) : <GuidedEmptyState compact title="选择一处地点" description="点击地图空白处新建记录，或选择一个标记阅读故事。" />
  );

  if (!onboardingGateReady) {
    return <main className="content-page"><AppHeader /><div className="page-loading" role="status">正在准备你的故事地图…</div></main>;
  }

  return (
    <main className="h-dvh overflow-hidden bg-[#f4f1e9] text-[#26251f]">
      <AppHeader />
      <section className="map-layout">
        <aside className="filter-panel" aria-label="记录筛选">
          <FilterPanel filters={filters} entries={filteredEntries} isLoggedIn={Boolean(user)} groupOptions={groupOptions} truncated={entryQuery.truncated} onChange={changeFilters} onSelectEntry={selectEntry} />
        </aside>

        <div className="map-stage">
          <MapErrorBoundary>
            <MapCanvas
              key={scope}
              scopeKey={scope}
              clusters={placeClusters}
              selectedEntryId={renderableSelectedEntry?.id ?? null}
              selectedClusterId={selectedPlaceCluster?.id ?? null}
              draftCoordinates={editor?.mode === "create" ? editor.coordinates : null}
              onMapClick={startCreate}
              onEntryClick={selectEntry}
              onPlaceClusterClick={selectPlaceCluster}
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
          {isOnboardingFlow && !editor ? <div className="onboarding-map-prompt" role="status"><strong>第 2 步：选择第一个地点</strong><span>点击地图上对你有意义的位置，开始写第一个故事。</span></div> : null}
          {featuredHomeEntry && !isOnboardingFlow ? (
            <aside className="map-featured-callout" aria-label="编辑精选">
              <span className="eyebrow">✦ 编辑精选</span>
              <Link href={`/?entry=${featuredHomeEntry.id}`}>
                <strong>{featuredHomeEntry.title}</strong>
                <small>{featuredHomeEntry.place_name ?? featuredHomeEntry.time_label}</small>
              </Link>
            </aside>
          ) : null}

          {!isOnboardingFlow ? (
            <TimePlaybackControl
              entries={baseFilteredEntries}
              filteredCount={filteredEntries.length}
              state={timePlayback}
              onChange={changeTimePlayback}
            />
          ) : null}

          <button className="mobile-filter-button" type="button" onClick={() => setMobilePanel("filters")}>☷ 筛选</button>
          <button className="floating-create" type="button" onClick={() => startCreate(viewCenter)}>
            <span aria-hidden="true">＋</span>{isOnboardingFlow ? "从地图中心开始" : "新建记录"}
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
          <FilterPanel filters={filters} entries={filteredEntries} isLoggedIn={Boolean(user)} groupOptions={groupOptions} truncated={entryQuery.truncated} onChange={changeFilters} onSelectEntry={selectEntry} onClose={() => setMobilePanel(null)} />
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
