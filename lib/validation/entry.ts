import { z } from "zod";
import type {
  EntryVisibility,
  MapEntry,
  MapEntryInsert,
  PlaceCategorySlug,
  TimePrecision,
} from "@/types/database";
import { PLACE_CATEGORIES } from "@/lib/categories/registry";
import {
  formatExactTimeLabel,
  isValidIanaTimeZone,
  normalizeStoredLocalDateTime,
  parseCalendarDate,
  parseExactLocalDateTime,
  parseLegacyExactTimeLabel,
} from "@/lib/time/local-date-time";

export const TIME_PRECISIONS = [
  "exact",
  "date",
  "month",
  "year",
  "approximate",
] as const;

export const VISIBILITIES = ["public", "private", "group"] as const;
export const PLACE_CATEGORY_SLUGS = PLACE_CATEGORIES.map(
  (category) => category.slug,
) as [PlaceCategorySlug, ...PlaceCategorySlug[]];

export const TIME_PRECISION_LABELS: Record<TimePrecision, string> = {
  exact: "精确时间",
  date: "日期",
  month: "月份",
  year: "年份",
  approximate: "大致时间",
};

export const VISIBILITY_LABELS: Record<EntryVisibility, string> = {
  public: "公开",
  private: "私密",
  group: "群组",
};

export const entryFormSchema = z
  .object({
    title: z.string().trim().min(1, "请输入标题。").max(100, "标题不能超过 100 个字符。"),
    content: z
      .string()
      .trim()
      .min(1, "请输入事件内容。")
      .max(5000, "事件内容不能超过 5000 个字符。"),
    place_name: z.string().trim().max(200, "地点名称不能超过 200 个字符。"),
    latitude: z
      .number({ error: "请输入有效纬度。" })
      .min(-90, "纬度必须在 -90 至 90 之间。")
      .max(90, "纬度必须在 -90 至 90 之间。"),
    longitude: z
      .number({ error: "请输入有效经度。" })
      .min(-180, "经度必须在 -180 至 180 之间。")
      .max(180, "经度必须在 -180 至 180 之间。"),
    time_precision: z.enum(TIME_PRECISIONS, { error: "请选择有效的时间精度。" }),
    time_value: z.string().trim().min(1, "请填写事件发生时间。"),
    occurred_timezone: z.string().trim().max(100, "时区名称不能超过 100 个字符。"),
    visibility: z.enum(VISIBILITIES, { error: "请选择有效的可见性。" }),
    group_id: z.string(),
    place_category_slug: z.enum(PLACE_CATEGORY_SLUGS, {
      error: "请选择有效的地点分类。",
    }),
    allow_comments: z.boolean(),
  })
  .superRefine((values, context) => {
    const invalid = (message: string) =>
      context.addIssue({ code: "custom", path: ["time_value"], message });

    switch (values.time_precision) {
      case "exact":
        if (!parseExactLocalDateTime(values.time_value)) {
          invalid("请输入有效的精确时间。");
        }
        if (
          values.occurred_timezone &&
          !isValidIanaTimeZone(values.occurred_timezone)
        ) {
          context.addIssue({
            code: "custom",
            path: ["occurred_timezone"],
            message: "请输入有效的 IANA 时区，例如 Asia/Shanghai。",
          });
        }
        break;
      case "date":
        if (!parseCalendarDate(values.time_value)) {
          invalid("请输入有效日期。");
        }
        break;
      case "month":
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(values.time_value)) {
          invalid("请输入有效月份。");
        }
        break;
      case "year": {
        const year = Number(values.time_value);
        if (!/^\d{1,4}$/.test(values.time_value) || !Number.isInteger(year) || year < 1) {
          invalid("年份必须是 1 至 9999 之间的整数。");
        }
        break;
      }
      case "approximate":
        if (values.time_value.length > 120) {
          invalid("大致时间描述不能超过 120 个字符。");
        }
        break;
    }
    if (
      values.visibility === "group" &&
      !z.string().uuid().safeParse(values.group_id).success
    ) {
      context.addIssue({
        code: "custom",
        path: ["group_id"],
        message: "请选择一个你已加入的群组。",
      });
    }
    if (values.visibility !== "group" && values.group_id) {
      context.addIssue({
        code: "custom",
        path: ["group_id"],
        message: "只有群组记录可以关联群组。",
      });
    }
  });

