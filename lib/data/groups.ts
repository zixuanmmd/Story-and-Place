import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  Group,
  GroupInvitation,
  GroupMember,
  GroupRole,
  MapEntryWithProfile,
  Profile,
} from "@/types/database";
import type { GroupFormValues } from "@/lib/validation/groups";
import {
  ascendingTimestampFilter,
  descendingTimestampFilter,
  type TimestampCursor,
} from "@/lib/data/keyset-pagination";
import { recordProductEvent } from "@/lib/analytics/provider";

export const GROUP_PAGE_SIZE = 30;

export type GroupMemberWithProfile = GroupMember & {
  profiles: Pick<Profile, "display_name" | "avatar_url"> | null;
};

export type InvitationWithGroup = GroupInvitation & {
  groups: Pick<Group, "id" | "slug" | "name" | "avatar_url" | "visibility" | "archived_at"> | null;
};

export async function listVisibleGroups(
  userId: string | null,
  cursor?: TimestampCursor,
) {
  const supabase = getSupabaseBrowserClient();
  let groupsQuery = supabase
    .from("groups")
    .select("*")
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(101);
  if (cursor) {
    groupsQuery = groupsQuery.or(
      descendingTimestampFilter("updated_at", "id", cursor),
    );
  }
  const [groupsResult, membershipsResult, invitationsResult] = await Promise.all([
    groupsQuery,
    userId
      ? supabase.from("group_members").select("*").eq("user_id", userId).eq("status", "active").limit(500)
      : Promise.resolve({ data: [], error: null }),
    userId
      ? supabase
          .from("group_invitations")
          .select("*, groups(id, slug, name, avatar_url, visibility, archived_at)")
          .eq("invitee_id", userId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(51)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (groupsResult.error) throw groupsResult.error;
  if (membershipsResult.error) throw membershipsResult.error;
  if (invitationsResult.error) throw invitationsResult.error;
  return {
    groups: groupsResult.data.slice(0, 100),
    memberships: membershipsResult.data,
    invitations: invitationsResult.data.slice(0, 50) as InvitationWithGroup[],
    invitationsTruncated: invitationsResult.data.length > 50,
    truncated: groupsResult.data.length > 100,
  };
}

export async function getGroupBySlug(slug: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from("groups").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createGroup(userId: string, values: GroupFormValues) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("groups")
    .insert({
      created_by: userId,
      name: values.name.trim(),
      slug: values.slug.trim(),
      description: values.description.trim(),
      avatar_url: values.avatar_url || null,
      visibility: values.visibility,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateGroup(id: string, values: GroupFormValues) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("groups")
    .update({
      name: values.name.trim(),
      slug: values.slug.trim(),
      description: values.description.trim(),
      avatar_url: values.avatar_url || null,
      visibility: values.visibility,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function archiveGroup(id: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("groups").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function getMyGroupRole(groupId: string, userId: string | null) {
  if (!userId) return null;
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data?.role ?? null;
}

export async function listGroupEntries(
  groupId: string,
  limit = GROUP_PAGE_SIZE,
  cursor?: TimestampCursor,
) {
  const supabase = getSupabaseBrowserClient();
  let query = supabase
    .from("map_entries")
    .select("*, profiles!map_entries_user_id_fkey(display_name, avatar_url)")
    .eq("group_id", groupId)
    .eq("visibility", "group")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (cursor) {
    query = query.or(
      descendingTimestampFilter("created_at", "id", cursor),
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  return {
    entries: data.slice(0, limit) as MapEntryWithProfile[],
    truncated: data.length > limit,
    hasMore: data.length > limit,
  };
}

export async function listGroupMembers(
  groupId: string,
  limit = GROUP_PAGE_SIZE,
  cursor?: TimestampCursor,
) {
  const supabase = getSupabaseBrowserClient();
  let query = supabase
    .from("group_members")
    .select("*, profiles!group_members_user_id_fkey(display_name, avatar_url)", { count: "exact" })
    .eq("group_id", groupId)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .order("user_id", { ascending: true })
    .limit(limit + 1);
  if (cursor) {
    query = query.or(
      ascendingTimestampFilter("joined_at", "user_id", cursor),
    );
  }
  const { data, error, count } = await query;
  if (error) throw error;
  return {
    members: data.slice(0, limit) as GroupMemberWithProfile[],
    truncated: data.length > limit,
    hasMore: data.length > limit,
    count: count ?? data.length,
  };
}

export async function joinPublicGroup(groupId: string) {
  const { error } = await getSupabaseBrowserClient().rpc("join_public_group", { p_group_id: groupId });
  if (error) throw error;
}
export async function leaveGroup(groupId: string) {
  const { error } = await getSupabaseBrowserClient().rpc("leave_group", { p_group_id: groupId });
  if (error) throw error;
}
export async function inviteGroupMember(groupId: string, inviteeId: string) {
  const { error } = await getSupabaseBrowserClient().rpc("invite_group_member", { p_group_id: groupId, p_invitee_id: inviteeId });
  if (error) throw error;
  recordProductEvent("invitation_sent", { source: "group-members", invitation_type: "group" });
}
export async function respondGroupInvitation(invitationId: string, accept: boolean) {
  const { error } = await getSupabaseBrowserClient().rpc("respond_group_invitation", {
    p_invitation_id: invitationId,
    p_accept: accept,
  });
  if (error) throw error;
  if (accept) {
    recordProductEvent("invitation_accepted", { source: "group-invitations", invitation_type: "group" });
  }
}
export async function removeGroupMember(groupId: string, userId: string) {
  const { error } = await getSupabaseBrowserClient().rpc("remove_group_member", { p_group_id: groupId, p_user_id: userId });
  if (error) throw error;
}
export async function changeGroupMemberRole(groupId: string, userId: string, role: Exclude<GroupRole, "owner">) {
  const { error } = await getSupabaseBrowserClient().rpc("change_group_member_role", {
    p_group_id: groupId,
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw error;
}
export async function transferGroupOwnership(groupId: string, userId: string) {
  const { error } = await getSupabaseBrowserClient().rpc("transfer_group_ownership", {
    p_group_id: groupId,
    p_new_owner_id: userId,
  });
  if (error) throw error;
}

export async function searchProfiles(keyword: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .ilike("display_name", `%${keyword.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`)
    .limit(10);
  if (error) throw error;
  return data;
}

export async function listMyInvitations(
  userId: string,
  cursor?: TimestampCursor,
  limit = 20,
) {
  const supabase = getSupabaseBrowserClient();
  let query = supabase
    .from("group_invitations")
    .select("*, groups(id, slug, name, avatar_url, visibility, archived_at)")
    .eq("invitee_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (cursor) {
    query = query.or(
      descendingTimestampFilter("created_at", "id", cursor),
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  return {
    invitations: data.slice(0, limit) as InvitationWithGroup[],
    hasMore: data.length > limit,
  };
}
