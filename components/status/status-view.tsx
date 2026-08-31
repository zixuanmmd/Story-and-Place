"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { AppHeader } from "@/components/navigation/app-header";

const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  checks: z.object({
    app: z.literal("ok"),
    database: z.enum(["ok", "degraded"]),
    media: z.enum(["ok", "degraded"]),
  }),
  version: z.string().min(1).max(80),
  checkedAt: z.string().datetime(),
});

type HealthResponse = z.infer<typeof healthResponseSchema>;

const CHECKS = [
  ["app", "Web App"],
  ["database", "Database"],
  ["media", "Media"],
] as const;

export function StatusView() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/health", {
        cache: "no-store",
        signal: AbortSignal.timeout(6_000),
      });
      const payload = healthResponseSchema.parse(await response.json());
      setHealth(payload);
      if (!response.ok || payload.status === "degraded") {
        setError("部分服务当前状态异常，我们正在保守地显示检查结果。");
      }
    } catch {
      setHealth(null);
      setError("状态信息暂时无法读取，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  return (
    <main className="content-page">
      <AppHeader />
      <div className="content-container content-container--narrow">
        <div className="page-heading">
          <div>
            <p className="eyebrow">STATUS</p>
            <h1>服务状态</h1>
            <p>这里只显示当前检查，不提供或伪造历史 SLA。</p>
          </div>
        </div>
        <section className="settings-section-card status-card" aria-labelledby="current-status-title">
          <div className="settings-section-heading">
            <div>
              <h2 id="current-status-title">当前状态</h2>
              <p>
                {loading && !health
                  ? "正在检查 Web App、数据库和媒体服务。"
                  : health?.status === "ok"
                    ? "所有已检查服务运行正常。"
                    : "状态检查可能存在异常。"}
              </p>
            </div>
            <button className="secondary-button" type="button" disabled={loading} onClick={() => void load()}>
              {loading ? "检查中…" : "重新检查"}
            </button>
          </div>
          {health ? (
            <dl className="status-check-list">
              {CHECKS.map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd className={health.checks[key] === "ok" ? "status-ok" : "status-degraded"}>
                    <span aria-hidden="true" />
                    {health.checks[key] === "ok" ? "正常" : "降级"}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {error ? <div className="notice" role="status">{error}</div> : null}
          {health ? (
            <p className="field-meta">
              版本 {health.version} · 检查时间 {new Date(health.checkedAt).toLocaleString("zh-CN")}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
