"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { ProtectedState } from "@/components/layout/protected-state";
import { useAuth } from "@/components/providers/auth-provider";
import { completeOnboarding } from "@/lib/data/onboarding";
import { getEntryById } from "@/lib/data/entries";
import { getFriendlyError } from "@/lib/errors";
import type { MapEntryWithProfile } from "@/types/database";
import { recordProductEvent } from "@/lib/analytics/provider";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function OnboardingCompleteView() {
  const { user, loading: authLoading, configured } = useAuth();
  const entryId = useSearchParams().get("entry");
  const [entry, setEntry] = useState<MapEntryWithProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const trackedCompletion = useRef(false);
  const invalidEntryId = !entryId || !UUID_PATTERN.test(entryId);

  useEffect(() => {
    if (authLoading || !user || !configured || invalidEntryId) return;
    let active = true;
    void getEntryById(entryId)
      .then(async (nextEntry) => {
        if (!nextEntry || nextEntry.user_id !== user.id) throw new Error("owned onboarding story not found");
        await completeOnboarding(nextEntry.id);
        if (active) {
          if (!trackedCompletion.current) {
            trackedCompletion.current = true;
            recordProductEvent("onboarding_completed", { source: "first-story" });
          }
          setEntry(nextEntry);
        }
      })
      .catch((error) => { if (active) setStatus(getFriendlyError(error, "暂时无法打开刚刚创建的故事。")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading, configured, entryId, invalidEntryId, user]);

  return (
    <main className="content-page onboarding-page">
      <AppHeader />
      <div className="narrow-container">
        {!configured ? <ProtectedState kind="config" /> : authLoading ? <ProtectedState kind="loading" /> : !user ? <ProtectedState kind="signed-out" nextPath={entryId ? `/onboarding/complete?entry=${entryId}` : "/onboarding"} signedOutDescription="登录后查看刚刚完成的故事。" /> : invalidEntryId ? <div className="content-state"><h1>无法打开完成页面</h1><p>完成链接缺少有效的故事记录。</p><Link href="/">返回地图</Link></div> : loading ? <div className="content-state" role="status">正在收好你的第一个故事…</div> : entry ? (
          <section className="onboarding-card onboarding-complete-card">
            <span className="onboarding-success-symbol" aria-hidden="true">✓</span><p className="eyebrow">STEP 3 · COMPLETE</p><h1>你的第一个故事完成了。</h1>
            <dl className="onboarding-story-summary"><div><dt>地点</dt><dd>{entry.place_name || `${entry.latitude.toFixed(4)}, ${entry.longitude.toFixed(4)}`}</dd></div><div><dt>时间</dt><dd>{entry.time_label}</dd></div><div><dt>故事</dt><dd>{entry.title}</dd></div></dl>
            <p>地图已经有了第一个坐标。接下来可以继续书写，也可以把几个地点连接成一条故事线路。</p>
            <div className="onboarding-next-actions"><Link className="primary-button nav-link" href="/?onboarding=1">创建更多故事</Link><Link className="secondary-button nav-link" href="/routes/new">创建故事线路</Link><Link className="quiet-button nav-link" href={`/?entry=${entry.id}`}>邀请共同经历者</Link></div>
          </section>
        ) : <div className="content-state"><h1>无法打开完成页面</h1><p>{status}</p><Link href="/">返回地图</Link></div>}
      </div>
    </main>
  );
}
