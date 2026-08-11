import { z } from "zod";
import type { GlobalSearchResultType } from "@/types/database";

export const SEARCH_RESULT_TYPES = [
  "entry",
  "profile",
  "route",
  "tag",
  "emotion",
] as const satisfies readonly GlobalSearchResultType[];

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).nullable().transform((value) => value || null);

export const globalSearchFiltersSchema = z.object({
  query: optionalText(100).refine(
    (value) => value === null || value.length >= 2,
    "关键词至少需要两个字符。",
  ),
  startYear: z.number().int().min(1).max(9999).nullable(),
  endYear: z.number().int().min(1).max(9999).nullable(),
  place: optionalText(100),
  tag: optionalText(40),
  emotion: optionalText(40),
  authorId: z.string().uuid().nullable(),
  contentTypes: z.array(z.enum(SEARCH_RESULT_TYPES)).min(1),
}).superRefine((value, context) => {
  if (
    value.startYear !== null
    && value.endYear !== null
    && value.startYear > value.endYear
  ) {
    context.addIssue({
      code: "custom",
      path: ["endYear"],
      message: "结束年份不能早于起始年份。",
    });
  }
});

export type GlobalSearchFilters = z.infer<typeof globalSearchFiltersSchema>;

export const globalSearchResultSchema = z.object({
  result_type: z.enum(SEARCH_RESULT_TYPES),
  result_id: z.string().uuid(),
  title: z.string(),
  subtitle: z.string(),
  excerpt: z.string(),
  href: z.string().startsWith("/"),
  occurred_year: z.number().int().nullable(),
  time_label: z.string().nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  visibility: z.enum(["public", "private", "group"]).nullable(),
  place_category_slug: z.enum([
    "home", "school", "work", "food", "transport", "street", "nature",
    "landmark", "medical", "travel", "memorial", "other",
  ]).nullable(),
  author_id: z.string().uuid().nullable(),
  author_name: z.string().nullable(),
  author_avatar_url: z.string().nullable(),
  tag_type: z.enum(["normal", "emotion", "theme", "character", "event"]).nullable(),
  tag_slug: z.string().nullable(),
  share_slug: z.string().nullable(),
  created_at: z.string(),
  total_count: z.coerce.number().int().nonnegative(),
});

export const DEFAULT_GLOBAL_SEARCH_FILTERS: GlobalSearchFilters = {
  query: null,
  startYear: null,
  endYear: null,
  place: null,
  tag: null,
  emotion: null,
  authorId: null,
  contentTypes: [...SEARCH_RESULT_TYPES],
};

export function hasActiveSearch(filters: GlobalSearchFilters) {
  return Boolean(
    filters.query
    || filters.startYear !== null
    || filters.endYear !== null
    || filters.place
    || filters.tag
    || filters.emotion
    || filters.authorId,
  );
}

export function parseNullableYear(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

export type RawGlobalSearchParams = Record<
  string,
  string | string[] | undefined
>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function filtersFromSearchParams(params: RawGlobalSearchParams) {
  const contentTypes = (first(params.types) ?? "")
    .split(",")
    .filter((value): value is (typeof SEARCH_RESULT_TYPES)[number] =>
      SEARCH_RESULT_TYPES.includes(value as (typeof SEARCH_RESULT_TYPES)[number]),
    );
  const candidate = {
    query: first(params.q)?.trim() || null,
    startYear: parseNullableYear(first(params.from) ?? ""),
    endYear: parseNullableYear(first(params.to) ?? ""),
    place: first(params.place)?.trim() || null,
    tag: first(params.tag)?.trim().replace(/^#+/, "") || null,
    emotion: first(params.emotion)?.trim().replace(/^#+/, "") || null,
    authorId: first(params.author)?.trim() || null,
    contentTypes: contentTypes.length ? contentTypes : [...SEARCH_RESULT_TYPES],
  };
  const parsed = globalSearchFiltersSchema.safeParse(candidate);
  return parsed.success ? parsed.data : DEFAULT_GLOBAL_SEARCH_FILTERS;
}
