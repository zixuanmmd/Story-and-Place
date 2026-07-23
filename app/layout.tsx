import type { Metadata } from "next";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";
import "./error-states.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "故事情感地图",
    template: "%s｜故事情感地图",
  },
  description: "把故事留在发生的地方，在地图上重访时间与记忆。",
  openGraph: {
    type: "website",
    locale: "zh_CN",
    title: "故事情感地图",
    description: "把故事留在发生的地方，在地图上重访时间与记忆。",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "故事情感地图：把故事留在发生的地方",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "故事情感地图",
    description: "把故事留在发生的地方，在地图上重访时间与记忆。",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
