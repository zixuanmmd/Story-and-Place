-- Story-and-Place v1.4 post-launch hardening.
--
-- PostgreSQL does not automatically index the referencing side of foreign
-- keys. These indexes keep joins, parent updates and account/data cleanup from
-- degrading into full-table scans as production data grows. Nullable audit
-- references use partial indexes so null-only rows do not consume index space.

set lock_timeout = '5s';
set statement_timeout = '10min';

create index if not exists account_moderation_restricted_by_idx
  on public.account_moderation (restricted_by)
  where restricted_by is not null;

create index if not exists app_admins_created_by_idx
  on public.app_admins (created_by)
  where created_by is not null;

create index if not exists entry_comments_moderated_by_idx
  on public.entry_comments (moderated_by)
  where moderated_by is not null;

create index if not exists entry_comments_user_id_idx
  on public.entry_comments (user_id);

create index if not exists entry_drafts_published_entry_id_idx
  on public.entry_drafts (published_entry_id)
  where published_entry_id is not null;

create index if not exists entry_likes_user_id_idx
  on public.entry_likes (user_id);

create index if not exists entry_participants_invited_by_idx
  on public.entry_participants (invited_by)
  where invited_by is not null;

create index if not exists entry_tags_added_by_idx
  on public.entry_tags (added_by)
  where added_by is not null;

create index if not exists feature_flag_overrides_created_by_idx
  on public.feature_flag_overrides (created_by)
  where created_by is not null;

create index if not exists group_invitations_inviter_id_idx
  on public.group_invitations (inviter_id);

create index if not exists groups_archived_by_idx
  on public.groups (archived_by)
  where archived_by is not null;

create index if not exists map_entries_moderated_by_idx
  on public.map_entries (moderated_by)
  where moderated_by is not null;

create index if not exists moderation_audit_logs_admin_user_id_idx
  on public.moderation_audit_logs (admin_user_id)
  where admin_user_id is not null;

create index if not exists moderation_audit_logs_report_id_idx
  on public.moderation_audit_logs (report_id)
  where report_id is not null;

create index if not exists notification_email_outbox_actor_id_idx
  on public.notification_email_outbox (actor_id)
  where actor_id is not null;

create index if not exists notifications_actor_id_idx
  on public.notifications (actor_id)
  where actor_id is not null;

create index if not exists reports_reviewed_by_idx
  on public.reports (reviewed_by)
  where reviewed_by is not null;

create index if not exists story_routes_archived_by_idx
  on public.story_routes (archived_by)
  where archived_by is not null;

create index if not exists story_routes_featured_by_idx
  on public.story_routes (featured_by)
  where featured_by is not null;

create index if not exists story_routes_moderated_by_idx
  on public.story_routes (moderated_by)
  where moderated_by is not null;

create index if not exists tags_created_by_idx
  on public.tags (created_by)
  where created_by is not null;

create index if not exists user_experience_preferences_first_story_id_idx
  on public.user_experience_preferences (first_story_id)
  where first_story_id is not null;

notify pgrst, 'reload schema';
