import type { Metadata } from "next";
import { OnboardingView } from "@/components/onboarding/onboarding-view";

export const metadata: Metadata = { title: "开始第一段故事" };

export default function OnboardingPage() {
  return <OnboardingView />;
}
