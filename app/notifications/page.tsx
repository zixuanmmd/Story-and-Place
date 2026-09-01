import type { Metadata } from "next";
import { NotificationsView } from "@/components/notifications/notifications-view";

export const metadata: Metadata = {
  title: "通知",
  robots: { index: false, follow: false },
};

export default function NotificationsPage() {
  return <NotificationsView />;
}
