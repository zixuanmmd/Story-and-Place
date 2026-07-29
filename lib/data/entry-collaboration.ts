import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  EntryEditableField,
  EntryEditLog,
  EntryParticipantWithProfile,
  MapEntry,
  Profile,
} from "@/types/database";

export const ENTRY_EDITABLE_FIELD_LABELS: Record<EntryEditableField, string> = {
  title: "标题",
  content: "事件内容",
  place: "地点名称",
  location: "经纬度",
  time: "发生时间",
  category: "地点分类",
  tags: "标签",
};

export const ALL_ENTRY_EDITABLE_FIELDS = Object.keys(
  ENTRY_EDITABLE_FIELD_LABELS,
) as EntryEditableField[];

export type EntryEditLogWithEditor = EntryEditLog & {
  profiles: Pick<Profile, "display_name" | "avatar_url"> | null;
};

export type EntryInvitation = {
  entry_id: string;
  user_id: string;
  invited_by: string | null;
  status: "pending";
  editable_fields: EntryEditableField[];
  created_at: string;
  updated_at: string;
  responded_at: null;
  revoked_at: null;
  inviter: Pick<Profile, "display_name" | "avatar_url"> | null;
};

export async function listEntryParticipants(entryId: string) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("entry_participants")
    .select(
      "*, profiles!entry_participants_user_id_fkey(display_name, avatar_url)",
    )
    .eq("entry_id", entryId)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as unknown as EntryParticipantWithProfile[];
}

export async function getMyEntryParticipation(entryId: string, userId: string) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("entry_participants")
    .select(
      "*, profiles!entry_participants_user_id_fkey(display_name, avatar_url)",
    )
    .eq("entry_id", entryId)
    .eq("user_id", userId)
    .eq("status", "accepted")
    .maybeSingle();
  if (error) throw error;
  return data as unknown as EntryParticipantWithProfile | null;
}

export async function listMyEntryInvitations(userId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("entry_participants")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  const inviterIds = [
    ...new Set(
      data
        .map((invitation) => invitation.invited_by)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: inviters, error: inviterError } = inviterIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", inviterIds)
    : { data: [], error: null };
  if (inviterError) throw inviterError;
  const inviterById = new Map(inviters.map((profile) => [profile.id, profile]));
  return data.map((invitation) => ({
    ...invitation,
    status: "pending" as const,
    inviter: invitation.invited_by
      ? inviterById.get(invitation.invited_by) ?? null
      : null,
  })) as EntryInvitation[];
}

export async function inviteEntryParticipant(
  entryId: string,
  inviteeId: string,
  editableFields: EntryEditableField[],
) {
  const { error } = await getSupabaseBrowserClient().rpc(
    "invite_entry_participant",
    {
      p_entry_id: entryId,
      p_invitee_id: inviteeId,
      p_editable_fields: editableFields,
    },
  );
  if (error) throw error;
}

export async function respondEntryParticipantInvitation(
  entryId: string,
  accept: boolean,
) {
  const { error } = await getSupabaseBrowserClient().rpc(
    "respond_entry_participant_invitation",
    { p_entry_id: entryId, p_accept: accept },
  );
  if (error) throw error;
}

export async function revokeEntryParticipant(
  entryId: string,
  userId: string,
) {
  const { error } = await getSupabaseBrowserClient().rpc(
    "revoke_entry_participant",
    { p_entry_id: entryId, p_user_id: userId },
  );
  if (error) throw error;
}

export async function updateEntryParticipantPermissions(
  entryId: string,
  userId: string,
  editableFields: EntryEditableField[],
) {
  const { error } = await getSupabaseBrowserClient().rpc(
    "update_entry_participant_permissions",
    {
      p_entry_id: entryId,
      p_user_id: userId,
      p_editable_fields: editableFields,
    },
  );
  if (error) throw error;
}

export async function listEntryEditLogs(entryId: string, limit = 50) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("entry_edit_logs")
    .select(
      "*, profiles!entry_edit_logs_editor_id_fkey(display_name, avatar_url)",
    )
    .eq("entry_id", entryId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as unknown as EntryEditLogWithEditor[];
}

export function getParticipantEditableFields(
  entry: MapEntry,
  currentUserId: string | null,
  participant: EntryParticipantWithProfile | null,
) {
  if (!currentUserId) return [];
  if (entry.user_id === currentUserId) return ALL_ENTRY_EDITABLE_FIELDS;
  return participant?.status === "accepted" ? participant.editable_fields : [];
}
