"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function useEntryRealtime({
  enabled,
  scopeKey,
  includeCollaboration = false,
  onChange,
}: {
  enabled: boolean;
  scopeKey: string;
  includeCollaboration?: boolean;
  onChange: () => void;
}) {
  const callbackRef = useRef(onChange);
  useEffect(() => {
    callbackRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled) return;
    const supabase = getSupabaseBrowserClient();
    let channel = supabase.channel(`entry-refresh-${scopeKey}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "map_entries" },
      () => callbackRef.current(),
    ).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "entry_tags" },
      () => callbackRef.current(),
    );
    if (includeCollaboration) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "entry_participants" },
        () => callbackRef.current(),
      ).on(
        "postgres_changes",
        { event: "*", schema: "public", table: "entry_edit_logs" },
        () => callbackRef.current(),
      );
    }
    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, includeCollaboration, scopeKey]);
}
