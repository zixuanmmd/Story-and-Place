import { describe, expect, it } from "vitest";
import { groupFormSchema } from "./groups";
import { commentSchema, reportSchema } from "./social";

describe("群组与社交校验", () => {
  it("接受合法群组并拒绝危险 slug", () => {
    const base = {
      name: "旧城故事",
      slug: "old-town",
      description: "",
      avatar_url: "",
      visibility: "public",
    };
    expect(groupFormSchema.safeParse(base).success).toBe(true);
    expect(groupFormSchema.safeParse({ ...base, slug: "../admin" }).success).toBe(false);
  });

  it("拒绝空白和超长评论", () => {
    expect(commentSchema.safeParse({ content: "   " }).success).toBe(false);
    expect(commentSchema.safeParse({ content: "字".repeat(1001) }).success).toBe(false);
  });

  it("只接受预设举报原因和目标", () => {
    expect(reportSchema.safeParse({
      target_type: "entry",
      target_id: "51000000-0000-4000-8000-000000000001",
      reason: "privacy",
      description: "",
    }).success).toBe(true);
    expect(reportSchema.safeParse({
      target_type: "entry",
      target_id: "51000000-0000-4000-8000-000000000001",
      reason: "invented",
      description: "",
    }).success).toBe(false);
  });
});

