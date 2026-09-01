-- Story-and-Place v1.4 Phase 4: governance, moderation and account restriction.
-- This migration is additive. It never exposes private story bodies to admins.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.map_entries') is null
    or to_regclass('public.story_routes') is null
    or to_regclass('public.reports') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null
    or to_regprocedure('public.can_view_story_route(uuid)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'governance requires all migrations through v1.4 story media';
  end if;
end;
$$;

create table if not exists public.app_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'admin',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint app_admins_role_values check (role in ('admin'))
);

create table if not exists public.account_moderation (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'active',
  reason text not null default '',
  restricted_at timestamptz,
  restricted_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint account_moderation_status_values check (status in ('active', 'restricted')),
  constraint account_moderation_reason_length check (char_length(reason) <= 500),
  constraint account_moderation_restricted_state check (
    (status = 'active' and restricted_at is null and restricted_by is null)
    or (status = 'restricted' and restricted_at is not null and restricted_by is not null)
  )
);

create table if not exists public.moderation_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid not null,
  report_id uuid references public.reports(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint moderation_audit_action_length check (char_length(action) between 1 and 80),
  constraint moderation_audit_target_values check (
    target_type in ('entry', 'route', 'user', 'report')
  ),
  constraint moderation_audit_metadata_object check (jsonb_typeof(metadata) = 'object')
);

alter table public.map_entries
  add column if not exists moderation_status text not null default 'active',
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null,
  add column if not exists moderation_reason text not null default '';

alter table public.story_routes
  add column if not exists moderation_status text not null default 'active',
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null,
  add column if not exists moderation_reason text not null default '';

alter table public.map_entries
  drop constraint if exists map_entries_moderation_status_values,
  add constraint map_entries_moderation_status_values
    check (moderation_status in ('active', 'restricted', 'removed')),
  drop constraint if exists map_entries_moderation_reason_length,
  add constraint map_entries_moderation_reason_length
    check (char_length(moderation_reason) <= 500),
  drop constraint if exists map_entries_moderation_state_consistent,
  add constraint map_entries_moderation_state_consistent check (
    (moderation_status = 'active' and moderated_at is null and moderated_by is null)
    or (moderation_status <> 'active' and moderated_at is not null and moderated_by is not null)
  );

alter table public.story_routes
  drop constraint if exists story_routes_moderation_status_values,
  add constraint story_routes_moderation_status_values
    check (moderation_status in ('active', 'restricted', 'removed')),
  drop constraint if exists story_routes_moderation_reason_length,
  add constraint story_routes_moderation_reason_length
    check (char_length(moderation_reason) <= 500),
  drop constraint if exists story_routes_moderation_state_consistent,
  add constraint story_routes_moderation_state_consistent check (
    (moderation_status = 'active' and moderated_at is null and moderated_by is null)
    or (moderation_status <> 'active' and moderated_at is not null and moderated_by is not null)
  );

alter table public.reports
  drop constraint if exists reports_target_type_values,
  add constraint reports_target_type_values
    check (target_type in ('entry', 'comment', 'user', 'group', 'route')),
  drop constraint if exists reports_reason_values,
  add constraint reports_reason_values check (
    reason in (
      'spam', 'harassment', 'hate', 'privacy', 'misinformation',
      'copyright', 'inappropriate', 'other'
    )
  );

create index if not exists account_moderation_restricted_idx
  on public.account_moderation(updated_at desc, user_id)
  where status = 'restricted';
create index if not exists moderation_audit_logs_created_idx
  on public.moderation_audit_logs(created_at desc, id desc);
create index if not exists reports_open_queue_idx
  on public.reports(created_at desc, id desc)
  where status in ('pending', 'reviewing');
create index if not exists map_entries_moderation_idx
  on public.map_entries(moderation_status, updated_at desc, id desc)
  where moderation_status <> 'active';
create index if not exists story_routes_moderation_idx
  on public.story_routes(moderation_status, updated_at desc, id desc)
  where moderation_status <> 'active';

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.app_admins administrator
    where administrator.user_id = (select auth.uid())
      and administrator.role = 'admin'
  );
$$;

create or replace function public.is_account_restricted(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select moderation.status = 'restricted'
    from public.account_moderation moderation
    where moderation.user_id = p_user_id
  ), false);
$$;

