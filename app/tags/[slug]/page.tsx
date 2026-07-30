import { TagEntriesView } from "@/components/tags/tag-entries-view";

export default async function TagPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <TagEntriesView slug={slug} />;
}
