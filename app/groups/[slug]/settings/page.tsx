import { GroupSettingsView } from "@/components/groups/group-settings-view";

export default async function GroupSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <GroupSettingsView slug={slug} />;
}

