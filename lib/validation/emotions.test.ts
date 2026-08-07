import { describe, expect, it } from "vitest";
import {
  emotionSemanticKeySchema,
  getTagHref,
  getTagTypeLabel,
  tagInputSchema,
  tagTypeSchema,
} from "./tags";

describe("emotion tag validation", () => {
  it("accepts and normalizes stable emotion route keys", () => {
    expect(emotionSemanticKeySchema.parse(" Loneliness ")).toBe("loneliness");
    expect(emotionSemanticKeySchema.parse("turning-point")).toBe("turning-point");
  });

  it.each(["孤独", "a", "-hope", "hope_", "hope/now", "hope now"])(
    "rejects invalid emotion route key %s",
    (value) => {
      expect(emotionSemanticKeySchema.safeParse(value).success).toBe(false);
    },
  );

  it("keeps the five supported tag types explicit", () => {
    expect(tagTypeSchema.options).toEqual([
      "normal",
      "emotion",
      "theme",
      "character",
      "event",
    ]);
    expect(getTagTypeLabel("emotion")).toBe("情绪");
  });

  it("accepts hash-prefixed names without storing the hash", () => {
    expect(tagInputSchema.parse("#孤独，##希望")).toEqual(["孤独", "希望"]);
  });

  it("routes emotion tags through their stable semantic key", () => {
    expect(getTagHref({
      slug: "0123456789abcdefabcd",
      type: "emotion",
      semantic_key: "loneliness",
    })).toBe("/emotions/loneliness");
    expect(getTagHref({
      slug: "0123456789abcdefabcd",
      type: "normal",
      semantic_key: null,
    })).toBe("/tags/0123456789abcdefabcd");
  });
});
