import { z } from "zod";
import { getSafeRedirectPath } from "@/lib/navigation/safe-redirect";
import type { NotificationType, NotificationWithActor } from "@/types/database";

const notificationPayloadSchema = z.object({
  entry_title: z.string().max(100).optional(),
  route_title: z.string().max(100).optional(),
  group_name: z.string().max(80).optional(),
  group_slug: z.string().max(48).optional(),
  share_slug: z.string().max(20).optional(),
  time_label: z.string().max(200).optional(),
  place_name: z.string().max(300).optional(),
  editable_fields: z.array(z.string().max(32)).max(7).optional(),
  changed_fields: z.array(z.string().max(64)).max(32).optional(),
  role: z.string().max(16).optional(),
  membership_status: z.string().max(16).optional(),
  unlock_at: z.string().max(64).optional(),
  export_format: z.enum(["json", "csv", "geojson"]).optional(),
  deletion_status: z.string().max(24).optional(),
  target_path: z.string().max(256).optional(),
});

const TYPE_COPY: Record<NotificationType, { title: string; fallback: string }> = {
  entry_invitation_received: {
    title: "收到共同经历邀请",
    fallback: "有人邀请你共同记录一段经历。",
  },
  entry_invitation_accepted: {
    title: "共同经历邀请已接受",
    fallback: "受邀者已经加入这段共同经历。",
  },
  entry_invitation_declined: {
    title: "共同经历邀请已拒绝",
    fallback: "受邀者没有加入这段共同经历。",
  },
  entry_permissions_changed: {
    title: "共同编辑权限已调整",
    fallback: "你在一条共同经历中的编辑权限发生了变化。",
  },
  entry_participant_removed: {
    title: "共同经历关系已结束",
    fallback: "你已不再参与这段共同经历。",
  },
  entry_collaborator_edited: {
    title: "共同经历有了新修改",
    fallback: "共同经历者更新了一条故事。",
  },
  group_invitation_received: {
    title: "收到群组邀请",
    fallback: "有人邀请你加入一个群组。",
  },
  group_invitation_accepted: {
    title: "群组邀请已接受",
    fallback: "受邀者已经加入群组。",
  },
  group_invitation_declined: {
    title: "群组邀请已拒绝",
    fallback: "受邀者没有加入群组。",
  },
  group_joined: {
    title: "已加入群组",
    fallback: "你现在可以查看这个群组里的故事。",
  },
  group_role_changed: {
    title: "群组角色已调整",
    fallback: "你在群组中的角色发生了变化。",
  },
  group_membership_changed: {
    title: "群组成员状态已变化",
    fallback: "你在群组中的成员状态发生了变化。",
  },
  group_archived: {
    title: "群组已归档",
    fallback: "群组已经归档，历史内容将保持只读。",
  },
  story_route_updated: {
    title: "故事线路有了变化",
    fallback: "一条故事线路被有权限的成员调整。",
  },
  story_featured: {
    title: "故事被精选",
    fallback: "你的一条公开故事进入了精选内容。",
  },
  story_restricted: {
    title: "内容阅读范围受到限制",
    fallback: "一条内容因治理操作暂时受到限制。",
  },
  time_capsule_unlocked: {
    title: "时间胶囊已经解锁",
    fallback: "一段写给未来的故事已经可以打开。",
  },
  security_alert: {
    title: "账号安全提醒",
    fallback: "你的账号发生了一项需要留意的安全事件。",
  },
  export_completed: {
    title: "数据导出已完成",
    fallback: "你的数据导出已经准备完成。",
  },
  account_deletion_status: {
    title: "账号删除状态更新",
    fallback: "你的账号删除流程有了新的状态。",
  },
  product_update: {
    title: "产品更新",
    fallback: "故事情感地图有了新的变化。",
  },
};

const FIELD_LABELS: Record<string, string> = {
  title: "标题",
  content: "故事内容",
  place: "地点名称",
  location: "坐标",
  time: "时间",
  category: "地点分类",
  tags: "标签",
};

function getSubject(payload: z.infer<typeof notificationPayloadSchema>) {
  return payload.entry_title ?? payload.route_title ?? payload.group_name ?? null;
}

export function parseNotificationPayload(payload: unknown) {
  const parsed = notificationPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : {};
}

export function getNotificationPresentation(notification: NotificationWithActor) {
  const payload = parseNotificationPayload(notification.payload);
  const copy = TYPE_COPY[notification.type];
  const actor = notification.actor?.display_name;
  const subject = getSubject(payload);
  let description = copy.fallback;

  if (notification.type === "entry_collaborator_edited" && payload.changed_fields?.length) {
    const fields = payload.changed_fields
      .map((field) => FIELD_LABELS[field] ?? field)
      .slice(0, 4)
      .join("、");
    description = `${actor ?? "共同经历者"}修改了${fields}。`;
  } else if (notification.type === "entry_permissions_changed") {
    const fields = payload.editable_fields?.map((field) => FIELD_LABELS[field] ?? field);
    description = fields?.length
      ? `你现在可以修改：${fields.join("、")}。`
      : "你的共同编辑权限已被收回。";
  } else if (notification.type === "group_role_changed" && payload.role) {
    const role = payload.role === "owner" ? "群主" : payload.role === "admin" ? "管理员" : "成员";
    description = `你在群组中的角色现在是“${role}”。`;
  } else if (notification.type === "export_completed" && payload.export_format) {
    description = `${payload.export_format.toUpperCase()} 数据导出已经在当前设备生成。`;
  } else if (actor) {
    description = `${actor}：${copy.fallback}`;
  }

  const safePath = payload.target_path
    ? getSafeRedirectPath(payload.target_path, "http://local.story-map")
    : "/";
  const href = payload.target_path && safePath !== "/" ? safePath : null;

  return {
    title: copy.title,
    description,
    subject,
    href,
  };
}
