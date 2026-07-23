import { describe, expect, it } from "vitest";
import { canRenderGroupEntry, filterEntriesForActiveGroups } from "./group-scope";
import type { MapEntryWithProfile } from "@/types/database";

function entry(id: string, visibility: "public" | "private" | "group", groupId: string | null) {
  return { id, visibility, group_id: groupId } as MapEntryWithProfile;
}

describe("群组数据作用域", () => {
  it("成员资格不匹配的数据永远不参与渲染", () => {
    const visible = filterEntriesForActiveGroups(
      [
        entry("public", "public", null),
        entry("joined", "group", "group-a"),
        entry("removed", "group", "group-b"),
      ],
      ["group-a"],
    );
    expect(visible.map((item) => item.id)).toEqual(["public", "joined"]);
  });

  it("成员被移除后选中的群组详情立即关闭", () => {
    const selected = entry("selected", "group", "group-a");
    expect(canRenderGroupEntry(selected, ["group-a"])).toBe(true);
    expect(canRenderGroupEntry(selected, [])).toBe(false);
  });
});

