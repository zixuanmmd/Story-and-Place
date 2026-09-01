import type { Metadata } from "next";
import { UsageView } from "@/components/settings/usage-view";

export const metadata: Metadata = {
  title: "套餐与使用量",
  robots: { index: false, follow: false },
};

export default function UsagePage() {
  return <UsageView />;
}
