import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { EntryShareView } from "@/components/entries/entry-share-view";
import { getEntryShareDescription } from "@/lib/entries/share";
import type { Database } from "@/types/database";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function readPublicEntryMetadata(id: string) {
  if (!UUID_PATTERN.test(id)) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await client
    .from("map_entries")
    .select("id, title, content, place_name, visibility, unlock_at")
    .eq("id", id)
    .eq("visibility", "public")
    .or(`unlock_at.is.null,unlock_at.lte.${new Date().toISOString()}`)
    .maybeSingle();
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const entry = await readPublicEntryMetadata(id);
  if (!entry) {
    return {
      title: "故事地点",
      description: "一个受权限保护的地点故事。",
      robots: { index: false, follow: false },
    };
  }
  const description = getEntryShareDescription(entry.content, entry.place_name);
  return {
    title: entry.title,
    description,
    alternates: { canonical: `/entries/${entry.id}` },
    openGraph: {
      type: "article",
      title: entry.title,
      description,
      url: `/entries/${entry.id}`,
    },
    twitter: { card: "summary_large_image", title: entry.title, description },
  };
}

export default async function EntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();
  return <EntryShareView entryId={id} />;
}