create or replace function private.assert_app_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare actor uuid := (select auth.uid());
begin
  if actor is null or not public.is_app_admin() then
    raise exception using errcode = '42501', message = 'application administrator required';
  end if;
  return actor;
end;
$$;

alter table public.app_admins enable row level security;
alter table public.account_moderation enable row level security;
alter table public.moderation_audit_logs enable row level security;

drop policy if exists app_admins_admin_read on public.app_admins;
create policy app_admins_admin_read
on public.app_admins for select to authenticated
using (public.is_app_admin());

drop policy if exists account_moderation_admin_read on public.account_moderation;
create policy account_moderation_admin_read
on public.account_moderation for select to authenticated
using (public.is_app_admin());

drop policy if exists moderation_audit_admin_read on public.moderation_audit_logs;
create policy moderation_audit_admin_read
on public.moderation_audit_logs for select to authenticated
using (public.is_app_admin());

-- Restricted profiles disappear from public discovery. The owner may still
-- open settings and an administrator may see public profile fields only.
drop policy if exists profiles_are_publicly_readable on public.profiles;
create policy profiles_are_publicly_readable
on public.profiles for select to anon, authenticated
using (
  not public.is_account_restricted(id)
  or id = (select auth.uid())
  or public.is_app_admin()
);

create or replace function public.can_read_entry(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.map_entries entry
    where entry.id = p_entry_id
      and (
        (
          entry.user_id = (select auth.uid())
          and (
            entry.visibility <> 'group'
            or public.is_active_group_member(entry.group_id)
          )
        )
        or (
          entry.moderation_status = 'active'
          and not public.is_account_restricted(entry.user_id)
          and (entry.unlock_at is null or entry.unlock_at <= now())
          and (
            entry.visibility = 'public'
            or (
              entry.visibility = 'private'
              and exists (
                select 1 from public.entry_participants participant
                where participant.entry_id = entry.id
                  and participant.user_id = (select auth.uid())
                  and participant.status = 'accepted'
              )
            )
            or (
              entry.visibility = 'group'
              and public.is_active_group_member(entry.group_id)
            )
          )
        )
        or (
          public.is_app_admin()
          and entry.visibility = 'public'
          and (entry.unlock_at is null or entry.unlock_at <= now())
        )
      )
  );
$$;

