import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { EntryComment, Profile } from "@/types/database";
import {
  descendingTimestampFilter,
  type TimestampCursor,
} from "@/lib/data/keyset-pagination";

export const COMMENT_PAGE_SIZE = 20;

export type CommentWithProfile = EntryComment & {
  profiles: Pick<Profile, "display_name" | "avatar_url"> | null;
};

export async function listComments(entryId: string, cursor?: TimestampCursor) {
  const supabase = getSupabaseBrowserClient();
  let query = supabase
    .from("entry_comments")
    .select("*, profiles!entry_comments_user_id_fkey(display_name, avatar_url)")
    .eq("entry_id", entryId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(COMMENT_PAGE_SIZE + 1);
  if (cursor) {
    query = query.or(
      descendingTimestampFilter("created_at", "id", cursor),
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  return {
    comments: data.slice(0, COMMENT_PAGE_SIZE) as CommentWithProfile[],
    hasMore: data.length > COMMENT_PAGE_SIZE,
  };
}

export async function createComment(entryId: string, userId: string, content: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("entry_comments")
    .insert({ entry_id: entryId, user_id: userId, content: content.trim() })
    .select("*, profiles!entry_comments_user_id_fkey(display_name, avatar_url)")
    .single();
  if (error) throw error;
  return data as CommentWithProfile;
}

export async function updateComment(id: string, content: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("entry_comments")
    .update({ content: content.trim() })
    .eq("id", id)
    .select("*, profiles!entry_comments_user_id_fkey(display_name, avatar_url)")
    .single();
  if (error) throw error;
  return data as CommentWithProfile;
}

export async function deleteComment(id: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("soft_delete_comment", { p_comment_id: id });
  if (error) throw error;
}

export async function moderateComment(id: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("moderate_group_comment", { p_comment_id: id });
  if (error) throw error;
}
