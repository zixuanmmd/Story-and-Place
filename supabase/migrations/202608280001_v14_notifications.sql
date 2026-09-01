-- Story-and-Place v1.4 Phase 2: privacy-safe notifications, delivery
-- preferences, and an email outbox. This migration only queues email work;
-- it does not claim that an email provider has delivered a message.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.map_entries') is null
    or to_regclass('public.entry_participants') is null
    or to_regclass('public.entry_edit_logs') is null
    or to_regclass('public.groups') is null
    or to_regclass('public.group_members') is null
    or to_regclass('public.group_invitations') is null
    or to_regclass('public.story_routes') is null
  then
    raise exception using
      errcode = '55000',
      message = 'v1.4 notifications require all migrations through 202608270001';
  end if;
end;
$$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  category text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_values check (type in (
    'entry_invitation_received',
    'entry_invitation_accepted',
    'entry_invitation_declined',
    'entry_permissions_changed',
    'entry_participant_removed',
    'entry_collaborator_edited',
    'group_invitation_received',
    'group_invitation_accepted',
    'group_invitation_declined',
    'group_joined',
    'group_role_changed',
    'group_membership_changed',
    'group_archived',
    'story_route_updated',
    'story_featured',
    'story_restricted',
    'time_capsule_unlocked',
    'security_alert',
    'export_completed',
    'account_deletion_status',
    'product_update'
  )),
  constraint notifications_category_values check (category in (
    'collaboration', 'groups', 'time_capsules', 'security', 'product_updates'
  )),
  constraint notifications_entity_values check (
    entity_type is null or entity_type in (
      'entry', 'entry_participant', 'group', 'group_invitation',
      'story_route', 'account', 'export', 'system'
    )
  ),
  constraint notifications_entity_consistency check (
    (entity_type is null and entity_id is null)
    or (entity_type is not null and entity_id is not null)
  ),
  constraint notifications_payload_is_object check (jsonb_typeof(payload) = 'object'),
  constraint notifications_dedupe_key_length check (
    dedupe_key is null or char_length(dedupe_key) between 1 and 180
  )
);

create table public.notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  delivery_mode text not null default 'in_app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, category),
  constraint notification_preferences_category_values check (category in (
    'collaboration', 'groups', 'time_capsules', 'security', 'product_updates'
  )),
  constraint notification_preferences_delivery_values check (
    delivery_mode in ('in_app', 'email', 'off')
  ),
  constraint notification_preferences_security_required check (
    category <> 'security' or delivery_mode <> 'off'
  )
);

create table public.notification_email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null,
  category text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_email_outbox_type_values check (notification_type in (
    'entry_invitation_received',
    'entry_invitation_accepted',
    'entry_invitation_declined',
    'entry_permissions_changed',
    'entry_participant_removed',
    'entry_collaborator_edited',
    'group_invitation_received',
    'group_invitation_accepted',
    'group_invitation_declined',
    'group_joined',
    'group_role_changed',
    'group_membership_changed',
    'group_archived',
    'story_route_updated',
    'story_featured',
    'story_restricted',
    'time_capsule_unlocked',
    'security_alert',
    'export_completed',
    'account_deletion_status',
    'product_update'
  )),
  constraint notification_email_outbox_category_values check (category in (
    'collaboration', 'groups', 'time_capsules', 'security', 'product_updates'
  )),
  constraint notification_email_outbox_entity_consistency check (
    (entity_type is null and entity_id is null)
    or (entity_type is not null and entity_id is not null)
  ),
  constraint notification_email_outbox_payload_is_object check (
    jsonb_typeof(payload) = 'object'
  ),
  constraint notification_email_outbox_status_values check (
    status in ('pending', 'processing', 'sent', 'failed', 'cancelled')
  ),
  constraint notification_email_outbox_attempt_range check (
    attempt_count between 0 and 20
  ),
  constraint notification_email_outbox_error_code_length check (
    last_error_code is null or char_length(last_error_code) <= 80
  )
);

create unique index notifications_user_dedupe_idx
  on public.notifications(user_id, dedupe_key)
  where dedupe_key is not null;
create index notifications_user_created_idx
  on public.notifications(user_id, created_at desc, id desc);
create index notifications_user_unread_idx
  on public.notifications(user_id, created_at desc, id desc)
  where read_at is null;
