import type { EntryVisibility } from "@/types/database";

export type PrivacyPresentation = {
  glyph: string;
  label: string;
  shortLabel: string;
  description: string;
};

export const ENTRY_AUDIENCE_PRESENTATION: Record<
  EntryVisibility,
  PrivacyPresentation
> = {
  private: {
    glyph: "▣",
    label: "我和受邀共同经历者",
    shortLabel: "我和受邀者可见",
    description: "只有你和已接受邀请的共同经历者可以看到；没有受邀者时仅你可见。",
  },
  group: {
    glyph: "◇",
    label: "所属群组成员",
    shortLabel: "群组成员可见",
    description: "只有所选群组的有效成员可以看到，成员资格失效后会立即失去访问权。",
  },
  public: {
    glyph: "◉",
    label: "所有人",
    shortLabel: "所有人可见",
    description: "任何访客都可以在地图、探索页和你的公开主页中看到。",
  },
};

export const ROUTE_AUDIENCE_PRESENTATION: Record<
  EntryVisibility,
  PrivacyPresentation
> = {
  private: {
    glyph: "▣",
    label: "只有我",
    shortLabel: "只有我可见",
    description: "只有你可以打开；可以使用自己有权读取的地点故事。",
  },
  group: {
    glyph: "◇",
    label: "所属群组成员",
    shortLabel: "群组成员可见",
    description: "只有所选群组的有效成员可以打开。",
  },
  public: {
    glyph: "◉",
    label: "所有人",
    shortLabel: "所有人可见",
    description: "任何拿到链接的人都可以打开；所有节点必须是你的公开故事。",
  },
};

export const GROUP_DISCOVERY_PRESENTATION = {
  public: {
    glyph: "◉",
    label: "任何人都能发现",
    shortLabel: "公开可发现",
    description: "所有人可以查看群组简介，登录用户可以直接加入；群组故事仍只对成员开放。",
  },
  private: {
    glyph: "▣",
    label: "仅受邀的人",
    shortLabel: "仅邀请加入",
    description: "只有收到邀请并接受的人可以进入和查看群组内容。",
  },
} as const;

export function getEntryAudienceActionLabel(visibility: EntryVisibility) {
  return visibility === "public" ? "收回为仅相关的人可见" : "改为所有人可见";
}
