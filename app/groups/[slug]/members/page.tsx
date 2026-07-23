import { GroupMembersView } from "@/components/groups/group-members-view";

export default async function GroupMembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <GroupMembersView slug={slug} />;
}
