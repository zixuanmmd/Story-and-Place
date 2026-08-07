import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("privacy UX contracts", () => {
  it("asks about people instead of database visibility in the entry form", () => {
    const entryForm = read("../../components/forms/entry-form.tsx");

    expect(entryForm).toContain("谁可以看到？");
    expect(entryForm).toContain("ENTRY_AUDIENCE_PRESENTATION.private");
    expect(entryForm).not.toContain("<legend>可见性");
  });

  it("explains the route audience and group discovery separately", () => {
    const routeBuilder = read("../../components/routes/story-route-builder.tsx");
    const groupForm = read("../../components/groups/group-form.tsx");

    expect(routeBuilder).toContain("谁可以看到这条路线？");
    expect(routeBuilder).toContain("ROUTE_AUDIENCE_PRESENTATION");
    expect(groupForm).toContain("谁可以发现并加入？");
    expect(groupForm).toContain("GROUP_DISCOVERY_PRESENTATION");
  });

  it("states that collaborator field permissions do not include owner controls", () => {
    const participants = read("../../components/entries/entry-participants.tsx");

    expect(participants).toContain("谁可以共同经历与修改？");
    expect(participants).toContain("更改阅读范围和管理邀请始终只属于创建者");
  });
});
