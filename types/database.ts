export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TimePrecision = "exact" | "date" | "month" | "year" | "approximate";
export type EntryVisibility = "public" | "private" | "group";
export type StoryRouteVisibility = "public" | "private" | "group";
export type GroupVisibility = "public" | "private";
export type GroupRole = "owner" | "admin" | "member";
export type GroupMemberStatus = "active" | "left" | "removed";
export type InvitationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled";
export type EntryParticipantStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "revoked";
export type EntryEditableField =
  | "title"
  | "content"
  | "place"
  | "location"
  | "time"
  | "category"
  | "tags";
export type PlaceCategorySlug =
  | "home"
  | "school"
  | "work"
  | "food"
  | "transport"
  | "street"
  | "nature"
  | "landmark"
  | "medical"
  | "travel"
  | "memorial"
  | "other";
export type ReportTargetType = "entry" | "comment" | "user" | "group";
export type ReportReason =
  | "spam"
  | "harassment"
  | "hate"
  | "privacy"
  | "misinformation"
  | "other";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string;
          avatar_url?: string | null;
          bio?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      map_entries: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          content: string;
          place_name: string | null;
          latitude: number;
          longitude: number;
          occurred_at: string | null;
          occurred_local: string | null;
          occurred_timezone: string | null;
          occurred_date: string | null;
          occurred_year: number | null;
          time_precision: TimePrecision;
          time_label: string;
          visibility: EntryVisibility;
          group_id: string | null;
          place_category_slug: PlaceCategorySlug;
          allow_comments: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          content: string;
          place_name?: string | null;
          latitude: number;
          longitude: number;
          occurred_at?: string | null;
          occurred_local?: string | null;
          occurred_timezone?: string | null;
          occurred_date?: string | null;
          occurred_year?: number | null;
          time_precision: TimePrecision;
          time_label: string;
          visibility: EntryVisibility;
          group_id?: string | null;
          place_category_slug?: PlaceCategorySlug;
          allow_comments?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          content?: string;
          place_name?: string | null;
          latitude?: number;
          longitude?: number;
          occurred_at?: string | null;
          occurred_local?: string | null;
          occurred_timezone?: string | null;
          occurred_date?: string | null;
          occurred_year?: number | null;
          time_precision?: TimePrecision;
          time_label?: string;
          visibility?: EntryVisibility;
          group_id?: string | null;
          place_category_slug?: PlaceCategorySlug;
          allow_comments?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "map_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "map_entries_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "map_entries_place_category_slug_fkey";
            columns: ["place_category_slug"];
            isOneToOne: false;
            referencedRelation: "place_categories";
            referencedColumns: ["slug"];
          },
        ];
      };
      entry_participants: {
        Row: {
          entry_id: string;
          user_id: string;
          invited_by: string | null;
          status: EntryParticipantStatus;
          editable_fields: EntryEditableField[];
          created_at: string;
          updated_at: string;
          responded_at: string | null;
          revoked_at: string | null;
        };
        Insert: {
          entry_id: string;
          user_id: string;
          invited_by?: string | null;
          status?: EntryParticipantStatus;
          editable_fields?: EntryEditableField[];
          created_at?: string;
          updated_at?: string;
          responded_at?: string | null;
          revoked_at?: string | null;
        };
        Update: {
          invited_by?: string | null;
          status?: EntryParticipantStatus;
          editable_fields?: EntryEditableField[];
          responded_at?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "entry_participants_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "map_entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entry_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      entry_edit_logs: {
        Row: {
          id: string;
          entry_id: string;
          editor_id: string | null;
          changed_fields: string[];
          old_values: Json;
          new_values: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          entry_id: string;
          editor_id?: string | null;
          changed_fields: string[];
          old_values?: Json;
          new_values?: Json;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "entry_edit_logs_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "map_entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entry_edit_logs_editor_id_fkey";
            columns: ["editor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tags: {
        Row: {
          id: string;
          name: string;
          normalized_name: string;
          slug: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          normalized_name: string;
          slug?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: { name?: string; normalized_name?: string };
        Relationships: [];
      };
      entry_tags: {
        Row: {
          entry_id: string;
          tag_id: string;
          added_by: string | null;
          created_at: string;
        };
        Insert: {
          entry_id: string;
          tag_id: string;
          added_by?: string | null;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "entry_tags_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "map_entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entry_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      place_categories: {
        Row: {
          slug: PlaceCategorySlug;
          label: string;
          icon_key: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          slug: PlaceCategorySlug;
          label: string;
          icon_key: string;
          sort_order: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          label?: string;
          icon_key?: string;
          sort_order?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      groups: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string;
          avatar_url: string | null;
          visibility: GroupVisibility;
          created_by: string;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
          archived_by: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string;
          avatar_url?: string | null;
          visibility?: GroupVisibility;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
          archived_by?: string | null;
        };
        Update: {
          slug?: string;
          name?: string;
          description?: string;
          avatar_url?: string | null;
          visibility?: GroupVisibility;
          archived_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      group_members: {
        Row: {
          group_id: string;
          user_id: string;
          role: GroupRole;
          status: GroupMemberStatus;
          joined_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          group_id: string;
          user_id: string;
          role?: GroupRole;
          status?: GroupMemberStatus;
          joined_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          role?: GroupRole;
          status?: GroupMemberStatus;
          joined_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      group_invitations: {
        Row: {
          id: string;
          group_id: string;
          inviter_id: string;
          invitee_id: string;
          status: InvitationStatus;
          created_at: string;
          responded_at: string | null;
          expires_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          inviter_id: string;
          invitee_id: string;
          status?: InvitationStatus;
          created_at?: string;
          responded_at?: string | null;
          expires_at?: string;
        };
        Update: { status?: InvitationStatus; responded_at?: string | null };
        Relationships: [
          {
            foreignKeyName: "group_invitations_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      follows: {
        Row: { follower_id: string; following_id: string; created_at: string };
        Insert: { follower_id: string; following_id: string; created_at?: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      entry_likes: {
        Row: { entry_id: string; user_id: string; created_at: string };
        Insert: { entry_id: string; user_id: string; created_at?: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      entry_comments: {
        Row: {
          id: string;
          entry_id: string;
          user_id: string;
          content: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          moderated_at: string | null;
          moderated_by: string | null;
        };
        Insert: {
          id?: string;
          entry_id: string;
          user_id: string;
          content: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          moderated_at?: string | null;
          moderated_by?: string | null;
        };
        Update: { content?: string };
        Relationships: [
          {
            foreignKeyName: "entry_comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          target_type: ReportTargetType;
          target_id: string;
          reason: ReportReason;
          description: string;
          status: "pending" | "reviewing" | "resolved" | "dismissed";
          created_at: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          review_notes: string | null;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          target_type: ReportTargetType;
          target_id: string;
          reason: ReportReason;
          description?: string;
          status?: "pending" | "reviewing" | "resolved" | "dismissed";
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      story_routes: {
        Row: {
          id: string;
          created_by: string;
          group_id: string | null;
          title: string;
          description: string;
          visibility: StoryRouteVisibility;
          share_slug: string;
          published_at: string | null;
          archived_at: string | null;
          archived_by: string | null;
          featured_at: string | null;
          featured_by: string | null;
          privacy_downgraded_at: string | null;
          node_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          created_by: string;
          group_id?: string | null;
          title: string;
          description?: string;
          visibility?: StoryRouteVisibility;
          share_slug?: string;
          published_at?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          featured_at?: string | null;
          featured_by?: string | null;
          privacy_downgraded_at?: string | null;
          node_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string;
          visibility?: StoryRouteVisibility;
          group_id?: string | null;
          published_at?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          featured_at?: string | null;
          featured_by?: string | null;
          privacy_downgraded_at?: string | null;
          node_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "story_routes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "story_routes_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      story_route_items: {
        Row: {
          id: string;
          route_id: string;
          entry_id: string;
          position: number;
          note: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          route_id: string;
          entry_id: string;
          position: number;
          note?: string;
          created_at?: string;
        };
        Update: { position?: number; note?: string };
        Relationships: [
          {
            foreignKeyName: "story_route_items_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "story_routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "story_route_items_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "map_entries";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_display_name_available: {
        Args: { candidate: string };
        Returns: boolean;
      };
      join_public_group: { Args: { p_group_id: string }; Returns: undefined };
      leave_group: { Args: { p_group_id: string }; Returns: undefined };
      invite_group_member: {
        Args: { p_group_id: string; p_invitee_id: string };
        Returns: string;
      };
      respond_group_invitation: {
        Args: { p_invitation_id: string; p_accept: boolean };
        Returns: undefined;
      };
      remove_group_member: {
        Args: { p_group_id: string; p_user_id: string };
        Returns: undefined;
      };
      change_group_member_role: {
        Args: { p_group_id: string; p_user_id: string; p_role: string };
        Returns: undefined;
      };
      transfer_group_ownership: {
        Args: { p_group_id: string; p_new_owner_id: string };
        Returns: undefined;
      };
      soft_delete_comment: {
        Args: { p_comment_id: string };
        Returns: undefined;
      };
      moderate_group_comment: {
        Args: { p_comment_id: string };
        Returns: undefined;
      };
      get_social_feed: {
        Args: {
          p_cursor_created_at?: string | null;
          p_cursor_id?: string | null;
          p_limit?: number;
        };
        Returns: FeedEntry[];
      };
      can_view_story_route: {
        Args: { p_route_id: string };
        Returns: boolean;
      };
      can_read_story_route_item: {
        Args: { p_route_id: string; p_entry_id: string };
        Returns: boolean;
      };
      save_story_route: {
        Args: {
          p_route_id: string | null;
          p_title: string;
          p_description: string;
          p_visibility: StoryRouteVisibility;
          p_group_id: string | null;
          p_publish: boolean;
          p_items: Json;
        };
        Returns: string;
      };
      archive_story_route: {
        Args: { p_route_id: string };
        Returns: undefined;
      };
      feature_story_route: {
        Args: { p_route_id: string; p_featured: boolean };
        Returns: undefined;
      };
      get_timeline_entries: {
        Args: {
          p_scope: "mine" | "user" | "group";
          p_target_id: string;
          p_order?: "asc" | "desc";
          p_visibility?: EntryVisibility | null;
          p_category_slugs?: string[] | null;
          p_author_id?: string | null;
          p_keyword?: string | null;
          p_start_year?: number | null;
          p_end_year?: number | null;
          p_include_undated?: boolean;
          p_offset?: number;
          p_limit?: number;
        };
        Returns: Json[];
      };
      is_accepted_entry_participant: {
        Args: { p_entry_id: string };
        Returns: boolean;
      };
      can_collaborate_entry: {
        Args: { p_entry_id: string };
        Returns: boolean;
      };
      can_edit_entry_field: {
        Args: { p_entry_id: string; p_field: string };
        Returns: boolean;
      };
      invite_entry_participant: {
        Args: {
          p_entry_id: string;
          p_invitee_id: string;
          p_editable_fields: EntryEditableField[];
        };
        Returns: undefined;
      };
      respond_entry_participant_invitation: {
        Args: { p_entry_id: string; p_accept: boolean };
        Returns: undefined;
      };
      revoke_entry_participant: {
        Args: { p_entry_id: string; p_user_id: string };
        Returns: undefined;
      };
      update_entry_participant_permissions: {
        Args: {
          p_entry_id: string;
          p_user_id: string;
          p_editable_fields: EntryEditableField[];
        };
        Returns: undefined;
      };
      create_entry: {
        Args: { p_entry: Json; p_tag_names?: string[] };
        Returns: Json;
      };
      update_entry: {
        Args: {
          p_entry_id: string;
          p_patch: Json;
          p_tag_names?: string[] | null;
        };
        Returns: Json;
      };
      set_entry_tags: {
        Args: { p_entry_id: string; p_tag_names: string[] };
        Returns: undefined;
      };
      get_tag_entries: {
        Args: {
          p_tag_slug: string;
          p_offset?: number;
          p_limit?: number;
        };
        Returns: Json[];
      };
      get_visible_tag_summary: {
        Args: { p_tag_slug: string };
        Returns: Array<{ slug: string; name: string; entry_count: number }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type MapEntry = Database["public"]["Tables"]["map_entries"]["Row"];
export type MapEntryInsert = Database["public"]["Tables"]["map_entries"]["Insert"];
export type MapEntryUpdate = Database["public"]["Tables"]["map_entries"]["Update"];
export type PlaceCategory = Database["public"]["Tables"]["place_categories"]["Row"];
export type Group = Database["public"]["Tables"]["groups"]["Row"];
export type GroupMember = Database["public"]["Tables"]["group_members"]["Row"];
export type GroupInvitation = Database["public"]["Tables"]["group_invitations"]["Row"];
export type EntryComment = Database["public"]["Tables"]["entry_comments"]["Row"];
export type StoryRoute = Database["public"]["Tables"]["story_routes"]["Row"];
export type StoryRouteItem = Database["public"]["Tables"]["story_route_items"]["Row"];
export type EntryParticipant = Database["public"]["Tables"]["entry_participants"]["Row"];
export type EntryEditLog = Database["public"]["Tables"]["entry_edit_logs"]["Row"];
export type Tag = Database["public"]["Tables"]["tags"]["Row"];
export type EntryTag = Database["public"]["Tables"]["entry_tags"]["Row"];

export type EntryParticipantWithProfile = EntryParticipant & {
  profiles: Pick<Profile, "display_name" | "avatar_url"> | null;
};

export type EntryTagWithTag = EntryTag & {
  tags: Pick<Tag, "id" | "name" | "slug"> | null;
};

export type MapEntryWithProfile = MapEntry & {
  profiles: Pick<Profile, "display_name" | "avatar_url"> | null;
  entry_participants?: EntryParticipantWithProfile[];
  entry_tags?: EntryTagWithTag[];
};

export type StoryRouteWithRelations = StoryRoute & {
  profiles: Pick<Profile, "display_name" | "avatar_url"> | null;
  groups: Pick<Group, "name" | "slug" | "archived_at"> | null;
};

export type StoryRouteItemWithEntry = StoryRouteItem & {
  map_entries: MapEntryWithProfile | null;
};

export type FeedEntry = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  place_name: string | null;
  latitude: number;
  longitude: number;
  time_label: string;
  visibility: EntryVisibility;
  group_id: string | null;
  place_category_slug: PlaceCategorySlug;
  allow_comments: boolean;
  created_at: string;
  updated_at: string;
  author_display_name: string;
  author_avatar_url: string | null;
  group_name: string | null;
  group_slug: string | null;
  like_count: number;
  comment_count: number;
  user_liked: boolean;
};
