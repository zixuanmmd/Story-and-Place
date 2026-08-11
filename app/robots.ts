import type { MetadataRoute } from "next";
import { resolveServerSiteUrl } from "@/lib/config/site-url";

function getSiteUrl() {
  return resolveServerSiteUrl({
    publicSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    vercelProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    vercelUrl: process.env.VERCEL_URL,
  });
}
export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/account-deleted",
        "/entry-invitations",
        "/feed",
        "/groups/invitations",
        "/my-records",
        "/onboarding",
        "/settings",
      ],
    },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
    host: siteUrl.origin,
  };
}
