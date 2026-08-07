"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { ProtectedState } from "@/components/layout/protected-state";
import { useAuth } from "@/components/providers/auth-provider";
import {
  ensureOnboardingDecision,
  saveOnboardingInterests,
  skipOnboarding,
} from "@/lib/data/onboarding";
import { getFriendlyError } from "@/lib/errors";
import {
  ONBOARDING_INTERESTS,
  type OnboardingInterest,
} from "@/lib/validation/onboarding";
import { getTemplateForInterests } from "@/lib/templates/story-templates";

export function OnboardingView() {
  const { user, loading: authLoading, configured } = useAuth();
  const router = useRouter();
  const [selected, setSelected] = useState<OnboardingInterest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user || !configured) return;
    let active = true;
    void ensureOnboardingDecision(user.id)
      .then((decision) => {
        if (!active) return;
        if (!decision.shouldOnboard) {
          router.replace("/");
          return;
        }
        setSelected(decision.preference.interests as OnboardingInterest[]);
      })
      .catch((error) => {
        if (active) setStatus(getFriendlyError(error, "首次使用引导暂时无法读取。请确认最新 migration 已执行。"));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading, configured, router, user]);

  const continueToMap = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await saveOnboardingInterests(selected);
      const params = new URLSearchParams({ onboarding: "1" });
      const template = getTemplateForInterests(selected);
      if (template) params.set("template", template);
      router.push(`/?${params.toString()}`);
    } catch (error) {
      setStatus(getFriendlyError(error, "暂时无法保存选择，请稍后重试。"));
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await skipOnboarding(selected);
      router.replace("/");
    } catch (error) {
      setStatus(getFriendlyError(error, "暂时无法跳过引导，请稍后重试。"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="content-page onboarding-page">
      <AppHeader />
      <div className="narrow-container">
        {!configured ? <ProtectedState kind="config" /> : authLoading ? <ProtectedState kind="loading" /> : !user ? <ProtectedState kind="signed-out" nextPath="/onboarding" signedOutDescription="登录后开始建立你的第一张故事地图。" /> : loading ? <div className="content-state" role="status">正在准备你的故事地图…</div> : (
          <section className="onboarding-card">
            <p className="eyebrow">STEP 1 · WELCOME</p>
            <h1>记录人与地点、时间和故事之间的关系。</h1>
            <p className="onboarding-lead">不用先想好一生要写什么。选择一个更接近你的方向，接下来从一个地方开始。选择不会公开，也可以跳过。</p>
            <fieldset className="onboarding-interest-list"><legend>你想记录什么？</legend>{ONBOARDING_INTERESTS.map((interest) => {
              const checked = selected.includes(interest.value);
              return <label key={interest.value} className={checked ? "is-selected" : ""}><input type="checkbox" checked={checked} onChange={() => setSelected((current) => checked ? current.filter((value) => value !== interest.value) : [...current, interest.value])} /><span><strong>{interest.label}</strong><small>{interest.description}</small></span></label>;
            })}</fieldset>
            {status ? <div className="inline-error" role="alert">{status}</div> : null}
            <div className="onboarding-actions"><button className="primary-button" type="button" disabled={busy} onClick={() => void continueToMap()}>{busy ? "正在保存…" : "选择一个地点"}</button><button className="quiet-button" type="button" disabled={busy} onClick={() => void skip()}>暂时跳过</button></div>
          </section>
        )}
      </div>
    </main>
  );
}
