import { describe, expect, it } from "vitest";
import type { NotificationWithActor } from "@/types/database";
import {
  createScopedNotificationState,
  getRenderableNotifications,
  getRenderableUnreadCount,
  mergeNotifications,
} from "./scoped-state";

function row(id: string, createdAt: string): NotificationWithActor {
  return {
    id,
    user_id: "user-a",
    type: "product_update",
    category: "product_updates",
    actor_id: null,
    entity_type: null,
    entity_id: null,
    payload: {},
    dedupe_key: id,
    read_at: null,
    created_at: createdAt,
    actor: null,
  };
}

describe("notification identity scope", () => {
  it("never renders A notifications or count inside B scope", () => {
    const state = {
      ...createScopedNotificationState("user-a"),
      notifications: [row("a", "2026-08-28T10:00:00Z")],
      unreadCount: 1,
    };
    expect(getRenderableNotifications(state, "user-b")).toEqual([]);
    expect(getRenderableUnreadCount(state, "user-b")).toBe(0);
  });

  it("deduplicates Realtime refreshes by stable notification id", () => {
    const first = row("a", "2026-08-28T10:00:00Z");
    const updated = { ...first, read_at: "2026-08-28T10:05:00Z" };
    expect(mergeNotifications([first], [updated])).toEqual([updated]);
  });

  it("keeps merged pages in deterministic newest-first order", () => {
    const older = row("a", "2026-08-27T10:00:00Z");
    const newer = row("b", "2026-08-28T10:00:00Z");
    expect(mergeNotifications([older], [newer]).map((item) => item.id)).toEqual(["b", "a"]);
  });
});
