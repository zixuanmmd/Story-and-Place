import { resolveShareBaseUrl } from "@/lib/config/site-url";

export function getRouteShareUrl(
  shareSlug: string,
  siteUrl?: string,
  currentOrigin?: string,
) {
  const base = resolveShareBaseUrl(siteUrl, currentOrigin);
  return new URL(`/routes/${encodeURIComponent(shareSlug)}`, base).toString();
}

export async function shareRoute(
  data: { title: string; text: string; url: string },
  navigatorValue: Pick<Navigator, "share" | "clipboard">,
) {
  if (navigatorValue.share) {
    try {
      await navigatorValue.share(data);
      return "shared" as const;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled" as const;
    }
  }
  if (!navigatorValue.clipboard?.writeText) throw new Error("clipboard unavailable");
  await navigatorValue.clipboard.writeText(data.url);
  return "copied" as const;
}
