import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  Json,
  StoryRouteItemWithEntry,
} from "@/types/database";
import type { StoryRouteValues as ValidatedStoryRouteValues } from "@/lib/validation/story-route";
import type { StoryRouteWithRelations } from "@/types/database";

export const STORY_ROUTE_PAGE_SIZE = 20;

const ROUTE_SELECT = `
  *,
  profiles!story_routes_created_by_fkey(display_name, avatar_url),
  groups!story_routes_group_id_fkey(name, slug, archived_at)
`;

const ROUTE_ITEM_SELECT = `
  *,
  map_entries!story_route_items_entry_id_fkey(
    *,
    profiles!map_entries_user_id_fkey(display_name, avatar_url)
  )
`;

export async function listMyStoryRoutes(userId: string, page = 0) {
  const supabase = getSupabaseBrowserClient();
  const from = page * STORY_ROUTE_PAGE_SIZE;
  const { data, error } = await supabase
    .from("story_routes")
    .select(ROUTE_SELECT)
    .eq("created_by", userId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + STORY_ROUTE_PAGE_SIZE);
  if (error) throw error;
  return {
    routes: data.slice(0, STORY_ROUTE_PAGE_SIZE) as unknown as StoryRouteWithRelations[],
    hasMore: data.length > STORY_ROUTE_PAGE_SIZE,
  };
}

export async function listGroupStoryRoutes(groupId: string, page = 0) {
  const supabase = getSupabaseBrowserClient();
  const from = page * STORY_ROUTE_PAGE_SIZE;
  const { data, error } = await supabase
    .from("story_routes")
    .select(ROUTE_SELECT)
    .eq("group_id", groupId)
    .eq("visibility", "group")
    .not("published_at", "is", null)
    .order("featured_at", { ascending: false, nullsFirst: false })
    .order("published_at", { ascending: false })
    .range(from, from + STORY_ROUTE_PAGE_SIZE);
  if (error) throw error;
  return {
    routes: data.slice(0, STORY_ROUTE_PAGE_SIZE) as unknown as StoryRouteWithRelations[],
    hasMore: data.length > STORY_ROUTE_PAGE_SIZE,
  };
}

export async function getStoryRouteBySlug(shareSlug: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("story_routes")
    .select(ROUTE_SELECT)
    .eq("share_slug", shareSlug)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as StoryRouteWithRelations | null;
}

export async function getStoryRouteById(routeId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("story_routes")
    .select(ROUTE_SELECT)
    .eq("id", routeId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as StoryRouteWithRelations | null;
}

export async function listStoryRouteItems(routeId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("story_route_items")
    .select(ROUTE_ITEM_SELECT)
    .eq("route_id", routeId)
    .order("position", { ascending: true })
    .limit(200);
  if (error) throw error;
  return data as unknown as StoryRouteItemWithEntry[];
}

export async function saveStoryRoute(values: ValidatedStoryRouteValues) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("save_story_route", {
    p_route_id: values.id,
    p_title: values.title,
    p_description: values.description,
    p_visibility: values.visibility,
    p_group_id: values.group_id,
    p_publish: values.publish,
    p_items: values.items as unknown as Json,
  });
  if (error) throw error;
  return data;
}

export async function archiveStoryRoute(routeId: string) {
  const { error } = await getSupabaseBrowserClient().rpc("archive_story_route", {
    p_route_id: routeId,
  });
  if (error) throw error;
}

export async function featureStoryRoute(routeId: string, featured: boolean) {
  const { error } = await getSupabaseBrowserClient().rpc("feature_story_route", {
    p_route_id: routeId,
    p_featured: featured,
  });
  if (error) throw error;
}
