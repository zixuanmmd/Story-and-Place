export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TimePrecision = "exact" | "date" | "month" | "year" | "approximate";
export type EntryVisibility = "public" | "private" | "group";
export type EntryDraftStatus = "draft" | "published" | "discarded";
export type StoryRouteVisibility = "public" | "private" | "group";
export type TagType = "normal" | "emotion" | "theme" | "character" | "event";
export type StoryRouteRelationType =
  | "normal"
  | "cause"
  | "memory"
  | "contrast"
  | "turning_point";
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
export type ReportTargetType = "entry" | "comment" | "user" | "group" | "route";
export type ReportReason =
  | "spam"
  | "harassment"
  | "hate"
  | "privacy"
  | "misinformation"
  | "copyright"
  | "inappropriate"
  | "other";
export type ContentModerationStatus = "active" | "restricted" | "removed";
export type AccountModerationStatus = "active" | "restricted";
export type ReportStatus = "pending" | "reviewing" | "resolved" | "dismissed";
export type OnboardingPreference = {
  user_id: string;
  onboarding_status: "pending" | "completed" | "skipped";
  interests: string[];
  first_story_id: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GlobalSearchResultType =
  | "entry"
  | "profile"
  | "route"
  | "tag"
  | "emotion";

export type GlobalSearchResult = {
  result_type: GlobalSearchResultType;
  result_id: string;
  title: string;
  subtitle: string;
  excerpt: string;
  href: string;
  occurred_year: number | null;
  time_label: string | null;
  latitude: number | null;
  longitude: number | null;
  visibility: EntryVisibility | StoryRouteVisibility | null;
  place_category_slug: PlaceCategorySlug | null;
  author_id: string | null;
  author_name: string | null;
  author_avatar_url: string | null;
  tag_type: TagType | null;
  tag_slug: string | null;
  share_slug: string | null;
  created_at: string;
  total_count: number;
};

export type AccountDeletionMode = "delete_all" | "preserve_public";
export type AccountDeletionStatus = "pending" | "processing" | "completed" | "failed";
export type NotificationCategory =
  | "collaboration"
  | "groups"
  | "time_capsules"
  | "security"
  | "product_updates";
export type NotificationDeliveryMode = "in_app" | "email" | "off";
export type NotificationType =
  | "entry_invitation_received"
  | "entry_invitation_accepted"
  | "entry_invitation_declined"
  | "entry_permissions_changed"
  | "entry_participant_removed"
  | "entry_collaborator_edited"
  | "group_invitation_received"
  | "group_invitation_accepted"
  | "group_invitation_declined"
  | "group_joined"
  | "group_role_changed"
  | "group_membership_changed"
  | "group_archived"
  | "story_route_updated"
  | "story_featured"
  | "story_restricted"
  | "time_capsule_unlocked"
  | "security_alert"
  | "export_completed"
  | "account_deletion_status"
  | "product_update";
export type NotificationEmailStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "cancelled";
export type EntryMediaStatus =
  | "pending"
  | "ready"
  | "failed"
  | "deleting"
  | "deleted";
export type MediaCleanupStatus = "pending" | "processing" | "failed";
export type ProductEventName =
  | "session_started"
  | "signup_started"
  | "signup_completed"
  | "onboarding_started"
  | "onboarding_completed"
  | "onboarding_skipped"
  | "story_create_started"
  | "story_created"
  | "story_published"
  | "draft_created"
  | "draft_resumed"
  | "route_created"
  | "search_used"
  | "search_result_opened"
  | "explore_opened"
  | "public_story_opened"
  | "public_profile_opened"
  | "story_shared"
  | "invitation_sent"
  | "invitation_accepted"
  | "export_started"
  | "export_completed";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";
export type EntitlementKey =
  | "can_upload_media"
  | "max_storage_bytes"
  | "max_media_files"
  | "max_story_routes"
  | "advanced_export";
export type EntitlementValueType = "boolean" | "integer";
export type ProductFeedbackCategory = "bug" | "feature" | "content" | "other";
export type ProductFeedbackStatus = "new" | "reviewing" | "resolved" | "dismissed";
export type FeatureFlagKey =
  | "media_upload"
  | "notifications"
  | "subscriptions"
  | "creator_features";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string;
          avatar_url: string | null;
          bio: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username?: string;
          display_name: string;
          avatar_url?: string | null;
          bio?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          username?: string;
          display_name?: string;
          avatar_url?: string | null;
          bio?: string | null;
          deleted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      plans: {
        Row: {
          code: string;
          name: string;
          description: string;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          name: string;
          description?: string;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string;
          is_active?: boolean;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      plan_entitlements: {
        Row: {
          plan_code: string;
          entitlement_key: EntitlementKey;
          value_type: EntitlementValueType;
          boolean_value: boolean | null;
          integer_value: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          plan_code: string;
          entitlement_key: EntitlementKey;
          value_type: EntitlementValueType;
          boolean_value?: boolean | null;
          integer_value?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          value_type?: EntitlementValueType;
          boolean_value?: boolean | null;
          integer_value?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_entitlements_plan_code_fkey";
            columns: ["plan_code"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["code"];
          },
        ];
      };
      user_subscriptions: {
        Row: {
          user_id: string;
          plan_code: string;
          status: SubscriptionStatus;
          current_period_start: string | null;
          current_period_end: string | null;
          canceled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          plan_code: string;
          status?: SubscriptionStatus;
          current_period_start?: string | null;
          current_period_end?: string | null;
          canceled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          plan_code?: string;
          status?: SubscriptionStatus;
          current_period_start?: string | null;
          current_period_end?: string | null;
          canceled_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_subscriptions_plan_code_fkey";
            columns: ["plan_code"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["code"];
          },
        ];
      };
      product_feedback: {
        Row: {
          id: string;
          user_id: string | null;
          category: ProductFeedbackCategory;
          message: string;
          current_route: string;
          app_version: string;
          status: ProductFeedbackStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          category: ProductFeedbackCategory;
          message: string;
          current_route: string;
          app_version: string;
          status?: ProductFeedbackStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: ProductFeedbackStatus;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_feedback_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      feature_flags: {
        Row: {
          key: FeatureFlagKey;
          description: string;
          enabled: boolean;
          rollout_percentage: number;
          authenticated_only: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          key: FeatureFlagKey;
          description?: string;
          enabled?: boolean;
          rollout_percentage?: number;
          authenticated_only?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          description?: string;
          enabled?: boolean;
          rollout_percentage?: number;
          authenticated_only?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      feature_flag_overrides: {
        Row: {
          flag_key: FeatureFlagKey;
          user_id: string;
          enabled: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          flag_key: FeatureFlagKey;
          user_id: string;
          enabled: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          enabled?: boolean;
          created_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "feature_flag_overrides_flag_key_fkey";
            columns: ["flag_key"];
            isOneToOne: false;
            referencedRelation: "feature_flags";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "feature_flag_overrides_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "feature_flag_overrides_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      app_admins: {
        Row: {
          user_id: string;
          role: "admin";
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          role?: "admin";
          created_by?: string | null;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      account_moderation: {
        Row: {
          user_id: string;
          status: AccountModerationStatus;
          reason: string;
          restricted_at: string | null;
          restricted_by: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          status?: AccountModerationStatus;
          reason?: string;
          restricted_at?: string | null;
          restricted_by?: string | null;
          updated_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      moderation_audit_logs: {
        Row: {
          id: string;
          admin_user_id: string | null;
          action: string;
          target_type: "entry" | "route" | "user" | "report";
          target_id: string;
          report_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      product_events: {
        Row: {
          id: string;
          event_name: ProductEventName;
          user_id: string | null;
          anonymous_session_id: string;
          properties: Json;
          occurred_at: string;
          created_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: NotificationType;
          category: NotificationCategory;
          actor_id: string | null;
          entity_type: string | null;
          entity_id: string | null;
          payload: Json;
          dedupe_key: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: NotificationType;
          category: NotificationCategory;
          actor_id?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          payload?: Json;
          dedupe_key?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          read_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_preferences: {
        Row: {
          user_id: string;
          category: NotificationCategory;
          delivery_mode: NotificationDeliveryMode;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          category: NotificationCategory;
          delivery_mode?: NotificationDeliveryMode;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          delivery_mode?: NotificationDeliveryMode;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_email_outbox: {
        Row: {
          id: string;
          user_id: string;
          notification_type: NotificationType;
          category: NotificationCategory;
          actor_id: string | null;
          entity_type: string | null;
          entity_id: string | null;
          payload: Json;
          dedupe_key: string | null;
          status: NotificationEmailStatus;
          attempt_count: number;
          next_attempt_at: string;
          processing_started_at: string | null;
          sent_at: string | null;
          last_error_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          notification_type: NotificationType;
          category: NotificationCategory;
          actor_id?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          payload?: Json;
          dedupe_key?: string | null;
          status?: NotificationEmailStatus;
          attempt_count?: number;
          next_attempt_at?: string;
          processing_started_at?: string | null;
          sent_at?: string | null;
          last_error_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: NotificationEmailStatus;
          attempt_count?: number;
          next_attempt_at?: string;
          processing_started_at?: string | null;
          sent_at?: string | null;
          last_error_code?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_email_outbox_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_email_outbox_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_experience_preferences: {
        Row: {
          user_id: string;
          onboarding_status: "pending" | "completed" | "skipped";
          interests: string[];
          first_story_id: string | null;
          finished_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          onboarding_status?: "pending" | "completed" | "skipped";
          interests?: string[];
          first_story_id?: string | null;
          finished_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          onboarding_status?: "pending" | "completed" | "skipped";
          interests?: string[];
          first_story_id?: string | null;
          finished_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_experience_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_experience_preferences_first_story_id_fkey";
            columns: ["first_story_id"];
            isOneToOne: false;
            referencedRelation: "map_entries";
            referencedColumns: ["id"];
          },
        ];
      };
      entry_drafts: {
        Row: {
          id: string;
          user_id: string;
          source_entry_id: string | null;
          source_updated_at: string | null;
          payload: Json | null;
          tag_input: string;
          revision: number;
          client_instance_id: string;
          status: EntryDraftStatus;
          published_entry_id: string | null;
          published_at: string | null;
          discarded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_entry_id?: string | null;
          source_updated_at?: string | null;
          payload: Json;
          tag_input?: string;
          revision?: number;
          client_instance_id: string;
          status?: EntryDraftStatus;
          published_entry_id?: string | null;
          published_at?: string | null;
          discarded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          payload?: Json | null;
          tag_input?: string;
          revision?: number;
          client_instance_id?: string;
          status?: EntryDraftStatus;
          published_entry_id?: string | null;
          published_at?: string | null;
          discarded_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entry_drafts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entry_drafts_source_entry_id_fkey";
            columns: ["source_entry_id"];
            isOneToOne: false;
            referencedRelation: "map_entries";
            referencedColumns: ["id"];
          },
        ];
      };
      entry_media_assets: {
        Row: {
          id: string;
          entry_id: string;
          user_id: string;
          storage_path: string;
          thumbnail_path: string;
          source_mime_type: "image/jpeg" | "image/png" | "image/webp";
          mime_type: "image/webp";
          width: number;
          height: number;
          size_bytes: number;
          thumbnail_size_bytes: number;
          sort_order: number;
          is_cover: boolean;
          status: EntryMediaStatus;
          failure_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          entry_id: string;
          user_id: string;
          storage_path: string;
          thumbnail_path: string;
          source_mime_type: "image/jpeg" | "image/png" | "image/webp";
          mime_type?: "image/webp";
          width: number;
          height: number;
          size_bytes: number;
          thumbnail_size_bytes: number;
          sort_order?: number;
          is_cover?: boolean;
          status?: EntryMediaStatus;
          failure_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          sort_order?: number;
          is_cover?: boolean;
          status?: EntryMediaStatus;
          failure_code?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entry_media_assets_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "map_entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entry_media_assets_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      media_cleanup_queue: {
        Row: {
          id: string;
          asset_id: string | null;
          bucket_id: "story-media";
          object_paths: string[];
          status: MediaCleanupStatus;
          attempt_count: number;
          next_attempt_at: string;
          processing_started_at: string | null;
          last_error_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          asset_id?: string | null;
          bucket_id?: "story-media";
          object_paths: string[];
          status?: MediaCleanupStatus;
          attempt_count?: number;
          next_attempt_at?: string;
          processing_started_at?: string | null;
          last_error_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: MediaCleanupStatus;
          attempt_count?: number;
          next_attempt_at?: string;
          processing_started_at?: string | null;
          last_error_code?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      account_deletion_requests: {
        Row: {
          id: string;
          user_id: string;
          deletion_mode: AccountDeletionMode;
          status: AccountDeletionStatus;
          requested_at: string;
          processing_started_at: string | null;
          completed_at: string | null;
          failure_code: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          deletion_mode: AccountDeletionMode;
          status?: AccountDeletionStatus;
          requested_at?: string;
          processing_started_at?: string | null;
          completed_at?: string | null;
          failure_code?: string | null;
        };
        Update: {
          status?: AccountDeletionStatus;
          processing_started_at?: string | null;
          completed_at?: string | null;
          failure_code?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "account_deletion_requests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
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
          unlock_at: string | null;
          featured_at: string | null;
          moderation_status: ContentModerationStatus;
          moderated_at: string | null;
          moderated_by: string | null;
          moderation_reason: string;
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
          unlock_at?: string | null;
          featured_at?: string | null;
          moderation_status?: ContentModerationStatus;
          moderated_at?: string | null;
          moderated_by?: string | null;
          moderation_reason?: string;
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
          unlock_at?: string | null;
          featured_at?: string | null;
          moderation_status?: ContentModerationStatus;
          moderated_at?: string | null;
          moderated_by?: string | null;
          moderation_reason?: string;
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
          type: TagType;
          semantic_key: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          normalized_name: string;
          slug?: string;
          type?: TagType;
          semantic_key?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          normalized_name?: string;
          type?: TagType;
          semantic_key?: string | null;
        };
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
          reporter_id: string | null;
          target_type: ReportTargetType;
          target_id: string;
          reason: ReportReason;
          description: string;
          status: ReportStatus;
          created_at: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          review_notes: string | null;
        };
        Insert: {
          id?: string;
          reporter_id?: string | null;
          target_type: ReportTargetType;
          target_id: string;
          reason: ReportReason;
          description?: string;
          status?: ReportStatus;
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
          moderation_status: ContentModerationStatus;
          moderated_at: string | null;
          moderated_by: string | null;
          moderation_reason: string;
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
          moderation_status?: ContentModerationStatus;
          moderated_at?: string | null;
          moderated_by?: string | null;
          moderation_reason?: string;
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
          moderation_status?: ContentModerationStatus;
          moderated_at?: string | null;
          moderated_by?: string | null;
          moderation_reason?: string;
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
          relation_type: StoryRouteRelationType;
          created_at: string;
        };
        Insert: {
          id?: string;
          route_id: string;
          entry_id: string;
          position: number;
          note?: string;
          relation_type?: StoryRouteRelationType;
          created_at?: string;
        };
        Update: {
          position?: number;
          note?: string;
          relation_type?: StoryRouteRelationType;
        };
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
      track_product_event: {
        Args: {
          p_event_id: string;
          p_anonymous_session_id: string;
          p_event_name: ProductEventName;
          p_properties?: Json;
        };
        Returns: undefined;
      };
      admin_get_product_analytics: {
        Args: { p_start_at?: string; p_end_at?: string };
        Returns: Json;
      };
      is_app_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_account_restricted: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      admin_get_dashboard: {
        Args: Record<string, never>;
        Returns: Json;
      };
      admin_list_users: {
        Args: { p_query?: string | null; p_offset?: number; p_limit?: number };
        Returns: Json;
      };
      admin_list_reports: {
        Args: { p_status?: ReportStatus | null; p_offset?: number; p_limit?: number };
        Returns: Json;
      };
      admin_list_public_content: {
        Args: { p_kind?: "entry" | "route" | null; p_offset?: number; p_limit?: number };
        Returns: Json;
      };
      admin_list_audit_logs: {
        Args: { p_limit?: number };
        Returns: Json;
      };
      admin_set_account_restriction: {
        Args: { p_user_id: string; p_restricted: boolean; p_reason?: string };
        Returns: undefined;
      };
      admin_moderate_entry: {
        Args: { p_entry_id: string; p_status: ContentModerationStatus; p_reason?: string };
        Returns: undefined;
      };
      admin_moderate_story_route: {
        Args: { p_route_id: string; p_status: ContentModerationStatus; p_reason?: string };
        Returns: undefined;
      };
      admin_set_entry_featured: {
        Args: { p_entry_id: string; p_featured: boolean };
        Returns: undefined;
      };
      admin_review_report: {
        Args: { p_report_id: string; p_status: Exclude<ReportStatus, "pending">; p_notes?: string };
        Returns: undefined;
      };
      set_notification_preference: {
        Args: {
          p_category: NotificationCategory;
          p_delivery_mode: NotificationDeliveryMode;
        };
        Returns: Database["public"]["Tables"]["notification_preferences"]["Row"];
      };
      mark_notification_read: {
        Args: { p_notification_id: string };
        Returns: undefined;
      };
      mark_all_notifications_read: {
        Args: Record<string, never>;
        Returns: number;
      };
      record_my_export_completed: {
        Args: { p_format: "json" | "csv" | "geojson" };
        Returns: undefined;
      };
      sync_my_time_capsule_notifications: {
        Args: { p_limit?: number };
        Returns: number;
      };
      sync_due_time_capsule_notifications: {
        Args: { p_limit?: number };
        Returns: number;
      };
      claim_notification_email_outbox: {
        Args: { p_limit?: number };
        Returns: Database["public"]["Tables"]["notification_email_outbox"]["Row"][];
      };
      finish_notification_email_outbox: {
        Args: {
          p_outbox_id: string;
          p_sent: boolean;
          p_error_code?: string | null;
        };
        Returns: undefined;
      };
      is_display_name_available: {
        Args: { candidate: string };
        Returns: boolean;
      };
      set_onboarding_preferences: {
        Args: { p_interests?: string[]; p_action?: "save" | "skip" };
        Returns: OnboardingPreference;
      };
      complete_onboarding: {
        Args: { p_entry_id: string };
        Returns: OnboardingPreference;
      };
      resolve_public_profile: {
        Args: { p_identifier: string };
        Returns: Array<{
          id: string;
          username: string;
          display_name: string;
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          updated_at: string;
        }>;
      };
      get_public_life_path_entries: {
        Args: {
          p_profile_id: string;
          p_offset?: number;
          p_limit?: number;
        };
        Returns: Json[];
      };
      get_public_life_path_summary: {
        Args: { p_profile_id: string };
        Returns: Array<{
          public_story_count: number;
          earliest_year: number | null;
          latest_year: number | null;
          distinct_place_count: number;
          first_time_label: string | null;
          last_time_label: string | null;
        }>;
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
      get_featured_public_entries: {
        Args: { p_limit?: number };
        Returns: MapEntry[];
      };
      get_social_feed_v11: {
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
      get_timeline_entries_v11: {
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
          p_capsule_state?: "past" | "current" | "future" | null;
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
      create_entry_v11: {
        Args: { p_entry: Json; p_tag_names?: string[] };
        Returns: Json;
      };
      update_entry_v11: {
        Args: {
          p_entry_id: string;
          p_patch: Json;
          p_tag_names?: string[] | null;
        };
        Returns: Json;
      };
      save_entry_draft: {
        Args: {
          p_draft_id: string | null;
          p_source_entry_id: string | null;
          p_payload: Json;
          p_tag_input: string;
          p_expected_revision: number;
          p_client_instance_id: string;
        };
        Returns: Database["public"]["Tables"]["entry_drafts"]["Row"];
      };
      get_account_deletion_impact: {
        Args: Record<string, never>;
        Returns: Json;
      };
      begin_account_deletion: {
        Args: { p_deletion_mode: AccountDeletionMode };
        Returns: string;
      };
      finalize_account_deletion: {
        Args: { p_request_id: string; p_user_id: string };
        Returns: undefined;
      };
      export_my_story_data: {
        Args: Record<string, never>;
        Returns: Json;
      };
      publish_entry_draft: {
        Args: {
          p_draft_id: string;
          p_expected_revision: number;
          p_entry: Json;
          p_tag_names?: string[];
        };
        Returns: Json;
      };
      discard_entry_draft: {
        Args: { p_draft_id: string };
        Returns: undefined;
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
      get_visible_tags: {
        Args: {
          p_tag_type?: TagType | null;
          p_offset?: number;
          p_limit?: number;
        };
        Returns: Array<{
          slug: string;
          name: string;
          tag_type: TagType;
          semantic_key: string | null;
          entry_count: number;
        }>;
      };
      get_typed_tag_entries: {
        Args: {
          p_tag_slug: string;
          p_tag_type?: TagType | null;
          p_offset?: number;
          p_limit?: number;
        };
        Returns: Json[];
      };
      get_visible_tag_summary_v11: {
        Args: { p_tag_slug: string; p_tag_type?: TagType | null };
        Returns: Array<{
          slug: string;
          name: string;
          tag_type: TagType;
          semantic_key: string | null;
          entry_count: number;
        }>;
      };
      get_public_emotion_entries: {
        Args: {
          p_emotion: string;
          p_offset?: number;
          p_limit?: number;
        };
        Returns: Json[];
      };
      get_public_emotion_summary: {
        Args: { p_emotion: string };
        Returns: Array<{
          slug: string;
          name: string;
          tag_type: "emotion";
          semantic_key: string;
          entry_count: number;
        }>;
      };
      get_public_explore_entries: {
        Args: {
          p_category?: string;
          p_cursor_created_at?: string | null;
          p_cursor_id?: string | null;
          p_limit?: number;
        };
        Returns: MapEntry[];
      };
      search_story_and_place: {
        Args: {
          p_query?: string | null;
          p_start_year?: number | null;
          p_end_year?: number | null;
          p_place?: string | null;
          p_tag?: string | null;
          p_emotion?: string | null;
          p_author_id?: string | null;
          p_content_types?: GlobalSearchResultType[] | null;
          p_offset?: number;
          p_limit?: number;
        };
        Returns: GlobalSearchResult[];
      };
      consume_server_rate_limit: {
        Args: {
          p_scope: string;
          p_key_hash: string;
          p_limit: number;
          p_window_seconds: number;
        };
        Returns: Array<{
          allowed: boolean;
          retry_after_seconds: number;
          remaining: number;
        }>;
      };
      reserve_entry_media_asset: {
        Args: {
          p_user_id: string;
          p_entry_id: string;
          p_source_mime_type: "image/jpeg" | "image/png" | "image/webp";
          p_size_bytes: number;
          p_thumbnail_size_bytes: number;
          p_width: number;
          p_height: number;
        };
        Returns: Database["public"]["Tables"]["entry_media_assets"]["Row"];
      };
      mark_entry_media_asset_ready: {
        Args: { p_asset_id: string };
        Returns: Database["public"]["Tables"]["entry_media_assets"]["Row"];
      };
      mark_entry_media_asset_failed: {
        Args: { p_asset_id: string; p_failure_code?: string | null };
        Returns: undefined;
      };
      begin_entry_media_asset_delete: {
        Args: { p_asset_id: string };
        Returns: Database["public"]["Tables"]["entry_media_assets"]["Row"];
      };
      set_entry_media_cover: {
        Args: { p_entry_id: string; p_asset_id: string };
        Returns: undefined;
      };
      reorder_entry_media_assets: {
        Args: { p_entry_id: string; p_asset_ids: string[] };
        Returns: undefined;
      };
      get_my_story_media_usage: {
        Args: Record<string, never>;
        Returns: Array<{
          used_bytes: number;
          quota_bytes: number;
          file_count: number;
        }>;
      };
      get_my_commercial_access: {
        Args: Record<string, never>;
        Returns: Array<{
          plan_code: string;
          plan_name: string;
          plan_description: string;
          subscription_status: SubscriptionStatus | null;
          current_period_end: string | null;
          can_upload_media: boolean;
          max_storage_bytes: number;
          max_media_files: number;
          max_story_routes: number;
          advanced_export: boolean;
          story_count: number;
          active_route_count: number;
          storage_bytes: number;
          media_file_count: number;
        }>;
      };
      get_evaluated_feature_flags: {
        Args: Record<string, never>;
        Returns: Array<{
          flag_key: FeatureFlagKey;
          enabled: boolean;
        }>;
      };
      claim_story_media_cleanup: {
        Args: { p_limit?: number };
        Returns: Database["public"]["Tables"]["media_cleanup_queue"]["Row"][];
      };
      finish_story_media_cleanup: {
        Args: {
          p_queue_id: string;
          p_succeeded: boolean;
          p_error_code?: string | null;
        };
        Returns: undefined;
      };
      complete_entry_media_asset_delete: {
        Args: { p_asset_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Plan = Database["public"]["Tables"]["plans"]["Row"];
export type PlanEntitlement = Database["public"]["Tables"]["plan_entitlements"]["Row"];
export type UserSubscription = Database["public"]["Tables"]["user_subscriptions"]["Row"];
export type ProductFeedback = Database["public"]["Tables"]["product_feedback"]["Row"];
export type FeatureFlag = Database["public"]["Tables"]["feature_flags"]["Row"];
export type FeatureFlagOverride = Database["public"]["Tables"]["feature_flag_overrides"]["Row"];
export type MapEntry = Database["public"]["Tables"]["map_entries"]["Row"];
export type MapEntryInsert = Database["public"]["Tables"]["map_entries"]["Insert"];
export type MapEntryUpdate = Database["public"]["Tables"]["map_entries"]["Update"];
export type EntryDraft = Database["public"]["Tables"]["entry_drafts"]["Row"];
export type AccountDeletionRequest = Database["public"]["Tables"]["account_deletion_requests"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
export type NotificationPreference = Database["public"]["Tables"]["notification_preferences"]["Row"];
export type NotificationEmailOutbox = Database["public"]["Tables"]["notification_email_outbox"]["Row"];
export type EntryMediaAsset = Database["public"]["Tables"]["entry_media_assets"]["Row"];
export type MediaCleanupQueueItem = Database["public"]["Tables"]["media_cleanup_queue"]["Row"];
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

export type NotificationWithActor = Notification & {
  actor: Pick<Profile, "display_name" | "avatar_url"> | null;
};

export type EntryParticipantWithProfile = EntryParticipant & {
  profiles: Pick<Profile, "display_name" | "avatar_url"> | null;
};

export type EntryTagWithTag = EntryTag & {
  tags: Pick<Tag, "id" | "name" | "slug" | "type" | "semantic_key"> | null;
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
  unlock_at: string | null;
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
