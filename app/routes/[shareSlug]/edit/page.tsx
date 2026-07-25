import { StoryRouteBuilder } from "@/components/routes/story-route-builder";

export default async function EditStoryRoutePage({ params }: { params: Promise<{ shareSlug: string }> }) {
  const { shareSlug } = await params;
  return <StoryRouteBuilder shareSlug={shareSlug} />;
}
