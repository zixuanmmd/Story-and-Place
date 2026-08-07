import type { Metadata } from "next";
import { ExploreView } from "@/components/explore/explore-view";

export const metadata: Metadata = {
  title: "探索公开故事",
  description: "按文学、城市记忆、旅行、科幻和虚构世界发现已经公开并解锁的地点故事。",
};

export default function ExplorePage() {
  return <ExploreView />;
}
