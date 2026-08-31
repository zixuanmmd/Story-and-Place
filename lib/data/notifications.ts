import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  NotificationCategory,
  NotificationDeliveryMode,
  NotificationPreference,
  NotificationWithActor,
} from "@/types/database";

export const NOTIFICATION_PAGE_SIZE = 20;

const NOTIFICATION_SELECT = `
  *,
  actor:profiles!notifications_actor_id_fkey(display_name, avatar_url)
`;

export async function listNotifications(page: number) {
  const from = Math.max(page, 0) * NOTIFICATION_PAGE_SIZE;
  const { data, error } = await getSupabaseBrowserClient()
    .from("notifications")
    .select(NOTIFICATION_SELECT)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + NOTIFICATION_PAGE_SIZE);
  if (error) throw error;
  return {
    notifications: data.slice(0, NOTIFICATION_PAGE_SIZE) as unknown as NotificationWithActor[],
    hasMore: data.length > NOTIFICATION_PAGE_SIZE,
  };
}

export async function getUnreadNotificationCount() {
  const { count, error } = await getSupabaseBrowserClient()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function syncMyTimeCapsuleNotifications() {
  const { data, error } = await getSupabaseBrowserClient().rpc(
    "sync_my_time_capsule_notifications",
    { p_limit: 100 },
  );
  if (error) throw error;
  return data;
}

export async function markNotificationRead(notificationId: string) {
  const { error } = await getSupabaseBrowserClient().rpc(
    "mark_notification_read",
    { p_notification_id: notificationId },
  );
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const { data, error } = await getSupabaseBrowserClient().rpc(
    "mark_all_notifications_read",
  );
  if (error) throw error;
  return data;
}

export async function recordMyExportCompleted(
  format: "json" | "csv" | "geojson",
) {
  const { error } = await getSupabaseBrowserClient().rpc(
    "record_my_export_completed",
    { p_format: format },
  );
  if (error) throw error;
}

export async function listNotificationPreferences() {
  const { data, error } = await getSupabaseBrowserClient()
    .from("notification_preferences")
    .select("*")
    .order("category", { ascending: true });
  if (error) throw error;
  return data as NotificationPreference[];
}

export async function saveNotificationPreference(
  category: NotificationCategory,
  deliveryMode: NotificationDeliveryMode,
) {
  const { data, error } = await getSupabaseBrowserClient().rpc(
    "set_notification_preference",
    {
      p_category: category,
      p_delivery_mode: deliveryMode,
    },
  );
  if (error) throw error;
  return data;
}