create or replace function public.can_collaborate_entry(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and not public.is_account_restricted((select auth.uid()))
    and exists (
      select 1 from public.map_entries entry
      where entry.id = p_entry_id
        and entry.moderation_status = 'active'
        and not public.is_account_restricted(entry.user_id)
        and (entry.visibility <> 'group' or public.is_active_group_member(entry.group_id))
        and (
          entry.user_id = (select auth.uid())
          or (
            (entry.unlock_at is null or entry.unlock_at <= now())
            and exists (
              select 1 from public.entry_participants participant
              where participant.entry_id = entry.id
                and participant.user_id = (select auth.uid())
                and participant.status = 'accepted'
            )
          )
        )
    );
$$;

create or replace function public.can_edit_entry_field(p_entry_id uuid, p_field text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and not public.is_account_restricted((select auth.uid()))
    and exists (
      select 1 from public.map_entries entry
      where entry.id = p_entry_id
        and entry.moderation_status = 'active'
        and not public.is_account_restricted(entry.user_id)
        and (entry.visibility <> 'group' or public.is_active_group_member(entry.group_id))
        and (
          entry.user_id = (select auth.uid())
          or (
            (entry.unlock_at is null or entry.unlock_at <= now())
            and exists (
              select 1 from public.entry_participants participant
              where participant.entry_id = entry.id
                and participant.user_id = (select auth.uid())
                and participant.status = 'accepted'
                and p_field = any(participant.editable_fields)
            )
          )
        )
    );
$$;

create or replace function public.can_interact_entry(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and not public.is_account_restricted((select auth.uid()))
    and exists (
      select 1 from public.map_entries entry
      where entry.id = p_entry_id
        and entry.moderation_status = 'active'
        and not public.is_account_restricted(entry.user_id)
        and (entry.unlock_at is null or entry.unlock_at <= now())
        and entry.visibility in ('public', 'group')
        and public.can_read_entry(entry.id)
    );
$$;

create or replace function public.can_read_entry_edit_log(
  p_entry_id uuid,
  p_created_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and public.can_read_entry(p_entry_id)
    and exists (
      select 1 from public.map_entries entry
      where entry.id = p_entry_id
        and (
          entry.user_id = (select auth.uid())
          or (
            entry.moderation_status = 'active'
            and not public.is_account_restricted(entry.user_id)
            and exists (
              select 1 from public.entry_participants participant
              where participant.entry_id = entry.id
                and participant.user_id = (select auth.uid())
                and participant.status = 'accepted'
                and participant.responded_at <= p_created_at
            )
          )
        )
    );
$$;

create or replace function public.can_view_story_route(p_route_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.story_routes route
    where route.id = p_route_id
      and (
        route.created_by = (select auth.uid())
        or (
          route.moderation_status = 'active'
          and not public.is_account_restricted(route.created_by)
          and route.published_at is not null
          and route.archived_at is null
          and (
            route.visibility = 'public'
            or (
              route.visibility = 'group'
              and public.is_active_group_member(route.group_id)
            )
          )
        )
        or (
          public.is_app_admin()
          and route.visibility = 'public'
          and route.published_at is not null
        )
      )
  );
$$;

create or replace function public.can_report_target(p_target_type text, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and not public.is_account_restricted((select auth.uid()))
    and case p_target_type
      when 'entry' then exists (
        select 1 from public.map_entries entry
        where entry.id = p_target_id
          and entry.visibility = 'public'
          and entry.moderation_status = 'active'
          and (entry.unlock_at is null or entry.unlock_at <= now())
          and public.can_read_entry(entry.id)
      )
      when 'comment' then exists (
        select 1 from public.entry_comments comment
        join public.map_entries entry on entry.id = comment.entry_id
        where comment.id = p_target_id
          and comment.deleted_at is null
          and entry.visibility in ('public', 'group')
          and public.can_read_entry(entry.id)
      )
      when 'user' then exists (
        select 1 from public.profiles profile
        where profile.id = p_target_id
          and profile.id <> (select auth.uid())
          and profile.deleted_at is null
          and not public.is_account_restricted(profile.id)
      )
      when 'group' then exists (
        select 1 from public.groups target_group
        where target_group.id = p_target_id
          and target_group.archived_at is null
          and (
            target_group.visibility = 'public'
            or public.is_active_group_member(target_group.id)
          )
      )
      when 'route' then exists (
        select 1 from public.story_routes route
        where route.id = p_target_id
          and route.visibility = 'public'
          and route.moderation_status = 'active'
          and route.published_at is not null
          and route.archived_at is null
          and public.can_view_story_route(route.id)
      )
      else false
    end;
$$;

-- Restriction is enforced at the database boundary for the main user-created
-- resources. Service-role maintenance has no auth.uid() and remains available.
create or replace function private.enforce_unrestricted_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := (select auth.uid());
begin
  if actor is not null and public.is_account_restricted(actor) then
    raise exception using errcode = '42501', message = 'account is restricted';
  end if;
  return null;
end;
$$;

do $$
declare relation_name text;
begin
  foreach relation_name in array array[
    'profiles', 'map_entries', 'story_routes', 'story_route_items',
    'groups', 'group_members', 'group_invitations', 'follows',
    'entry_likes', 'entry_comments', 'reports', 'entry_participants',
    'tags', 'entry_tags', 'entry_drafts'
  ] loop
    if to_regclass('public.' || relation_name) is not null then
      execute format('drop trigger if exists %I on public.%I',
        relation_name || '_reject_restricted_actor', relation_name);
      execute format(
        'create trigger %I before insert or update or delete on public.%I for each statement execute function private.enforce_unrestricted_actor()',
        relation_name || '_reject_restricted_actor', relation_name
      );
    end if;
  end loop;
end;
$$;

-- Media reservation is a service-role RPC, so it must validate the supplied
-- owner explicitly instead of relying on auth.uid().
create or replace function public.reserve_entry_media_asset(
  p_user_id uuid,
  p_entry_id uuid,
  p_source_mime_type text,
  p_size_bytes bigint,
  p_thumbnail_size_bytes bigint,
  p_width integer,
  p_height integer
)
returns public.entry_media_assets
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := p_user_id;
  asset_id uuid := gen_random_uuid();
  current_bytes bigint;
  reserved public.entry_media_assets%rowtype;
begin
  if actor is null or public.is_account_restricted(actor) then
    raise exception using errcode = '42501', message = 'media owner unavailable';
  end if;
  if p_source_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_size_bytes not between 1 and 6291456
    or p_thumbnail_size_bytes not between 1 and 2097152
    or p_width not between 1 and 20000
    or p_height not between 1 and 20000
  then
    raise exception using errcode = '22023', message = 'invalid media metadata';
  end if;
  if not exists (
    select 1 from public.map_entries entry
    where entry.id = p_entry_id
      and entry.user_id = actor
      and entry.moderation_status = 'active'
      and (
        entry.visibility <> 'group'
        or exists (
          select 1 from public.group_members membership
          where membership.group_id = entry.group_id
            and membership.user_id = actor
            and membership.status = 'active'
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'entry media owner required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text, 8142301));
  select coalesce(sum(asset.size_bytes + asset.thumbnail_size_bytes), 0)::bigint
  into current_bytes
  from public.entry_media_assets asset
  where asset.user_id = actor and asset.status in ('pending', 'ready');
  if (
    select count(*) from public.entry_media_assets asset
    where asset.entry_id = p_entry_id and asset.status in ('pending', 'ready')
  ) >= 10 then
    raise exception using errcode = '23514', message = 'entry media limit reached';
  end if;
  if current_bytes + p_size_bytes + p_thumbnail_size_bytes > private.story_media_quota_bytes() then
    raise exception using errcode = '23514', message = 'story media quota reached';
  end if;
  insert into public.entry_media_assets (
    id, entry_id, user_id, storage_path, thumbnail_path, source_mime_type,
    width, height, size_bytes, thumbnail_size_bytes
  ) values (
    asset_id, p_entry_id, actor,
    actor::text || '/' || p_entry_id::text || '/' || asset_id::text || '.webp',
    actor::text || '/' || p_entry_id::text || '/' || asset_id::text || '-thumb.webp',
    p_source_mime_type, p_width, p_height, p_size_bytes, p_thumbnail_size_bytes
  ) returning * into reserved;
  return reserved;
end;
$$;

create or replace function public.maintain_map_entry_featured_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visibility <> 'public'
    or new.moderation_status <> 'active'
    or (new.unlock_at is not null and new.unlock_at > now())
  then
    new.featured_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists map_entries_maintain_featured_state on public.map_entries;
create trigger map_entries_maintain_featured_state
before insert or update of visibility, unlock_at, featured_at, moderation_status
on public.map_entries
for each row execute function public.maintain_map_entry_featured_state();

revoke insert (moderation_status, moderated_at, moderated_by, moderation_reason)
on public.map_entries from authenticated;
revoke update (moderation_status, moderated_at, moderated_by, moderation_reason)
on public.map_entries from authenticated;
revoke insert (moderation_status, moderated_at, moderated_by, moderation_reason)
on public.story_routes from authenticated;
revoke update (moderation_status, moderated_at, moderated_by, moderation_reason)
on public.story_routes from authenticated;

revoke all on table public.app_admins from public, anon, authenticated;
revoke all on table public.account_moderation from public, anon, authenticated;
revoke all on table public.moderation_audit_logs from public, anon, authenticated;
grant select on public.app_admins to authenticated;
grant select on public.account_moderation to authenticated;
grant select on public.moderation_audit_logs to authenticated;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to anon, authenticated;
revoke all on function public.is_account_restricted(uuid) from public;
grant execute on function public.is_account_restricted(uuid) to anon, authenticated;
revoke all on function private.assert_app_admin() from public, anon, authenticated;
revoke all on function private.enforce_unrestricted_actor() from public, anon, authenticated;
revoke all on function public.can_read_entry(uuid) from public;
revoke all on function public.can_collaborate_entry(uuid) from public;
revoke all on function public.can_edit_entry_field(uuid, text) from public;
revoke all on function public.can_interact_entry(uuid) from public;
revoke all on function public.can_read_entry_edit_log(uuid, timestamptz) from public;
revoke all on function public.can_view_story_route(uuid) from public;
revoke all on function public.can_report_target(text, uuid) from public, anon;
grant execute on function public.can_read_entry(uuid) to anon, authenticated;
grant execute on function public.can_collaborate_entry(uuid) to authenticated;
grant execute on function public.can_edit_entry_field(uuid, text) to authenticated;
grant execute on function public.can_interact_entry(uuid) to authenticated;
grant execute on function public.can_read_entry_edit_log(uuid, timestamptz) to authenticated;
grant execute on function public.can_view_story_route(uuid) to anon, authenticated;
grant execute on function public.can_report_target(text, uuid) to authenticated;
revoke all on function public.maintain_map_entry_featured_state()
from public, anon, authenticated;
revoke all on function public.reserve_entry_media_asset(uuid, uuid, text, bigint, bigint, integer, integer)
from public, anon, authenticated;
grant execute on function public.reserve_entry_media_asset(uuid, uuid, text, bigint, bigint, integer, integer)
to service_role;

create or replace function public.admin_get_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.assert_app_admin();
  select jsonb_build_object(
    'total_users', (select count(*) from public.profiles where deleted_at is null),
    'recent_users_7d', (select count(*) from public.profiles where deleted_at is null and created_at >= now() - interval '7 days'),
    'active_users_30d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '30 days'),
    'restricted_users', (select count(*) from public.account_moderation where status = 'restricted'),
    'total_entries', (select count(*) from public.map_entries),
    'public_entries', (select count(*) from public.map_entries where visibility = 'public'),
    'private_entries', (select count(*) from public.map_entries where visibility = 'private'),
    'group_entries', (select count(*) from public.map_entries where visibility = 'group'),
    'moderated_entries', (select count(*) from public.map_entries where moderation_status <> 'active'),
    'story_routes', (select count(*) from public.story_routes),
    'groups', (select count(*) from public.groups),
    'pending_reports', (select count(*) from public.reports where status in ('pending', 'reviewing'))
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_list_users(
  p_query text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.assert_app_admin();
  with matched as (
    select
      profile.id,
      profile.username,
      profile.display_name,
      profile.avatar_url,
      profile.created_at,
      auth_user.last_sign_in_at,
      coalesce(moderation.status, 'active') as account_status,
      exists (select 1 from public.app_admins administrator where administrator.user_id = profile.id) as is_admin,
      (select count(*) from public.map_entries entry where entry.user_id = profile.id) as story_count,
      (select count(*) from public.story_routes route where route.created_by = profile.id) as route_count,
      (select count(*) from public.reports report where report.target_type = 'user' and report.target_id = profile.id) as report_count
    from public.profiles profile
    left join auth.users auth_user on auth_user.id = profile.id
    left join public.account_moderation moderation on moderation.user_id = profile.id
    where profile.deleted_at is null
      and (
        nullif(btrim(coalesce(p_query, '')), '') is null
        or profile.display_name ilike '%' || btrim(p_query) || '%'
        or profile.username ilike '%' || btrim(p_query) || '%'
      )
    order by profile.created_at desc, profile.id desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 25), 1), 50) + 1
  ), numbered as (
    select *, row_number() over () as row_number from matched
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(to_jsonb(numbered) - 'row_number') filter (
      where numbered.row_number <= least(greatest(coalesce(p_limit, 25), 1), 50)
    ), '[]'::jsonb),
    'has_more', coalesce(max(numbered.row_number), 0) > least(greatest(coalesce(p_limit, 25), 1), 50)
  ) into result
  from numbered;
  return coalesce(result, jsonb_build_object('items', '[]'::jsonb, 'has_more', false));
end;
$$;

create or replace function public.admin_list_reports(
  p_status text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.assert_app_admin();
  if p_status is not null and p_status not in ('pending', 'reviewing', 'resolved', 'dismissed') then
    raise exception using errcode = '22023', message = 'invalid report status';
  end if;
  with matched as (
    select
      report.id,
      report.target_type,
      report.target_id,
      report.reason,
      report.description,
      report.status,
      report.created_at,
      report.reviewed_at,
      report.review_notes,
      reporter.display_name as reporter_name,
      case report.target_type
        when 'entry' then coalesce((
          select case when entry.visibility = 'public' then entry.title else '受保护故事' end
          from public.map_entries entry where entry.id = report.target_id
        ), '已删除的故事')
        when 'route' then coalesce((
          select case when route.visibility = 'public' then route.title else '受保护路线' end
          from public.story_routes route where route.id = report.target_id
        ), '已删除的路线')
        when 'user' then coalesce((select profile.display_name from public.profiles profile where profile.id = report.target_id), '已删除的用户')
        when 'group' then coalesce((select case when target_group.visibility = 'public' then target_group.name else '私密群组' end from public.groups target_group where target_group.id = report.target_id), '已归档的群组')
        when 'comment' then '评论（正文不在审核列表展示）'
        else '未知对象'
      end as target_label,
      case report.target_type
        when 'entry' then '/entries/' || report.target_id::text
        when 'route' then coalesce((select '/routes/' || route.share_slug from public.story_routes route where route.id = report.target_id and route.visibility = 'public'), '')
        when 'user' then '/users/' || report.target_id::text
        else ''
      end as target_href
    from public.reports report
    left join public.profiles reporter on reporter.id = report.reporter_id
    where p_status is null or report.status = p_status
    order by report.created_at desc, report.id desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 25), 1), 50) + 1
  ), numbered as (
    select *, row_number() over () as row_number from matched
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(to_jsonb(numbered) - 'row_number') filter (
      where numbered.row_number <= least(greatest(coalesce(p_limit, 25), 1), 50)
    ), '[]'::jsonb),
    'has_more', coalesce(max(numbered.row_number), 0) > least(greatest(coalesce(p_limit, 25), 1), 50)
  ) into result
  from numbered;
  return coalesce(result, jsonb_build_object('items', '[]'::jsonb, 'has_more', false));
end;
$$;

create or replace function public.admin_list_public_content(
  p_kind text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.assert_app_admin();
  if p_kind is not null and p_kind not in ('entry', 'route') then
    raise exception using errcode = '22023', message = 'invalid content kind';
  end if;
  with all_content as (
    select
      'entry'::text as kind,
      entry.id,
      entry.title,
      author.display_name as author_name,
      entry.moderation_status,
      entry.featured_at is not null as featured,
      entry.created_at,
      '/entries/' || entry.id::text as href
    from public.map_entries entry
    left join public.profiles author on author.id = entry.user_id
    where entry.visibility = 'public'
      and (entry.unlock_at is null or entry.unlock_at <= now())
    union all
    select
      'route'::text,
      route.id,
      route.title,
      author.display_name,
      route.moderation_status,
      route.featured_at is not null,
      route.created_at,
      '/routes/' || route.share_slug
    from public.story_routes route
    left join public.profiles author on author.id = route.created_by
    where route.visibility = 'public' and route.published_at is not null
  ), matched as (
    select * from all_content
    where p_kind is null or kind = p_kind
    order by created_at desc, id desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 25), 1), 50) + 1
  ), numbered as (
    select *, row_number() over () as row_number from matched
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(to_jsonb(numbered) - 'row_number') filter (
      where numbered.row_number <= least(greatest(coalesce(p_limit, 25), 1), 50)
    ), '[]'::jsonb),
    'has_more', coalesce(max(numbered.row_number), 0) > least(greatest(coalesce(p_limit, 25), 1), 50)
  ) into result
  from numbered;
  return coalesce(result, jsonb_build_object('items', '[]'::jsonb, 'has_more', false));
