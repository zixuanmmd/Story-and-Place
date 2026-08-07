import type { Metadata } from "next";
import { TagDirectoryView } from "@/components/tags/tag-directory-view";

export const metadata: Metadata = {
  title: "故事标签",
  description: "按普通、情绪、主题、人物和事件类型浏览有权读取的故事标签。",
};

export default function TagsPage() {
  return <TagDirectoryView />;
}
