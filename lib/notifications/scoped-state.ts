import type { NotificationWithActor } from "@/types/database";

export type ScopedNotificationState = {
  scope: string;
  notifications: NotificationWithActor[];
  unreadCount: number;
};

export function createScopedNotificationState(scope: string): ScopedNotificationState {
  return { scope, notifications: [], unreadCount: 0 };
}

export function getRenderableNotifications(
  state: ScopedNotificationState,
  currentScope: string,
) {
  return state.scope === currentScope ? state.notifications : [];
}

export function getRenderableUnreadCount(
  state: Pick<ScopedNotificationState, "scope" | "unreadCount">,
  currentScope: string,
) {
  return state.scope === currentScope ? state.unreadCount : 0;
}

export function mergeNotifications(
  current: NotificationWithActor[],
  incoming: NotificationWithActor[],
) {
  const byId = new Map(current.map((notification) => [notification.id, notification]));
  for (const notification of incoming) byId.set(notification.id, notification);
  return [...byId.values()].sort((left, right) => {
    const byCreatedAt = right.created_at.localeCompare(left.created_at);
    return byCreatedAt || right.id.localeCompare(left.id);
  });
}
