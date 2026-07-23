export type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

export function isValidDateParts(year: number, month: number, day: number) {
  return (
    Number.isInteger(year) &&
    year >= 1 &&
    year <= 9999 &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12 &&
    Number.isInteger(day) &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

export function parseCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return isValidDateParts(year, month, day) ? { year, month, day } : null;
}

export function parseExactLocalDateTime(value: string): LocalDateTimeParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const parts: LocalDateTimeParts = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
  };

  if (!isValidDateParts(parts.year, parts.month, parts.day)) return null;
  if (!Number.isInteger(parts.hour) || parts.hour < 0 || parts.hour > 23) return null;
  if (!Number.isInteger(parts.minute) || parts.minute < 0 || parts.minute > 59) return null;
  return parts;
}

export function formatExactTimeLabel(parts: LocalDateTimeParts) {
  return `${parts.year} 年 ${parts.month} 月 ${parts.day} 日 ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function parseLegacyExactTimeLabel(label: string) {
  const match = /^(\d{1,4}) 年 (\d{1,2}) 月 (\d{1,2}) 日 (\d{2}):(\d{2})$/.exec(
    label.trim(),
  );
  if (!match) return null;
  const parts: LocalDateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  const normalized = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  return parseExactLocalDateTime(normalized) ? normalized : null;
}

export function normalizeStoredLocalDateTime(value: string | null) {
  if (!value) return null;
  const normalized = value.replace(" ", "T").slice(0, 16);
  return parseExactLocalDateTime(normalized) ? normalized : null;
}

export function isValidIanaTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function getBrowserTimeZone() {
  if (typeof Intl === "undefined") return "";
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
}
