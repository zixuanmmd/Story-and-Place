import { z } from "zod";

export const feedbackCategorySchema = z.enum([
  "bug",
  "feature",
  "content",
  "other",
]);

export const feedbackSubmissionSchema = z.object({
  category: feedbackCategorySchema,
  message: z.string().trim().min(1, "请写下你想告诉我们的内容。").max(2000),
  currentRoute: z.string()
    .min(1)
    .max(240)
    .startsWith("/")
    .refine((value) => !/[\u0000-\u001f\u007f?#]/u.test(value), "页面地址格式无效。"),
}).strict();

export type FeedbackCategory = z.infer<typeof feedbackCategorySchema>;
export type FeedbackSubmission = z.infer<typeof feedbackSubmissionSchema>;

export function normalizeFeedbackRoute(value: string | null | undefined) {
  if (!value) return "/";
  const path = value.split("?", 1)[0]?.split("#", 1)[0] ?? "/";
  return feedbackSubmissionSchema.shape.currentRoute.safeParse(path).success
    ? path
    : "/";
}
