-- Run after 202609020001_v14_post_launch_fk_indexes.sql.
-- Catalog-only assertion: it does not create, update or delete business data.

\set ON_ERROR_STOP on

begin;

do $$
declare
  invalid_indexes text;
begin
  select pg_catalog.string_agg(expected.index_name, ', ' order by expected.index_name)
  into invalid_indexes
  from (
    values
      ('account_moderation_restricted_by_idx'),
      ('app_admins_created_by_idx'),
      ('entry_comments_moderated_by_idx'),
      ('entry_comments_user_id_idx'),
      ('entry_drafts_published_entry_id_idx'),
      ('entry_likes_user_id_idx'),
      ('entry_participants_invited_by_idx'),
      ('entry_tags_added_by_idx'),
      ('feature_flag_overrides_created_by_idx'),
      ('group_invitations_inviter_id_idx'),
      ('groups_archived_by_idx'),
      ('map_entries_moderated_by_idx'),
      ('moderation_audit_logs_admin_user_id_idx'),
      ('moderation_audit_logs_report_id_idx'),
      ('notification_email_outbox_actor_id_idx'),
      ('notifications_actor_id_idx'),
      ('reports_reviewed_by_idx'),
      ('story_routes_archived_by_idx'),
      ('story_routes_featured_by_idx'),
      ('story_routes_moderated_by_idx'),
      ('tags_created_by_idx'),
      ('user_experience_preferences_first_story_id_idx')
  ) as expected(index_name)
  left join pg_catalog.pg_class index_class
    on index_class.oid = pg_catalog.to_regclass(
      pg_catalog.format('public.%I', expected.index_name)
    )
  left join pg_catalog.pg_index index_metadata
    on index_metadata.indexrelid = index_class.oid
  where index_metadata.indexrelid is null
    or not index_metadata.indisvalid
    or not index_metadata.indisready;

  if invalid_indexes is not null then
    raise exception 'missing or invalid post-launch indexes: %', invalid_indexes;
  end if;
end;
$$;

rollback;
