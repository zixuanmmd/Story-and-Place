import { GroupDetailView } from "@/components/groups/group-detail-view";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <GroupDetailView slug={slug} />;
}
