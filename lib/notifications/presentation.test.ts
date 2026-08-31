import { describe, expect, it } from "vitest";
import type { NotificationWithActor } from "@/types/database";
import {
  getNotificationPresentation,
  parseNotificationPayload,
} from "./presentation";

function notification(
  overrides: Partial<NotificationWithActor> = {},
): NotificationWithActor {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    user_id: "20000000-0000-4000-8000-000000000002",
    type: "entry_collaborator_edited",
    category: "collaboration",
    actor_id: "30000000-0000-4000-8000-000000000003",
    entity_type: "entry",
    entity_id: "40000000-0000-4000-8000-000000000004",
    payload: {
      entry_title: "成都的夏天",
      changed_fields: ["time", "content"],
      target_path: "/entries/40000000-0000-4000-8000-000000000004",
    },
    dedupe_key: "edit:1",
    read_at: null,
    created_at: "2026-08-28T00:00:00.000Z",
    actor: { display_name: "山音", avatar_url: null },
    ...overrides,
  };
}

describe("notification presentation", () => {
  it("renders safe summaries without exposing raw JSON", () => {
    const result = getNotificationPresentation(notification());
    expect(result.title).toBe("共同经历有了新修改");
    expect(result.subject).toBe("成都的夏天");
    expect(result.description).toBe("山音修改了时间、故事内容。");
    expect(result.href).toBe("/entries/40000000-0000-4000-8000-000000000004");
  });

  it("drops unknown fields and rejects unsafe target paths", () => {
    const payload = parseNotificationPayload({
      content: "不应渲染的私密正文",
      access_token: "secret",
      target_path: "https://evil.example",
    });
    expect(payload).toEqual({ target_path: "https://evil.example" });
    const result = getNotificationPresentation(notification({ payload }));
    expect(result.href).toBeNull();
    expect(JSON.stringify(result)).not.toContain("私密正文");
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("falls back safely when an entity or actor no longer exists", () => {
    const result = getNotificationPresentation(notification({
      actor: null,
      payload: {},
      entity_id: null,
      entity_type: null,
    }));
    expect(result.description).toBe("共同经历者更新了一条故事。");
    expect(result.href).toBeNull();
  });
});
