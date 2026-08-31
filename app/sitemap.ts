import type { MetadataRoute } from "next";
import { resolveServerSiteUrl } from "@/lib/config/site-url";

const PUBLIC_ROUTES = [
  "/",
  "/explore",
  "/search",
  "/tags",
  "/groups",
  "/help",
  "/terms",
  "/privacy",
  "/community-guidelines",
  "/status",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = resolveServerSiteUrl({
    publicSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    vercelProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    vercelUrl: process.env.VERCEL_URL,
  });
  const lastModified = new Date();

  return PUBLIC_ROUTES.map((path) => ({
    url: new URL(path, siteUrl).toString(),
    lastModified,
    changeFrequency: path === "/" || path === "/explore" ? "daily" : "weekly",
    priority: path === "/" ? 1 : path === "/explore" ? 0.9 : 0.7,
  }));
}
