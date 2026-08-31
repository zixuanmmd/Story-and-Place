-- Keep the notification entity contract compatible with governance events.
-- Account moderation points to the affected public profile without exposing
-- authentication data. Existing notification rows remain valid.

do $$
begin
  if to_regclass('public.notifications') is null
    or to_regclass('public.account_moderation') is null
  then
    raise exception using
      errcode = '55000',
      message = 'governance notification fix requires notifications and governance migrations';
  end if;
end;
$$;

alter table public.notifications
  drop constraint if exists notifications_entity_values;

alter table public.notifications
  add constraint notifications_entity_values check (
    entity_type is null or entity_type in (
      'entry', 'entry_participant', 'group', 'group_invitation',
      'story_route', 'account', 'profile', 'export', 'system'
    )
  ) not valid;

alter table public.notifications
  validate constraint notifications_entity_values;

comment on constraint notifications_entity_values on public.notifications is
  'Notification targets, including public profiles referenced by account moderation events.';

notify pgrst, 'reload schema';
