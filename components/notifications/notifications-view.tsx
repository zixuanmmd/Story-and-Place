"use client";

import { Bell, Check, CheckCheck, Settings2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProtectedState } from "@/components/layout/protected-state";
import { AppHeader } from "@/components/navigation/app-header";
import { useAuth } from "@/components/providers/auth-provider";
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  syncMyTimeCapsuleNotifications,
} from "@/lib/data/notifications";
import {
  getErrorCode,
  getFriendlyError,
  reportOperationalError,
} from "@/lib/errors";
import { getNotificationPresentation } from "@/lib/notifications/presentation";
import {
  getRenderableNotifications,
  mergeNotifications,
  type ScopedNotificationState,
} from "@/lib/notifications/scoped-state";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { NotificationWithActor } from "@/types/database";

function formatNotificationTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getLoadError(error: unknown) {
  const code = getErrorCode(error);
  if (code === "42P01" || code === "42883" || code === "PGRST202" || code === "PGRST205") {
    return "通知功能尚未完成数据库初始化，请执行最新 migration。";
  }
  return getFriendlyError(error, "通知加载失败，请重试。");
}

export function NotificationsView() {
  const { user, loading: authLoading, configured, dataScope } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<ScopedNotificationState>({
    scope: dataScope,
    notifications: [],
    unreadCount: 0,
  });
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(Boolean(user));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const activeScope = useRef(dataScope);

  const loadPage = useCallback(async (nextPage: number, replace: boolean) => {
    if (!user) return;
    const requestId = ++requestSequence.current;
    const requestScope = dataScope;
    if (nextPage === 0) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    try {
      if (nextPage === 0) await syncMyTimeCapsuleNotifications();
      const [result, unreadCount] = await Promise.all([
        listNotifications(nextPage),
        getUnreadNotificationCount(),
      ]);
      if (
        activeScope.current !== requestScope ||
        requestSequence.current !== requestId
      ) return;
      setState((current) => {
        if (current.scope !== requestScope) return current;
        const notifications = replace
          ? result.notifications
          : mergeNotifications(current.notifications, result.notifications);
        return {
          scope: requestScope,
          notifications,
          unreadCount,
        };
      });
      setPage(nextPage);
      setHasMore(result.hasMore);
    } catch (loadError) {
      reportOperationalError(loadError, "notifications:list");
      if (activeScope.current === requestScope) setError(getLoadError(loadError));
    } finally {
      if (activeScope.current === requestScope && requestSequence.current === requestId) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [dataScope, user]);

  useEffect(() => {
    activeScope.current = dataScope;
    if (!user) return;
    const initialLoad = window.setTimeout(() => void loadPage(0, true), 0);

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`notification-list:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => void loadPage(0, false),
      )
      .subscribe();

    return () => {
      window.clearTimeout(initialLoad);
      requestSequence.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [dataScope, loadPage, user]);

  const markOne = async (notification: NotificationWithActor) => {
    if (notification.read_at) return;
    setBusyId(notification.id);
    setNotice(null);
    try {
      await markNotificationRead(notification.id);
      const readAt = new Date().toISOString();
      setState((current) => {
        if (current.scope !== dataScope) return current;
        const notifications = current.notifications.map((item) =>
          item.id === notification.id ? { ...item, read_at: readAt } : item,
        );
        return {
          ...current,
          notifications,
          unreadCount: Math.max(0, current.unreadCount - 1),
        };
      });
    } catch (markError) {
      reportOperationalError(markError, "notifications:mark-read");
      setNotice(getFriendlyError(markError, "通知暂时无法标记为已读。"));
    } finally {
      setBusyId(null);
    }
  };

  const openNotification = async (notification: NotificationWithActor, href: string) => {
    await markOne(notification);
    router.push(href);
  };

  const markAll = async () => {
    setBusyId("all");
    setNotice(null);
    try {
      const changed = await markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setState((current) => current.scope === dataScope ? {
        ...current,
        unreadCount: 0,
        notifications: current.notifications.map((notification) => ({
          ...notification,
          read_at: notification.read_at ?? readAt,
        })),
      } : current);
      setNotice(changed ? `已将 ${changed} 条通知标记为已读。` : "没有未读通知。" );
    } catch (markError) {
      reportOperationalError(markError, "notifications:mark-all-read");
      setNotice(getFriendlyError(markError, "暂时无法全部标记为已读。"));
    } finally {
      setBusyId(null);
    }
  };

  const notifications = getRenderableNotifications(state, dataScope);
  const unreadCount = state.scope === dataScope ? state.unreadCount : 0;

  let content;
  if (!configured) content = <ProtectedState kind="config" />;
  else if (authLoading) content = <ProtectedState kind="loading" />;
  else if (!user) {
    content = (
      <ProtectedState
        kind="signed-out"
        nextPath="/notifications"
        signedOutDescription="登录后可以查看共同经历、群组和时间胶囊通知。"
      />
    );
  } else if (loading && !notifications.length) {
    content = <div className="content-state" role="status">正在收拢新的消息…</div>;
  } else if (error && !notifications.length) {
    content = (
      <div className="content-state" role="alert">
        <h2>通知没有加载成功</h2>
        <p>{error}</p>
        <div className="state-actions">
          <button className="primary-button" type="button" onClick={() => void loadPage(0, true)}>重试</button>
          <Link className="secondary-button nav-link" href="/">返回地图</Link>
        </div>
      </div>
    );
  } else if (!notifications.length) {
    content = (
      <div className="content-state">
        <Bell aria-hidden="true" />
        <h2>这里还很安静</h2>
        <p>共同经历邀请、群组变化和解锁的时间胶囊会出现在这里。</p>
        <Link className="primary-button nav-link" href="/">回到故事地图</Link>
      </div>
    );
  } else {
    content = (
      <>
        <div className="notification-list" aria-live="polite">
          {notifications.map((notification) => {
            const presentation = getNotificationPresentation(notification);
            const unread = !notification.read_at;
            return (
              <article
                className={`notification-card${unread ? " notification-card--unread" : ""}`}
                key={notification.id}
              >
                <div className="notification-card__marker" aria-hidden="true">
                  {unread ? <Bell /> : <Check />}
                </div>
                <div className="notification-card__body">
                  <div className="notification-card__topline">
                    <span>{unread ? "未读" : "已读"}</span>
                    <time dateTime={notification.created_at}>{formatNotificationTime(notification.created_at)}</time>
                  </div>
                  <h2>{presentation.title}</h2>
                  {presentation.subject ? <strong>{presentation.subject}</strong> : null}
                  <p>{presentation.description}</p>
                  <div className="record-actions">
                    {presentation.href ? (
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={busyId === notification.id}
                        onClick={() => void openNotification(notification, presentation.href!)}
                      >
                        查看相关内容
                      </button>
                    ) : null}
                    {unread ? (
                      <button
                        className="quiet-button"
                        type="button"
                        disabled={busyId === notification.id}
                        onClick={() => void markOne(notification)}
                      >
                        标为已读
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {error ? <div className="notice" role="alert">{error}</div> : null}
        {hasMore ? (
          <button
            className="secondary-button feed-more"
            type="button"
            disabled={loadingMore}
            onClick={() => void loadPage(page + 1, false)}
          >
            {loadingMore ? "正在加载…" : "加载更多通知"}
          </button>
        ) : null}
      </>
    );
  }

  return (
    <main className="content-page">
      <AppHeader />
      <div className="content-container content-container--narrow">
        <div className="page-heading notification-heading">
          <div>
            <p className="eyebrow">NOTIFICATIONS</p>
            <h1>通知</h1>
            <p>{unreadCount ? `${unreadCount} 条消息还没有读。` : "重要变化会安静地留在这里。"}</p>
          </div>
          {user ? (
            <div className="record-actions">
              <Link className="secondary-button nav-link" href="/settings/notifications"><Settings2 aria-hidden="true" />通知设置</Link>
              <button className="quiet-button" type="button" disabled={busyId === "all" || !unreadCount} onClick={() => void markAll()}><CheckCheck aria-hidden="true" />全部已读</button>
            </div>
          ) : null}
        </div>
        {notice ? <div className="notice" role="status">{notice}</div> : null}
        {content}
      </div>
    </main>
  );
}
