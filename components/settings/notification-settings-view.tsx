"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProtectedState } from "@/components/layout/protected-state";
import { AppHeader } from "@/components/navigation/app-header";
import { useAuth } from "@/components/providers/auth-provider";
import {
  listNotificationPreferences,
  saveNotificationPreference,
} from "@/lib/data/notifications";
import { getFriendlyError, reportOperationalError } from "@/lib/errors";
import type {
  NotificationCategory,
  NotificationDeliveryMode,
} from "@/types/database";

const CATEGORIES: Array<{
  category: NotificationCategory;
  title: string;
  description: string;
  defaultMode: NotificationDeliveryMode;
}> = [
  {
    category: "collaboration",
    title: "共同经历与故事协作",
    description: "邀请、接受或拒绝、权限变化和协作者修改。",
    defaultMode: "in_app",
  },
  {
    category: "groups",
    title: "群组",
    description: "群组邀请、加入、角色变化和归档。",
    defaultMode: "in_app",
  },
  {
    category: "time_capsules",
    title: "时间胶囊",
    description: "你创建的时间胶囊到达解锁时间。",
    defaultMode: "in_app",
  },
  {
    category: "security",
    title: "账号安全",
    description: "重要的登录与账号安全提醒。安全通知不能完全关闭。",
    defaultMode: "in_app",
  },
  {
    category: "product_updates",
    title: "产品更新",
    description: "低频的重要功能与服务变化。",
    defaultMode: "off",
  },
];

function initialModes() {
  return Object.fromEntries(
    CATEGORIES.map(({ category, defaultMode }) => [category, defaultMode]),
  ) as Record<NotificationCategory, NotificationDeliveryMode>;
}

export function NotificationSettingsView() {
  const { user, loading: authLoading, configured, dataScope } = useAuth();
  const [modes, setModes] = useState(initialModes);
  const [loading, setLoading] = useState(Boolean(user));
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyCategory, setBusyCategory] = useState<NotificationCategory | null>(null);
  const requestSequence = useRef(0);
  const activeScope = useRef(dataScope);

  const load = useCallback(async () => {
    if (!user) return;
    const requestId = ++requestSequence.current;
    const requestScope = dataScope;
    setLoading(true);
    setError(null);
    try {
      const preferences = await listNotificationPreferences();
      if (
        activeScope.current !== requestScope ||
        requestSequence.current !== requestId
      ) return;
      const next = initialModes();
      for (const preference of preferences) {
        next[preference.category] = preference.delivery_mode;
      }
      setModes(next);
      setLoaded(true);
    } catch (loadError) {
      reportOperationalError(loadError, "notification-preferences:list");
      if (activeScope.current === requestScope) {
        setError(getFriendlyError(loadError, "通知设置加载失败，请重试。"));
      }
    } finally {
      if (activeScope.current === requestScope && requestSequence.current === requestId) {
        setLoading(false);
      }
    }
  }, [dataScope, user]);

  useEffect(() => {
    activeScope.current = dataScope;
    const initialLoad = user
      ? window.setTimeout(() => void load(), 0)
      : null;
    return () => {
      if (initialLoad !== null) window.clearTimeout(initialLoad);
      requestSequence.current += 1;
    };
  }, [dataScope, load, user]);

  const updateMode = async (
    category: NotificationCategory,
    deliveryMode: NotificationDeliveryMode,
  ) => {
    const previous = modes[category];
    setBusyCategory(category);
    setNotice(null);
    setError(null);
    try {
      const saved = await saveNotificationPreference(category, deliveryMode);
      setModes((current) => ({
        ...current,
        [category]: saved.delivery_mode,
      }));
      setNotice("通知偏好已保存。" );
    } catch (saveError) {
      reportOperationalError(saveError, "notification-preferences:update");
      setModes((current) => ({ ...current, [category]: previous }));
      setError(getFriendlyError(saveError, "通知偏好保存失败，请稍后重试。"));
    } finally {
      setBusyCategory(null);
    }
  };

  let content;
  if (!configured) content = <ProtectedState kind="config" />;
  else if (authLoading) content = <ProtectedState kind="loading" />;
  else if (!user) {
    content = (
      <ProtectedState
        kind="signed-out"
        nextPath="/settings/notifications"
        signedOutDescription="登录后可以选择接收哪些通知。"
      />
    );
  } else if (loading) {
    content = <div className="content-state" role="status">正在读取通知偏好…</div>;
  } else if (error && !loaded) {
    content = (
      <div className="content-state" role="alert">
        <h2>通知设置没有加载成功</h2>
        <p>{error}</p>
        <button className="primary-button" type="button" onClick={() => void load()}>重试</button>
      </div>
    );
  } else {
    content = (
      <section className="settings-card notification-preferences-card" aria-labelledby="notification-preferences-title">
        <div className="settings-section-heading">
          <div>
            <h2 id="notification-preferences-title">接收方式</h2>
            <p>为不同类型的变化选择站内通知、邮件或关闭。</p>
          </div>
        </div>
        <div className="notification-preference-list">
          {CATEGORIES.map((item) => (
            <label className="notification-preference-row" key={item.category}>
              <span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
              <select
                aria-label={`${item.title}接收方式`}
                value={modes[item.category]}
                disabled={busyCategory === item.category}
                onChange={(event) => {
                  const value = event.target.value as NotificationDeliveryMode;
                  setModes((current) => ({ ...current, [item.category]: value }));
                  void updateMode(item.category, value);
                }}
              >
                <option value="in_app">站内通知</option>
                <option value="email">邮件</option>
                {item.category !== "security" ? <option value="off">关闭</option> : null}
              </select>
            </label>
          ))}
        </div>
        <div className="notification-email-note">
          <strong>关于邮件通知</strong>
          <p>当前阶段已经建立安全邮件队列，但尚未连接正式邮件服务。选择“邮件”只会进入待发送队列，不代表邮件已经送达；正式启用前建议保留站内通知。</p>
        </div>
        {notice ? <div className="inline-success" role="status">{notice}</div> : null}
        {error ? <div className="notice" role="alert">{error}</div> : null}
      </section>
    );
  }

  return (
    <main className="content-page">
      <AppHeader />
      <div className="content-container content-container--narrow">
        <div className="page-heading">
          <div>
            <p className="eyebrow">NOTIFICATION SETTINGS</p>
            <h1>通知设置</h1>
            <p>只保留真正需要抵达你的变化。</p>
          </div>
          <Link className="secondary-button nav-link" href="/notifications">返回通知</Link>
        </div>
        {content}
      </div>
    </main>
  );
}
