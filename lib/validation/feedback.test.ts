import { describe, expect, it } from "vitest";
import {
  feedbackSubmissionSchema,
  normalizeFeedbackRoute,
} from "@/lib/validation/feedback";

describe("product feedback validation", () => {
  it("accepts a bounded category, message and internal route", () => {
    expect(feedbackSubmissionSchema.parse({
      category: "feature",
      message: " 希望时间线支持打印。 ",
      currentRoute: "/timeline",
    })).toEqual({
      category: "feature",
      message: "希望时间线支持打印。",
      currentRoute: "/timeline",
    });
  });

  it("rejects blank, oversized and unknown feedback", () => {
    expect(() => feedbackSubmissionSchema.parse({
      category: "unknown",
      message: " ",
      currentRoute: "/",
    })).toThrow();
    expect(() => feedbackSubmissionSchema.parse({
      category: "bug",
      message: "a".repeat(2001),
      currentRoute: "/",
    })).toThrow();
  });

  it("keeps only a safe pathname and never retains query data", () => {
    expect(normalizeFeedbackRoute("/entries/id?secret=value#part")).toBe("/entries/id");
    expect(normalizeFeedbackRoute("https://evil.example/path")).toBe("/");
    expect(normalizeFeedbackRoute("/help\nforged")).toBe("/");
  });
});
