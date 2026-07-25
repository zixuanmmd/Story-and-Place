import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { StoryRouteDetail } from "@/components/routes/story-route-detail";
import type { Database } from "@/types/database";

async function readPublicRouteMetadata(shareSlug: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await client
    .from("story_routes")
    .select("title, description, visibility, published_at")
    .eq("share_slug", shareSlug)
    .eq("visibility", "public")
    .not("published_at", "is", null)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ shareSlug: string }> }): Promise<Metadata> {
  const { shareSlug } = await params;
  const route = await readPublicRouteMetadata(shareSlug);
  if (!route) return { title: "故事路线", description: "一条受权限保护的故事路线。" };
  return {
    title: route.title,
    description: route.description || "一条来自故事情感地图的公开故事路线。",
    openGraph: {
      title: route.title,
      description: route.description || "一条来自故事情感地图的公开故事路线。",
      type: "article",
    },
  };
}

export default async function StoryRoutePage({ params }: { params: Promise<{ shareSlug: string }> }) {
  const { shareSlug } = await params;
  return <StoryRouteDetail shareSlug={shareSlug} />;
}
