"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveEntryDraft, type EntryDraftRef } from "@/lib/data/entry-drafts";
import { getErrorCode, getFriendlyError, reportOperationalError } from "@/lib/errors";
import {
  entryDraftPayloadSchema,
  type EntryDraftPayload,
} from "@/lib/validation/entry-draft";

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error" | "conflict";

type Snapshot = {
  payload: EntryDraftPayload;
  tagInput: string;
  fingerprint: string;
};

function getFingerprint(payload: EntryDraftPayload, tagInput: string) {
  return JSON.stringify([payload, tagInput]);
}

function getInitialFingerprint(
  initialDraft: (EntryDraftRef & { payload: unknown; tag_input: string }) | undefined,
  fallback: string,
) {
  if (!initialDraft) return fallback;
  const parsed = entryDraftPayloadSchema.safeParse(initialDraft.payload);
  return parsed.success
    ? getFingerprint(parsed.data, initialDraft.tag_input)
    : fallback;
}

export function useEntryAutosave({
  enabled,
  sourceEntryId,
  payload,
  tagInput,
  initialDraft,
  onDraftCreated,
  delay = 900,
}: {
  enabled: boolean;
  sourceEntryId: string | null;
  payload: EntryDraftPayload;
  tagInput: string;
  initialDraft?: EntryDraftRef & { payload: unknown; tag_input: string };
  onDraftCreated?: (id: string) => void;
  delay?: number;
}) {
  const currentSnapshot = useMemo<Snapshot>(() => ({
    payload,
    tagInput,
    fingerprint: getFingerprint(payload, tagInput),
  }), [payload, tagInput]);
  const draftRef = useRef<EntryDraftRef | null>(initialDraft ?? null);
  const clientInstanceId = useRef<string>(crypto.randomUUID());
  const persistedFingerprint = useRef(
    getInitialFingerprint(initialDraft, currentSnapshot.fingerprint),
  );
  const latest = useRef<Snapshot>(currentSnapshot);
  const queued = useRef<Snapshot | null>(null);
  const inFlight = useRef<Promise<EntryDraftRef> | null>(null);
  const blocked = useRef(false);
  const createdCallback = useRef(onDraftCreated);
  const mounted = useRef(true);
  const [status, setStatus] = useState<AutosaveStatus>(initialDraft ? "saved" : "idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    createdCallback.current = onDraftCreated;
  }, [onDraftCreated]);

  useEffect(() => {
    latest.current = currentSnapshot;
  }, [currentSnapshot]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const drainQueue = useCallback(async (): Promise<EntryDraftRef> => {
    if (blocked.current) throw new Error("Draft autosave is blocked by a conflict.");
    while (true) {
      if (inFlight.current) {
        await inFlight.current;
        continue;
      }
      const snapshot = queued.current;
      if (!snapshot) {
        if (!draftRef.current) throw new Error("Draft was not saved.");
        return draftRef.current;
      }
      queued.current = null;
      if (mounted.current) {
        setStatus("saving");
        setMessage(null);
      }
      const previousId = draftRef.current?.id ?? null;
      const request = saveEntryDraft({
        draftId: previousId,
        sourceEntryId,
        payload: snapshot.payload,
        tagInput: snapshot.tagInput,
        expectedRevision: draftRef.current?.revision ?? 0,
        clientInstanceId: clientInstanceId.current,
      }).then((saved) => {
        draftRef.current = { id: saved.id, revision: saved.revision };
        persistedFingerprint.current = snapshot.fingerprint;
        if (!previousId) createdCallback.current?.(saved.id);
        if (mounted.current) setStatus("saved");
        return draftRef.current;
      }).catch((error: unknown) => {
        const conflict = getErrorCode(error) === "40001";
        if (conflict) blocked.current = true;
        if (mounted.current) {
          setStatus(conflict ? "conflict" : "error");
          setMessage(
            conflict
              ? "草稿已在另一个页面更新。请重新打开草稿后继续。"
              : getFriendlyError(error, "草稿自动保存失败，请检查网络后重试。"),
          );
        }
        reportOperationalError(error, "entry-draft-autosave");
        throw error;
      });
      inFlight.current = request;
      try {
        await request;
      } finally {
        if (inFlight.current === request) inFlight.current = null;
      }
    }
  }, [sourceEntryId]);

  useEffect(() => {
    if (!enabled || blocked.current) return;
    if (currentSnapshot.fingerprint === persistedFingerprint.current) return;
    setStatus("pending");
    const timer = window.setTimeout(() => {
      queued.current = latest.current;
      void drainQueue().catch(() => undefined);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [currentSnapshot, delay, drainQueue, enabled]);

  const flush = useCallback(async () => {
    if (!enabled) return draftRef.current;
    if (blocked.current) throw new Error("Draft autosave is blocked by a conflict.");
    if (currentSnapshot.fingerprint !== persistedFingerprint.current) {
      queued.current = currentSnapshot;
    }
    if (!queued.current && !inFlight.current) return draftRef.current;
    return drainQueue();
  }, [currentSnapshot, drainQueue, enabled]);

  return { status, message, flush };
}
