import { PublicProfileView } from "@/components/profiles/public-profile-view";

export default async function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublicProfileView profileId={id} />;
}

