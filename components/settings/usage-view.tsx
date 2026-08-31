"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProtectedState } from "@/components/layout/protected-state";
import { AppHeader } from "@/components/navigation/app-header";
import { useAuth } from "@/components/providers/auth-provider";
import {
  formatUsageBytes,
  isUsageNearLimit,
  usagePercentage,
} from "@/lib/commercial/usage";
import { getMyCommercialAccess } from "@/lib/data/commercial";
import { getFriendlyError, reportOperationalError } from "@/lib/errors";
import type { CommercialAccess } from "@/lib/validation/commercial";

type UsageBarProps = {
  label: string;
  used: number;
  limit: number;
  format?: (value: number) => string;
};

function UsageBar({ label, used, limit, format = String }: UsageBarProps) {
  const percentage = usagePercentage(used, limit);
  const nearLimit = isUsageNearLimit(used, limit);
  return (
    <div className="usage-meter">
      <div className="usage-meter-heading">
        <strong>{label}</strong>
        <span>{format(used)} / {format(limit)}</span>
      </div>
      <div
        className="usage-meter-track"
        role="progressbar"
        aria-label={`${label}使用量`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
      >
        <span
          className={nearLimit ? "usage-meter-fill usage-meter-fill--near" : "usage-meter-fill"}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {nearLimit ? <small>已接近当前容量上限。现有内容不会被删除或隐藏。</small> : null}
    </div>
  );
}

export function UsageView() {
  const { user, loading: authLoading, configured, dataScope } = useAuth();
  const [state, setState] = useState<{
    scope: string | null;
    access: CommercialAccess | null;
    error: string | null;
  }>({ scope: null, access: null, error: null });
  const [loading, setLoading] = useState(Boolean(user));
  const requestSequence = useRef(0);
  const activeScope = useRef(dataScope);
  const access = state.scope === dataScope ? state.access : null;
  const error = state.scope === dataScope ? state.error : null;
  const scopePending = Boolean(user) && state.scope !== dataScope;

  const load = useCallback(async () => {
    if (!user) return;
    const requestId = ++requestSequence.current;
    const requestScope = dataScope;
    setLoading(true);
    try {
      const next = await getMyCommercialAccess();
      if (
        activeScope.current !== requestScope
        || requestSequence.current !== requestId
      ) return;
      setState({ scope: requestScope, access: next, error: null });
    } catch (loadError) {
      reportOperationalError(loadError, "commercial-access:get");
      if (activeScope.current === requestScope) {
        setState({
          scope: requestScope,
          access: null,
          error: getFriendlyError(loadError, "使用量暂时无法读取，请稍后重试。"),
        });
      }
    } finally {
      if (
        activeScope.current === requestScope
        && requestSequence.current === requestId
      ) setLoading(false);
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

  let content;
  if (!configured) content = <ProtectedState kind="config" />;
  else if (authLoading) content = <ProtectedState kind="loading" />;
  else if (!user) {
    content = (
      <ProtectedState
        kind="signed-out"
        nextPath="/settings/usage"
        signedOutDescription="登录后可以查看套餐能力与资源使用量。"
      />
    );
  } else if (loading || scopePending) {
    content = <div className="content-state" role="status">正在读取使用量…</div>;
  } else if (error || !access) {
    content = (
      <div className="content-state" role="alert">
        <h2>使用量没有加载成功</h2>
        <p>{error ?? "使用量暂时无法读取，请稍后重试。"}</p>
        <button className="primary-button" type="button" onClick={() => void load()}>重试</button>
      </div>
    );
  } else {
    content = (
      <div className="usage-layout">
        <section className="settings-section-card usage-plan-card" aria-labelledby="current-plan-title">
          <div>
            <p className="eyebrow">CURRENT PLAN</p>
            <h2 id="current-plan-title">{access.plan.name}</h2>
            <p>{access.plan.description}</p>
          </div>
          <div className="usage-entitlements" aria-label="当前能力">
            <span>{access.entitlements.canUploadMedia ? "可以上传故事图片" : "暂不支持上传故事图片"}</span>
            <span>{access.entitlements.advancedExport ? "包含 JSON、CSV 与 GeoJSON 导出" : "包含基础导出"}</span>
          </div>
          <div className="notice" role="note">
            套餐升级和真实支付尚未开放。此页面不会发起扣款，也没有连接任何支付账户。
          </div>
        </section>

        <section className="settings-section-card" aria-labelledby="resource-usage-title">
          <div>
            <h2 id="resource-usage-title">资源使用量</h2>
            <p>使用量直接从你的故事、线路和媒体记录计算，不包含其他用户的数据。</p>
          </div>
          <div className="usage-story-summary">
            <span><strong>{access.usage.storyCount}</strong><small>我创建的故事</small></span>
          </div>
          <UsageBar
            label="故事线路"
            used={access.usage.activeRouteCount}
            limit={access.entitlements.maxStoryRoutes}
          />
          <UsageBar
            label="图片存储"
            used={access.usage.storageBytes}
            limit={access.entitlements.maxStorageBytes}
            format={formatUsageBytes}
          />
          <UsageBar
            label="媒体文件"
            used={access.usage.mediaFileCount}
            limit={access.entitlements.maxMediaFiles}
          />
        </section>
      </div>
    );
  }

  return (
    <main className="content-page">
      <AppHeader />
      <div className="content-container content-container--narrow">
        <div className="page-heading">
          <div>
            <p className="eyebrow">USAGE</p>
            <h1>套餐与使用量</h1>
            <p>了解当前可用能力与容量，不改变已有故事的可见性。</p>
          </div>
          <Link href="/settings">返回设置</Link>
        </div>
        {content}
      </div>
    </main>
  );
}