export type EntryFormValues = z.infer<typeof entryFormSchema>;

type EntryPayload = Pick<
  MapEntryInsert,
  | "title"
  | "content"
  | "place_name"
  | "latitude"
  | "longitude"
  | "occurred_local"
  | "occurred_timezone"
  | "occurred_date"
  | "occurred_year"
  | "time_precision"
  | "time_label"
  | "visibility"
  | "group_id"
  | "place_category_slug"
  | "allow_comments"
>;

export function entryValuesToPayload(
  values: EntryFormValues,
): EntryPayload {
  const base = {
    title: values.title.trim(),
    content: values.content.trim(),
    place_name: values.place_name.trim() || null,
    latitude: values.latitude,
    longitude: values.longitude,
    visibility: values.visibility,
    group_id: values.visibility === "group" ? values.group_id : null,
    place_category_slug: values.place_category_slug,
    allow_comments: values.allow_comments,
    time_precision: values.time_precision,
    occurred_local: null,
    occurred_timezone: null,
    occurred_date: null,
    occurred_year: null,
    time_label: values.time_value.trim(),
  } satisfies EntryPayload;

  if (values.time_precision === "exact") {
    const parts = parseExactLocalDateTime(values.time_value);
    if (!parts) throw new Error("Invalid exact local date-time after validation.");
    return {
      ...base,
      occurred_local: values.time_value,
      occurred_timezone: values.occurred_timezone.trim() || null,
      occurred_date: values.time_value.slice(0, 10),
      occurred_year: parts.year,
      time_label: formatExactTimeLabel(parts),
    };
  }

  if (values.time_precision === "date") {
    const [year, month, day] = values.time_value.split("-").map(Number);
    return {
      ...base,
      occurred_date: values.time_value,
      occurred_year: year,
      time_label: `${year} 年 ${month} 月 ${day} 日`,
    };
  }

  if (values.time_precision === "month") {
    const [year, month] = values.time_value.split("-").map(Number);
    return {
      ...base,
      occurred_date: `${values.time_value}-01`,
      occurred_year: year,
      time_label: `${year} 年 ${month} 月`,
    };
  }

  if (values.time_precision === "year") {
    return {
      ...base,
      occurred_year: Number(values.time_value),
      time_label: `${Number(values.time_value)} 年`,
    };
  }

  const recognizableYear = values.time_value.match(/(?:^|\D)(\d{4})(?:\D|$)/)?.[1];
  return {
    ...base,
    occurred_year: recognizableYear ? Number(recognizableYear) : null,
    time_label: values.time_value.trim(),
  };
}

export function entryToFormValues(entry: MapEntry): EntryFormValues {
  let timeValue = entry.time_label;
  if (entry.time_precision === "exact") {
    timeValue =
      normalizeStoredLocalDateTime(entry.occurred_local) ??
      parseLegacyExactTimeLabel(entry.time_label) ??
      "";
  }
  if (entry.time_precision === "date") timeValue = entry.occurred_date ?? "";
  if (entry.time_precision === "month") timeValue = entry.occurred_date?.slice(0, 7) ?? "";
  if (entry.time_precision === "year") timeValue = String(entry.occurred_year ?? "");

  return {
    title: entry.title,
    content: entry.content,
    place_name: entry.place_name ?? "",
    latitude: entry.latitude,
    longitude: entry.longitude,
    time_precision: entry.time_precision,
    time_value: timeValue,
    occurred_timezone: entry.occurred_timezone ?? "",
    visibility: entry.visibility,
    group_id: entry.group_id ?? "",
    place_category_slug: entry.place_category_slug,
    allow_comments: entry.allow_comments,
  };
}
