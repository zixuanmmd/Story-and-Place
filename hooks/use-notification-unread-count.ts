"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  getUnreadNotificationCount,
  syncMyTimeCapsuleNotifications,
} from "@/lib/data/notifications";
import { reportOperationalError } from "@/lib/errors";
import { getRenderableUnreadCount } from "@/lib/notifications/scoped-state";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function useNotificationUnreadCount() {
  const { user, dataScope, configured } = useAuth();
  const [state, setState] = useState({ scope: dataScope, unreadCount: 0 });
  const requestSequence = useRef(0);
  const activeScope = useRef(dataScope);

  const refresh = useCallback(async () => {
    if (!configured || !user) return;
    const requestId = ++requestSequence.current;
    const requestScope = dataScope;
    try {
      await syncMyTimeCapsuleNotifications();
      const unreadCount = await getUnreadNotificationCount();
      if (
        activeScope.current !== requestScope ||
        requestSequence.current !== requestId
      ) return;
      setState({ scope: requestScope, unreadCount });
    } catch (error) {
      reportOperationalError(error, "notifications:unread-count");
    }
  }, [configured, dataScope, user]);

  useEffect(() => {
    activeScope.current = dataScope;
    requestSequence.current += 1;
    if (!configured || !user) return;

    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`notification-count:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      window.clearTimeout(initialRefresh);
      requestSequence.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [configured, dataScope, refresh, user]);

  return {
    unreadCount: getRenderableUnreadCount(state, dataScope),
    refresh,
  };
}
