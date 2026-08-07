import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingCompleteView } from "@/components/onboarding/onboarding-complete-view";

export const metadata: Metadata = { title: "第一个故事完成" };

export default function OnboardingCompletePage() {
  return <Suspense fallback={<div className="page-loading">正在收好你的故事…</div>}><OnboardingCompleteView /></Suspense>;
}
