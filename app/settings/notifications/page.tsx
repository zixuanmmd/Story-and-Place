import type { Metadata } from "next";
import { NotificationSettingsView } from "@/components/settings/notification-settings-view";

export const metadata: Metadata = {
  title: "通知设置",
  robots: { index: false, follow: false },
};

export default function NotificationSettingsPage() {
  return <NotificationSettingsView />;
}
