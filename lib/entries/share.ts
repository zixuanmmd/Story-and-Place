import { resolveShareBaseUrl } from "@/lib/config/site-url";

export function getEntryShareUrl(
  entryId: string,
  siteUrl?: string,
  currentOrigin?: string,
) {
  const base = resolveShareBaseUrl(siteUrl, currentOrigin);
  return new URL(`/entries/${encodeURIComponent(entryId)}`, base).toString();
}

export function getEntryShareDescription(content: string, placeName?: string | null) {
  const normalized = content.replace(/\s+/g, " ").trim();
  const excerpt = normalized.length > 150
    ? `${normalized.slice(0, 147)}…`
    : normalized;
  return placeName ? `${placeName}｜${excerpt}` : excerpt;
}

export async function shareEntry(
  data: { title: string; text: string; url: string },
  navigatorValue: Pick<Navigator, "share" | "clipboard">,
) {
  if (navigatorValue.share) {
    try {
      await navigatorValue.share(data);
      return "shared" as const;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled" as const;
      }
    }
  }
  if (!navigatorValue.clipboard?.writeText) throw new Error("clipboard unavailable");
  await navigatorValue.clipboard.writeText(data.url);
  return "copied" as const;
}