create unique index notification_email_outbox_user_dedupe_idx
  on public.notification_email_outbox(user_id, dedupe_key)
  where dedupe_key is not null;
create index notification_email_outbox_pending_idx
  on public.notification_email_outbox(next_attempt_at, created_at, id)
  where status in ('pending', 'failed');

create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

create trigger notification_email_outbox_set_updated_at
before update on public.notification_email_outbox
for each row execute function public.set_updated_at();

create or replace function private.default_notification_delivery_mode(
  p_category text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_category = 'product_updates' then 'off'
    else 'in_app'
  end;
$$;

create or replace function private.enqueue_user_notification(
  p_user_id uuid,
  p_type text,
  p_category text,
  p_actor_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb,
  p_dedupe_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery text;
  queued_id uuid;
  safe_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if p_user_id is null then
    return null;
  end if;
  if jsonb_typeof(safe_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'notification payload must be an object';
  end if;

  select preference.delivery_mode
  into delivery
  from public.notification_preferences preference
  where preference.user_id = p_user_id
    and preference.category = p_category;

  delivery := coalesce(
    delivery,
    private.default_notification_delivery_mode(p_category)
  );

  if p_category = 'security' and delivery = 'off' then
    delivery := 'in_app';
  end if;
  if delivery = 'off' then
    return null;
  end if;

  if delivery = 'email' then
    insert into public.notification_email_outbox (
      user_id,
      notification_type,
      category,
      actor_id,
      entity_type,
      entity_id,
      payload,
      dedupe_key
    ) values (
      p_user_id,
      p_type,
      p_category,
      p_actor_id,
      p_entity_type,
      p_entity_id,
      safe_payload,
      p_dedupe_key
    )
    on conflict (user_id, dedupe_key) where dedupe_key is not null
    do nothing
    returning id into queued_id;
  else
    insert into public.notifications (
      user_id,
      type,
      category,
      actor_id,
      entity_type,
      entity_id,
      payload,
      dedupe_key
    ) values (
      p_user_id,
      p_type,
      p_category,
      p_actor_id,
      p_entity_type,
      p_entity_id,
      safe_payload,
      p_dedupe_key
    )
    on conflict (user_id, dedupe_key) where dedupe_key is not null
    do nothing
    returning id into queued_id;
  end if;

  return queued_id;
end;
$$;

create or replace function private.initialize_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_preferences (user_id, category, delivery_mode)
  values
    (new.id, 'collaboration', 'in_app'),
    (new.id, 'groups', 'in_app'),
    (new.id, 'time_capsules', 'in_app'),
    (new.id, 'security', 'in_app'),
    (new.id, 'product_updates', 'off')
  on conflict (user_id, category) do nothing;
  return new;
end;
$$;

create trigger profiles_initialize_notification_preferences
after insert on public.profiles
for each row execute function private.initialize_notification_preferences();

insert into public.notification_preferences (user_id, category, delivery_mode)
select profile.id, seed.category, seed.delivery_mode
from public.profiles profile
cross join (
  values
    ('collaboration', 'in_app'),
    ('groups', 'in_app'),
    ('time_capsules', 'in_app'),
    ('security', 'in_app'),
    ('product_updates', 'off')
) as seed(category, delivery_mode)
on conflict (user_id, category) do nothing;

create or replace function public.set_notification_preference(
  p_category text,
  p_delivery_mode text
)
returns public.notification_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  result public.notification_preferences%rowtype;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_category not in (
    'collaboration', 'groups', 'time_capsules', 'security', 'product_updates'
  ) then
    raise exception using errcode = '22023', message = 'invalid notification category';
  end if;
  if p_delivery_mode not in ('in_app', 'email', 'off') then
    raise exception using errcode = '22023', message = 'invalid notification delivery mode';
  end if;
  if p_category = 'security' and p_delivery_mode = 'off' then
    raise exception using errcode = '23514', message = 'security notifications cannot be disabled';
  end if;

  insert into public.notification_preferences (user_id, category, delivery_mode)
  values (actor, p_category, p_delivery_mode)
  on conflict (user_id, category) do update
    set delivery_mode = excluded.delivery_mode,
        updated_at = now()
  returning * into result;

  return result;
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and user_id = (select auth.uid());
  if not found then
    raise exception using errcode = 'P0002', message = 'notification not found';
  end if;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  update public.notifications
  set read_at = now()
  where user_id = (select auth.uid())
    and read_at is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.record_my_export_completed(
  p_format text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  normalized_format text := lower(btrim(coalesce(p_format, '')));
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if normalized_format not in ('json', 'csv', 'geojson') then
    raise exception using errcode = '22023', message = 'invalid export format';
  end if;
  perform private.enqueue_user_notification(
    actor,
    'export_completed',
    'security',
    null,
    'export',
    gen_random_uuid(),
    jsonb_build_object(
      'export_format', normalized_format,
      'target_path', '/settings'
    ),
    'export-completed:' || actor::text || ':' || normalized_format || ':' || date_trunc('minute', now())::text
  );
end;
$$;

create or replace function private.notify_entry_participant_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_row public.map_entries%rowtype;
  actor uuid := (select auth.uid());
begin
  select * into entry_row
  from public.map_entries
  where id = new.entry_id;

  if new.status = 'pending'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    perform private.enqueue_user_notification(
      new.user_id,
      'entry_invitation_received',
      'collaboration',
      new.invited_by,
      'entry_participant',
      new.entry_id,
      jsonb_strip_nulls(jsonb_build_object(
        'entry_title', entry_row.title,
        'time_label', entry_row.time_label,
        'place_name', entry_row.place_name,
        'editable_fields', new.editable_fields,
        'target_path', '/entry-invitations'
      )),
      'entry-invite:' || new.entry_id::text || ':' || new.user_id::text || ':' || extract(epoch from new.updated_at)::text
    );
  end if;

  if tg_op = 'UPDATE'
    and new.status in ('accepted', 'declined')
    and old.status is distinct from new.status
  then
    perform private.enqueue_user_notification(
      entry_row.user_id,
      case when new.status = 'accepted'
        then 'entry_invitation_accepted'
        else 'entry_invitation_declined'
      end,
      'collaboration',
      new.user_id,
      'entry',
      new.entry_id,
      jsonb_build_object(
        'entry_title', entry_row.title,
        'target_path', '/entries/' || new.entry_id::text
      ),
      'entry-invite-response:' || new.entry_id::text || ':' || new.user_id::text || ':' || new.status || ':' || extract(epoch from new.updated_at)::text
    );
  end if;

  if tg_op = 'UPDATE'
    and new.status = 'accepted'
    and old.status = 'accepted'
    and old.editable_fields is distinct from new.editable_fields
  then
    perform private.enqueue_user_notification(
      new.user_id,
      'entry_permissions_changed',
      'collaboration',
      coalesce(actor, entry_row.user_id),
      'entry',
      new.entry_id,
      jsonb_build_object(
        'entry_title', entry_row.title,
        'editable_fields', new.editable_fields,
        'target_path', '/entries/' || new.entry_id::text
      ),
      'entry-permissions:' || new.entry_id::text || ':' || new.user_id::text || ':' || extract(epoch from new.updated_at)::text
    );
  end if;

  if tg_op = 'UPDATE'
    and new.status = 'revoked'
    and old.status is distinct from new.status
  then
    perform private.enqueue_user_notification(
      new.user_id,
      'entry_participant_removed',
      'collaboration',
      coalesce(actor, entry_row.user_id),
      'entry_participant',
      new.entry_id,
      jsonb_build_object(
        'entry_title', entry_row.title,
        'target_path', '/entry-invitations'
      ),
      'entry-participant-removed:' || new.entry_id::text || ':' || new.user_id::text || ':' || extract(epoch from new.updated_at)::text
    );
  end if;

  return new;
end;
$$;

create trigger entry_participants_notify_change
after insert or update of status, editable_fields on public.entry_participants
for each row execute function private.notify_entry_participant_change();

create or replace function private.notify_entry_collaborator_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_row public.map_entries%rowtype;
begin
  select * into entry_row
  from public.map_entries
  where id = new.entry_id;

  if new.editor_id is not null and new.editor_id <> entry_row.user_id then
    perform private.enqueue_user_notification(
      entry_row.user_id,
      'entry_collaborator_edited',
      'collaboration',
      new.editor_id,
      'entry',
      new.entry_id,
      jsonb_build_object(
        'entry_title', entry_row.title,
        'changed_fields', new.changed_fields,
        'target_path', '/entries/' || new.entry_id::text
      ),
      'entry-edit-log:' || new.id::text
    );
  end if;
  return new;
end;
$$;

create trigger entry_edit_logs_notify_owner
after insert on public.entry_edit_logs
for each row execute function private.notify_entry_collaborator_edit();

create or replace function private.notify_group_invitation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_row public.groups%rowtype;
begin
  select * into group_row from public.groups where id = new.group_id;

  if new.status = 'pending' and tg_op = 'INSERT' then
    perform private.enqueue_user_notification(
      new.invitee_id,
      'group_invitation_received',
      'groups',
      new.inviter_id,
      'group_invitation',
      new.id,
      jsonb_build_object(
        'group_name', group_row.name,
        'group_slug', group_row.slug,
        'target_path', '/groups/invitations'
      ),
      'group-invite:' || new.id::text
    );
  end if;

  if tg_op = 'UPDATE'
    and new.status in ('accepted', 'declined')
    and old.status is distinct from new.status
  then
    perform private.enqueue_user_notification(
      new.inviter_id,
      case when new.status = 'accepted'
        then 'group_invitation_accepted'
        else 'group_invitation_declined'
      end,
      'groups',
      new.invitee_id,
      'group',
      new.group_id,
      jsonb_build_object(
        'group_name', group_row.name,
        'group_slug', group_row.slug,
        'target_path', '/groups/' || group_row.slug
      ),
      'group-invite-response:' || new.id::text || ':' || new.status
    );
  end if;
  return new;
end;
$$;

create trigger group_invitations_notify_change
after insert or update of status on public.group_invitations
for each row execute function private.notify_group_invitation_change();

create or replace function private.notify_group_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_row public.groups%rowtype;
  actor uuid := (select auth.uid());
begin
  select * into group_row from public.groups where id = new.group_id;

  if new.status = 'active'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    perform private.enqueue_user_notification(
      new.user_id,
      'group_joined',
      'groups',
      actor,
      'group',
      new.group_id,
      jsonb_build_object(
        'group_name', group_row.name,
        'group_slug', group_row.slug,
        'role', new.role,
        'target_path', '/groups/' || group_row.slug
      ),
      'group-joined:' || new.group_id::text || ':' || new.user_id::text || ':' || extract(epoch from new.updated_at)::text
    );
  end if;

  if tg_op = 'UPDATE'
    and new.status = 'active'
    and old.status = 'active'
    and old.role is distinct from new.role
  then
    perform private.enqueue_user_notification(
      new.user_id,
      'group_role_changed',
      'groups',
      actor,
      'group',
      new.group_id,
      jsonb_build_object(
        'group_name', group_row.name,
        'group_slug', group_row.slug,
        'role', new.role,
        'target_path', '/groups/' || group_row.slug || '/members'
      ),
      'group-role:' || new.group_id::text || ':' || new.user_id::text || ':' || extract(epoch from new.updated_at)::text
    );
  end if;

  if tg_op = 'UPDATE'
    and old.status = 'active'
    and new.status in ('left', 'removed')
  then
    perform private.enqueue_user_notification(
      new.user_id,
      'group_membership_changed',
      'groups',
      actor,
      'group',
      new.group_id,
      jsonb_build_object(
        'group_name', group_row.name,
        'membership_status', new.status,
        'target_path', '/groups'
      ),
      'group-membership:' || new.group_id::text || ':' || new.user_id::text || ':' || new.status || ':' || extract(epoch from new.updated_at)::text
    );
  end if;
  return new;
end;
$$;

create trigger group_members_notify_change
after insert or update of role, status on public.group_members
for each row execute function private.notify_group_membership_change();

create or replace function private.notify_group_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_row record;
begin
  if old.archived_at is null and new.archived_at is not null then
    for member_row in
      select member.user_id
      from public.group_members member
      where member.group_id = new.id and member.status = 'active'
    loop
      perform private.enqueue_user_notification(
        member_row.user_id,
        'group_archived',
        'groups',
        new.archived_by,
        'group',
        new.id,
        jsonb_build_object(
          'group_name', new.name,
          'group_slug', new.slug,
          'target_path', '/groups/' || new.slug
        ),
        'group-archived:' || new.id::text
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger groups_notify_archive
after update of archived_at on public.groups
for each row execute function private.notify_group_archive();

create or replace function private.notify_story_featured()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.featured_at is null and new.featured_at is not null then
    perform private.enqueue_user_notification(
      new.user_id,
      'story_featured',
      'collaboration',
      null,
      'entry',
      new.id,
      jsonb_build_object(
        'entry_title', new.title,
        'target_path', '/entries/' || new.id::text
      ),
      'story-featured:' || new.id::text || ':' || extract(epoch from new.featured_at)::text
    );
  end if;
  return new;
end;
$$;

create trigger map_entries_notify_featured
after update of featured_at on public.map_entries
for each row execute function private.notify_story_featured();

create or replace function private.notify_story_route_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is not null
    and actor <> new.created_by
    and to_jsonb(old) is distinct from to_jsonb(new)
  then
    perform private.enqueue_user_notification(
      new.created_by,
      'story_route_updated',
      'collaboration',
      actor,
      'story_route',
      new.id,
      jsonb_build_object(
        'route_title', new.title,
        'share_slug', new.share_slug,
        'target_path', '/routes/' || new.share_slug
      ),
      'story-route-updated:' || new.id::text || ':' || extract(epoch from new.updated_at)::text
    );
  end if;
  return new;
end;
$$;

create trigger story_routes_notify_external_change
after update on public.story_routes
for each row execute function private.notify_story_route_change();

create or replace function private.handle_account_deletion_notification_data()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and new.status = 'failed' then
    perform private.enqueue_user_notification(
      new.user_id,
      'account_deletion_status',
      'security',
      null,
      'account',
      new.id,
      jsonb_build_object(
        'deletion_status', 'failed',
        'target_path', '/settings'
      ),
      'account-deletion-failed:' || new.id::text || ':' || coalesce(new.failure_code, 'unknown')
    );
  elsif old.status is distinct from new.status and new.status = 'completed' then
    delete from public.notification_email_outbox where user_id = new.user_id;
    delete from public.notifications where user_id = new.user_id;
    delete from public.notification_preferences where user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger account_deletion_requests_handle_notification_data
after update of status on public.account_deletion_requests
for each row execute function private.handle_account_deletion_notification_data();

create or replace function private.sync_due_capsules_for_user(
  p_user_id uuid,
  p_limit integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_row record;
  queued integer := 0;
  queued_id uuid;
begin
  for entry_row in
    select entry.id, entry.title, entry.unlock_at
    from public.map_entries entry
    where entry.user_id = p_user_id
      and entry.unlock_at is not null
      and entry.unlock_at <= now()
      and not exists (
        select 1
        from public.notifications notification
        where notification.user_id = p_user_id
          and notification.dedupe_key = 'time-capsule-unlocked:' || entry.id::text
      )
      and not exists (
        select 1
        from public.notification_email_outbox outbox
        where outbox.user_id = p_user_id
          and outbox.dedupe_key = 'time-capsule-unlocked:' || entry.id::text
      )
    order by entry.unlock_at asc, entry.id asc
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
  loop
    queued_id := private.enqueue_user_notification(
      p_user_id,
      'time_capsule_unlocked',
      'time_capsules',
      null,
      'entry',
      entry_row.id,
      jsonb_build_object(
        'entry_title', entry_row.title,
        'unlock_at', entry_row.unlock_at,
        'target_path', '/entries/' || entry_row.id::text
      ),
      'time-capsule-unlocked:' || entry_row.id::text
    );
    if queued_id is not null then
      queued := queued + 1;
    end if;
  end loop;
  return queued;
end;
$$;

create or replace function public.sync_my_time_capsule_notifications(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  return private.sync_due_capsules_for_user(actor, p_limit);
end;
$$;

create or replace function public.sync_due_time_capsule_notifications(
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_row record;
  remaining integer := least(greatest(coalesce(p_limit, 500), 1), 2000);
  added integer := 0;
  owner_added integer;
begin
  for owner_row in
    select distinct entry.user_id
    from public.map_entries entry
    where entry.unlock_at is not null
      and entry.unlock_at <= now()
    order by entry.user_id
  loop
    exit when remaining <= 0;
    owner_added := private.sync_due_capsules_for_user(owner_row.user_id, remaining);
    added := added + owner_added;
    remaining := remaining - owner_added;
  end loop;
  return added;
end;
$$;

create or replace function public.claim_notification_email_outbox(
  p_limit integer default 25
)
returns setof public.notification_email_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select outbox.id
    from public.notification_email_outbox outbox
    where outbox.attempt_count < 20
      and (
        (
          outbox.status in ('pending', 'failed')
          and outbox.next_attempt_at <= now()
        ) or (
          outbox.status = 'processing'
          and outbox.processing_started_at < now() - interval '10 minutes'
        )
      )
    order by outbox.next_attempt_at asc, outbox.created_at asc, outbox.id asc
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  )
  update public.notification_email_outbox outbox
  set status = 'processing',
      attempt_count = least(outbox.attempt_count + 1, 20),
      processing_started_at = now(),
      last_error_code = null,
      updated_at = now()
  from candidates
  where outbox.id = candidates.id
  returning outbox.*;
end;
$$;

create or replace function public.finish_notification_email_outbox(
  p_outbox_id uuid,
  p_sent boolean,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_email_outbox
  set status = case when p_sent then 'sent' else 'failed' end,
      sent_at = case when p_sent then now() else null end,
      processing_started_at = null,
      last_error_code = case
        when p_sent then null
        else left(coalesce(nullif(btrim(p_error_code), ''), 'provider_failure'), 80)
      end,
      next_attempt_at = case
        when p_sent then next_attempt_at
        else now() + least(
          interval '6 hours',
          interval '1 minute' * power(2, least(attempt_count, 8))::double precision
        )
      end,
      updated_at = now()
  where id = p_outbox_id and status = 'processing';
  if not found then
    raise exception using errcode = 'P0002', message = 'processing outbox item not found';
  end if;
end;
$$;

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_email_outbox enable row level security;

create policy "users_read_own_notifications"
on public.notifications for select to authenticated
using (user_id = (select auth.uid()));

create policy "users_read_own_notification_preferences"
on public.notification_preferences for select to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.notifications from anon, authenticated;
revoke all on table public.notification_preferences from anon, authenticated;
revoke all on table public.notification_email_outbox from anon, authenticated;
grant select on table public.notifications to authenticated;
grant select on table public.notification_preferences to authenticated;

revoke all on function private.default_notification_delivery_mode(text) from public, anon, authenticated;
revoke all on function private.enqueue_user_notification(uuid, text, text, uuid, text, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function private.initialize_notification_preferences() from public, anon, authenticated;
revoke all on function private.notify_entry_participant_change() from public, anon, authenticated;
revoke all on function private.notify_entry_collaborator_edit() from public, anon, authenticated;
revoke all on function private.notify_group_invitation_change() from public, anon, authenticated;
revoke all on function private.notify_group_membership_change() from public, anon, authenticated;
revoke all on function private.notify_group_archive() from public, anon, authenticated;
revoke all on function private.notify_story_featured() from public, anon, authenticated;
revoke all on function private.notify_story_route_change() from public, anon, authenticated;
revoke all on function private.handle_account_deletion_notification_data() from public, anon, authenticated;
revoke all on function private.sync_due_capsules_for_user(uuid, integer) from public, anon, authenticated;

revoke all on function public.set_notification_preference(text, text) from public, anon, authenticated;
revoke all on function public.mark_notification_read(uuid) from public, anon, authenticated;
revoke all on function public.mark_all_notifications_read() from public, anon, authenticated;
revoke all on function public.record_my_export_completed(text) from public, anon, authenticated;
revoke all on function public.sync_my_time_capsule_notifications(integer) from public, anon, authenticated;
revoke all on function public.sync_due_time_capsule_notifications(integer) from public, anon, authenticated;
revoke all on function public.claim_notification_email_outbox(integer) from public, anon, authenticated;
revoke all on function public.finish_notification_email_outbox(uuid, boolean, text) from public, anon, authenticated;

grant execute on function public.set_notification_preference(text, text) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.record_my_export_completed(text) to authenticated;
grant execute on function public.sync_my_time_capsule_notifications(integer) to authenticated;
grant execute on function public.sync_due_time_capsule_notifications(integer) to service_role;
grant execute on function public.claim_notification_email_outbox(integer) to service_role;
grant execute on function public.finish_notification_email_outbox(uuid, boolean, text) to service_role;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

comment on table public.notifications is
  'Private in-app deliveries. Payloads contain safe summaries only, never story bodies, coordinates, emails, or auth tokens.';
comment on table public.notification_preferences is
  'Per-user delivery mode. Security notifications cannot be fully disabled.';
comment on table public.notification_email_outbox is
  'Server-only email queue. A pending row means queued, not delivered.';
comment on function public.sync_due_time_capsule_notifications(integer) is
  'Service-role hook for a future scheduler; no scheduler is installed by this migration.';

notify pgrst, 'reload schema';