end;
$$;

create or replace function public.admin_list_audit_logs(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.assert_app_admin();
  select coalesce(jsonb_agg(to_jsonb(log_row)), '[]'::jsonb)
  into result
  from (
    select log.id, log.action, log.target_type, log.target_id,
      log.report_id, log.metadata, log.created_at,
      administrator.display_name as admin_name
    from public.moderation_audit_logs log
    left join public.profiles administrator on administrator.id = log.admin_user_id
    order by log.created_at desc, log.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) log_row;
  return result;
end;
$$;

create or replace function public.admin_set_account_restriction(
  p_user_id uuid,
  p_restricted boolean,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := private.assert_app_admin();
begin
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id and deleted_at is null) then
    raise exception using errcode = 'P0002', message = 'account not found';
  end if;
  if p_user_id = actor or exists (select 1 from public.app_admins where user_id = p_user_id) then
    raise exception using errcode = '42501', message = 'administrator accounts cannot be restricted here';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) > 500 then
    raise exception using errcode = '22023', message = 'moderation reason is too long';
  end if;
  insert into public.account_moderation (
    user_id, status, reason, restricted_at, restricted_by, updated_at
  ) values (
    p_user_id,
    case when p_restricted then 'restricted' else 'active' end,
    case when p_restricted then btrim(coalesce(p_reason, '')) else '' end,
    case when p_restricted then now() else null end,
    case when p_restricted then actor else null end,
    now()
  ) on conflict (user_id) do update set
    status = excluded.status,
    reason = excluded.reason,
    restricted_at = excluded.restricted_at,
    restricted_by = excluded.restricted_by,
    updated_at = now();
  insert into public.moderation_audit_logs (admin_user_id, action, target_type, target_id, metadata)
  values (
    actor,
    case when p_restricted then 'account.restricted' else 'account.restored' end,
    'user', p_user_id,
    jsonb_build_object('reason', left(btrim(coalesce(p_reason, '')), 500))
  );
  perform private.enqueue_user_notification(
    p_user_id, 'security_alert', 'security', null, 'profile', p_user_id,
    jsonb_build_object(
      'message', case when p_restricted then '你的账号已被限制，请联系维护者了解详情。' else '你的账号限制已解除。' end,
      'target_path', '/settings'
    ),
    'account-moderation:' || p_user_id::text || ':' || case when p_restricted then 'restricted' else 'restored' end || ':' || extract(epoch from now())::bigint::text
  );
