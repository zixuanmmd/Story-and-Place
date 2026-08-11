import { getEntryById } from "@/lib/data/entries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  EntryParticipantWithProfile,
  Group,
  MapEntryWithProfile,
  StoryRoute,
} from "@/types/database";

export type EntryRouteReference = Pick<
  StoryRoute,
  "id" | "title" | "share_slug" | "visibility"
>;

export type EntryShareData = {
  entry: MapEntryWithProfile;
  participants: EntryParticipantWithProfile[];
  routes: EntryRouteReference[];
  group: Pick<Group, "name" | "slug"> | null;
};

export async function getEntryShareData(
  entryId: string,
  currentUserId: string | null,
): Promise<EntryShareData | null> {
  const supabase = getSupabaseBrowserClient();
  const entry = await getEntryById(entryId);
  if (!entry) return null;

  const [participantResult, routeResult, groupResult] = await Promise.all([
    currentUserId
      ? supabase
          .from("entry_participants")
          .select("*, profiles!entry_participants_user_id_fkey(display_name, avatar_url)")
          .eq("entry_id", entryId)
          .eq("status", "accepted")
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("story_route_items")
      .select("story_routes!story_route_items_route_id_fkey(id, title, share_slug, visibility)")
      .eq("entry_id", entryId)
      .limit(20),
    entry.group_id
      ? supabase
          .from("groups")
          .select("name, slug")
          .eq("id", entry.group_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (participantResult.error) throw participantResult.error;
  if (routeResult.error) throw routeResult.error;
  if (groupResult.error) throw groupResult.error;

  const routes = routeResult.data
    .map((row) => row.story_routes)
    .filter((route): route is EntryRouteReference => Boolean(route));

  return {
    entry,
    participants: participantResult.data as unknown as EntryParticipantWithProfile[],
    routes,
    group: groupResult.data,
  };
}
