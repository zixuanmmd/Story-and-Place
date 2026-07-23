import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ReportValues } from "@/lib/validation/social";

export async function getFollowState(viewerId: string | null, profileId: string) {
  const supabase = getSupabaseBrowserClient();
  const [followers, following, mine] = await Promise.all([
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", profileId),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profileId),
    viewerId
      ? supabase
          .from("follows")
          .select("follower_id")
          .eq("follower_id", viewerId)
          .eq("following_id", profileId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (followers.error) throw followers.error;
  if (following.error) throw following.error;
  if (mine.error) throw mine.error;
  return {
    followerCount: followers.count ?? 0,
    followingCount: following.count ?? 0,
    isFollowing: Boolean(mine.data),
  };
}

export async function followUser(followerId: string, followingId: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("follows").insert({
    follower_id: followerId,
    following_id: followingId,
  });
  if (error && error.code !== "23505") throw error;
}

export async function unfollowUser(followerId: string, followingId: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", followingId);
  if (error) throw error;
}

export async function getEntrySocialState(entryId: string, userId: string | null) {
  const supabase = getSupabaseBrowserClient();
  const [likes, comments, mine] = await Promise.all([
    supabase.from("entry_likes").select("*", { count: "exact", head: true }).eq("entry_id", entryId),
    supabase
      .from("entry_comments")
      .select("*", { count: "exact", head: true })
      .eq("entry_id", entryId)
      .is("deleted_at", null),
    userId
      ? supabase
          .from("entry_likes")
          .select("entry_id")
          .eq("entry_id", entryId)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (likes.error) throw likes.error;
  if (comments.error) throw comments.error;
  if (mine.error) throw mine.error;
  return {
    likeCount: likes.count ?? 0,
    commentCount: comments.count ?? 0,
    liked: Boolean(mine.data),
  };
}

export async function likeEntry(entryId: string, userId: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("entry_likes").insert({ entry_id: entryId, user_id: userId });
  if (error && error.code !== "23505") throw error;
}

export async function unlikeEntry(entryId: string, userId: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("entry_likes")
    .delete()
    .eq("entry_id", entryId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function submitReport(reporterId: string, values: ReportValues) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("reports").insert({
    reporter_id: reporterId,
    target_type: values.target_type,
    target_id: values.target_id,
    reason: values.reason,
    description: values.description.trim(),
  });
  if (error) throw error;
}