end;
$$;

create or replace function public.admin_moderate_entry(
  p_entry_id uuid,
  p_status text,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.assert_app_admin();
  owner_id uuid;
  entry_title text;
begin
  if p_status not in ('active', 'restricted', 'removed') or char_length(btrim(coalesce(p_reason, ''))) > 500 then
    raise exception using errcode = '22023', message = 'invalid moderation state';
  end if;
  select entry.user_id, entry.title into owner_id, entry_title
  from public.map_entries entry
  where entry.id = p_entry_id and entry.visibility = 'public'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'public entry not found';
  end if;
  update public.map_entries set
    moderation_status = p_status,
    moderation_reason = case when p_status = 'active' then '' else btrim(coalesce(p_reason, '')) end,
    moderated_at = case when p_status = 'active' then null else now() end,
    moderated_by = case when p_status = 'active' then null else actor end,
    featured_at = case when p_status = 'active' then featured_at else null end
  where id = p_entry_id;
  insert into public.moderation_audit_logs (admin_user_id, action, target_type, target_id, metadata)
  values (actor, 'entry.' || p_status, 'entry', p_entry_id,
    jsonb_build_object('reason', left(btrim(coalesce(p_reason, '')), 500)));
  perform private.enqueue_user_notification(
    owner_id, case when p_status = 'active' then 'security_alert' else 'story_restricted' end,
    'security', null, 'entry', p_entry_id,
    jsonb_build_object(
      'entry_title', entry_title,
      'message', case when p_status = 'active' then '你的故事已恢复展示。' else '你的公开故事已被限制展示。' end,
      'target_path', '/entries/' || p_entry_id::text
    ),
    'entry-moderation:' || p_entry_id::text || ':' || p_status || ':' || extract(epoch from now())::bigint::text
  );
end;
$$;

create or replace function public.admin_moderate_story_route(
  p_route_id uuid,
  p_status text,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.assert_app_admin();
  owner_id uuid;
  route_title text;
  route_slug text;
begin
  if p_status not in ('active', 'restricted', 'removed') or char_length(btrim(coalesce(p_reason, ''))) > 500 then
    raise exception using errcode = '22023', message = 'invalid moderation state';
  end if;
  select route.created_by, route.title, route.share_slug into owner_id, route_title, route_slug
  from public.story_routes route
  where route.id = p_route_id and route.visibility = 'public' and route.published_at is not null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'public route not found';
  end if;
  update public.story_routes set
    moderation_status = p_status,
    moderation_reason = case when p_status = 'active' then '' else btrim(coalesce(p_reason, '')) end,
    moderated_at = case when p_status = 'active' then null else now() end,
    moderated_by = case when p_status = 'active' then null else actor end,
    featured_at = case when p_status = 'active' then featured_at else null end,
    featured_by = case when p_status = 'active' then featured_by else null end
  where id = p_route_id;
  insert into public.moderation_audit_logs (admin_user_id, action, target_type, target_id, metadata)
  values (actor, 'route.' || p_status, 'route', p_route_id,
    jsonb_build_object('reason', left(btrim(coalesce(p_reason, '')), 500)));
  perform private.enqueue_user_notification(
    owner_id, case when p_status = 'active' then 'security_alert' else 'story_restricted' end,
    'security', null, 'story_route', p_route_id,
    jsonb_build_object(
      'route_title', route_title,
      'message', case when p_status = 'active' then '你的故事路线已恢复展示。' else '你的公开故事路线已被限制展示。' end,
      'target_path', '/routes/' || route_slug
    ),
    'route-moderation:' || p_route_id::text || ':' || p_status || ':' || extract(epoch from now())::bigint::text
  );
end;
$$;

create or replace function public.admin_set_entry_featured(p_entry_id uuid, p_featured boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.assert_app_admin();
  owner_id uuid;
  entry_title text;
begin
  select entry.user_id, entry.title into owner_id, entry_title
  from public.map_entries entry
  where entry.id = p_entry_id
    and entry.visibility = 'public'
    and entry.moderation_status = 'active'
    and not public.is_account_restricted(entry.user_id)
    and (entry.unlock_at is null or entry.unlock_at <= now());
  if not found then
    raise exception using errcode = 'P0002', message = 'eligible public entry not found';
  end if;
  update public.map_entries set featured_at = case when p_featured then now() else null end
  where id = p_entry_id;
  insert into public.moderation_audit_logs (admin_user_id, action, target_type, target_id, metadata)
  values (actor, case when p_featured then 'entry.featured' else 'entry.unfeatured' end,
    'entry', p_entry_id, '{}'::jsonb);
  if p_featured then
    perform private.enqueue_user_notification(
      owner_id, 'story_featured', 'product_updates', null, 'entry', p_entry_id,
      jsonb_build_object('entry_title', entry_title, 'target_path', '/entries/' || p_entry_id::text),
      'entry-featured:' || p_entry_id::text || ':' || extract(epoch from now())::bigint::text
    );
  end if;
end;
$$;

create or replace function public.admin_review_report(
  p_report_id uuid,
  p_status text,
  p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.assert_app_admin();
  report_target_type text;
  report_target_id uuid;
begin
  if p_status not in ('reviewing', 'resolved', 'dismissed')
    or char_length(btrim(coalesce(p_notes, ''))) > 2000
  then
    raise exception using errcode = '22023', message = 'invalid report review';
  end if;
  update public.reports set
    status = p_status,
    reviewed_at = case when p_status in ('resolved', 'dismissed') then now() else reviewed_at end,
    reviewed_by = actor,
    review_notes = btrim(coalesce(p_notes, ''))
  where id = p_report_id
  returning target_type, target_id into report_target_type, report_target_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'report not found';
  end if;
  insert into public.moderation_audit_logs (
    admin_user_id, action, target_type, target_id, report_id, metadata
  ) values (
    actor, 'report.' || p_status, 'report', p_report_id, p_report_id,
    jsonb_build_object(
      'reported_target_type', report_target_type,
      'reported_target_id', report_target_id,
      'notes', left(btrim(coalesce(p_notes, '')), 2000)
    )
  );
end;
$$;

revoke all on function public.admin_get_dashboard() from public, anon;
revoke all on function public.admin_list_users(text, integer, integer) from public, anon;
revoke all on function public.admin_list_reports(text, integer, integer) from public, anon;
revoke all on function public.admin_list_public_content(text, integer, integer) from public, anon;
revoke all on function public.admin_list_audit_logs(integer) from public, anon;
revoke all on function public.admin_set_account_restriction(uuid, boolean, text) from public, anon;
revoke all on function public.admin_moderate_entry(uuid, text, text) from public, anon;
revoke all on function public.admin_moderate_story_route(uuid, text, text) from public, anon;
revoke all on function public.admin_set_entry_featured(uuid, boolean) from public, anon;
revoke all on function public.admin_review_report(uuid, text, text) from public, anon;

grant execute on function public.admin_get_dashboard() to authenticated;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;
grant execute on function public.admin_list_reports(text, integer, integer) to authenticated;
grant execute on function public.admin_list_public_content(text, integer, integer) to authenticated;
grant execute on function public.admin_list_audit_logs(integer) to authenticated;
grant execute on function public.admin_set_account_restriction(uuid, boolean, text) to authenticated;
grant execute on function public.admin_moderate_entry(uuid, text, text) to authenticated;
grant execute on function public.admin_moderate_story_route(uuid, text, text) to authenticated;
grant execute on function public.admin_set_entry_featured(uuid, boolean) to authenticated;
grant execute on function public.admin_review_report(uuid, text, text) to authenticated;

comment on table public.app_admins is
  'Explicit application administrators. Bootstrap entries only from trusted SQL or service operations.';
comment on table public.account_moderation is
  'Private account restriction state; never place moderation fields on public profiles.';
comment on table public.moderation_audit_logs is
  'Append-only audit metadata. It intentionally excludes private story bodies and authentication secrets.';

notify pgrst, 'reload schema';
