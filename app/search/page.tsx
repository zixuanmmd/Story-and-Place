import type { Metadata } from "next";
import { GlobalSearchView } from "@/components/search/global-search-view";
import {
  filtersFromSearchParams,
  type RawGlobalSearchParams,
} from "@/lib/validation/search";

export const metadata: Metadata = {
  title: "搜索故事世界",
  description: "按关键词、时间、地点、标签、情绪、作者和内容类型搜索你有权阅读的故事。",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawGlobalSearchParams>;
}) {
  const filters = filtersFromSearchParams(await searchParams);
  return <GlobalSearchView key={JSON.stringify(filters)} initialFilters={filters} />;
}
