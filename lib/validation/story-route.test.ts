import { describe, expect, it } from "vitest";
import { parseRouteSelectionDraft, storyRouteSchema } from "./story-route";

const id1 = "00000000-0000-4000-8000-000000000001";
const id2 = "00000000-0000-4000-8000-000000000002";

describe("story route validation", () => {
  it("allows a one-node draft but requires two nodes when publishing", () => {
    const base = {
      id: null,
      title: "回家的路",
      description: "",
      visibility: "private" as const,
      group_id: null,
      items: [{ entry_id: id1, position: 1, note: "" }],
    };
    expect(storyRouteSchema.safeParse({ ...base, publish: false }).success).toBe(true);
    expect(storyRouteSchema.safeParse({ ...base, publish: true }).success).toBe(false);
    expect(storyRouteSchema.safeParse({
      ...base,
      publish: true,
      items: [...base.items, { entry_id: id2, position: 2, note: "" }],
    }).success).toBe(true);
  });

  it("rejects duplicate nodes and mismatched group visibility", () => {
    const result = storyRouteSchema.safeParse({
      id: null,
      title: "路线",
      description: "",
      visibility: "group",
      group_id: null,
      publish: false,
      items: [
        { entry_id: id1, position: 1, note: "" },
        { entry_id: id1, position: 2, note: "" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("safely ignores damaged selection drafts", () => {
    expect(parseRouteSelectionDraft("{broken")).toEqual([]);
    expect(parseRouteSelectionDraft(JSON.stringify({ version: 2, entryIds: [id1] }))).toEqual([]);
    expect(parseRouteSelectionDraft(JSON.stringify({ version: 1, entryIds: [id1] }))).toEqual([id1]);
  });
});
