export const DISPLAY_NAME_TAKEN_MESSAGE = "这个昵称已经被使用，请换一个。";

export function normalizeDisplayNameForStorage(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeDisplayNameForComparison(value: string) {
  return normalizeDisplayNameForStorage(value).toLocaleLowerCase("en-US");
}

export function isDisplayNameLengthValid(value: string) {
  const normalized = normalizeDisplayNameForStorage(value);
  return normalized.length >= 1 && normalized.length <= 80;
}
