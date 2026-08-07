import { describe, expect, it } from "vitest";
import {
  ENTRY_AUDIENCE_PRESENTATION,
  GROUP_DISCOVERY_PRESENTATION,
  ROUTE_AUDIENCE_PRESENTATION,
  getEntryAudienceActionLabel,
} from "@/lib/privacy/presentation";

describe("privacy presentation", () => {
  it("describes the actual entry audience without exposing database terms", () => {
    expect(ENTRY_AUDIENCE_PRESENTATION.private.description).toContain("共同经历者");
    expect(ENTRY_AUDIENCE_PRESENTATION.group.description).toContain("有效成员");
    expect(ENTRY_AUDIENCE_PRESENTATION.public.label).toBe("所有人");
    expect(Object.values(ENTRY_AUDIENCE_PRESENTATION).map((item) => item.label))
      .not.toContain("private");
  });

  it("keeps route-only privacy distinct from collaborative entry privacy", () => {
    expect(ROUTE_AUDIENCE_PRESENTATION.private.label).toBe("只有我");
    expect(ENTRY_AUDIENCE_PRESENTATION.private.label).not.toBe("只有我");
  });

  it("explains that a discoverable group does not expose its stories", () => {
    expect(GROUP_DISCOVERY_PRESENTATION.public.description).toContain("群组故事仍只对成员开放");
    expect(GROUP_DISCOVERY_PRESENTATION.private.label).toBe("仅受邀的人");
  });

  it("names visibility changes by their consequence", () => {
    expect(getEntryAudienceActionLabel("public")).toBe("收回为仅相关的人可见");
    expect(getEntryAudienceActionLabel("private")).toBe("改为所有人可见");
    expect(getEntryAudienceActionLabel("group")).toBe("改为所有人可见");
  });
});
