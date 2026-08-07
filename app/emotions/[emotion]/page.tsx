import type { Metadata } from "next";
import { EmotionEntriesView } from "@/components/tags/tag-entries-view";

export const metadata: Metadata = {
  title: "情绪故事",
  description: "沿着一种情绪，阅读散落在不同地点的公开故事。",
};

export default async function EmotionPage({
  params,
}: {
  params: Promise<{ emotion: string }>;
}) {
  const { emotion } = await params;
  return <EmotionEntriesView emotion={emotion} />;
}
