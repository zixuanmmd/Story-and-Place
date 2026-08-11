-- Story-and-Place v1.3: user data export and account-deletion lifecycle.
--
-- Application data is processed only after a fresh account-deletion request.
-- The finalizer is intentionally executable by service_role only; the browser
-- can never select another user or invoke destructive cleanup directly.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.map_entries') is null
    or to_regclass('public.story_routes') is null
    or to_regclass('public.entry_participants') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'v1.3 data portability requires all migrations through 202608080002';
  end if;
end;
$$;

alter table public.profiles
  add column if not exists deleted_at timestamptz;

alter table public.reports
  alter column reporter_id drop not null;

alter table public.reports
  drop constraint if exists reports_reporter_id_fkey;

alter table public.reports
  add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references public.profiles(id) on delete set null;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  deletion_mode text not null,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  failure_code text,
  constraint account_deletion_requests_mode_values
    check (deletion_mode in ('delete_all', 'preserve_public')),
  constraint account_deletion_requests_status_values
    check (status in ('pending', 'processing', 'completed', 'failed')),
  constraint account_deletion_requests_failure_length
    check (failure_code is null or char_length(failure_code) <= 80)
);

create unique index if not exists account_deletion_requests_active_user_idx
  on public.account_deletion_requests(user_id)
  where status in ('pending', 'processing');

create index if not exists account_deletion_requests_status_requested_idx
  on public.account_deletion_requests(status, requested_at);

alter table public.account_deletion_requests enable row level security;

create policy "account_deletion_requests_owner_select"
on public.account_deletion_requests for select to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.account_deletion_requests
from public, anon, authenticated;
grant select on table public.account_deletion_requests to authenticated;
grant select, insert, update on table public.account_deletion_requests to service_role;

create or replace function public.get_account_deletion_impact()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then
      pg_catalog.jsonb_build_object('authenticated', false)
    else pg_catalog.jsonb_build_object(
      'authenticated', true,
      'public_entries', (
        select count(*) from public.map_entries entry
        where entry.user_id = (select auth.uid()) and entry.visibility = 'public'
      ),
      'private_entries', (
        select count(*) from public.map_entries entry
        where entry.user_id = (select auth.uid()) and entry.visibility = 'private'
      ),
      'group_entries', (
        select count(*) from public.map_entries entry
        where entry.user_id = (select auth.uid()) and entry.visibility = 'group'
      ),
      'public_routes', (
        select count(*) from public.story_routes route
        where route.created_by = (select auth.uid()) and route.visibility = 'public'
      ),
      'other_routes', (
        select count(*) from public.story_routes route
        where route.created_by = (select auth.uid()) and route.visibility <> 'public'
      ),
      'collaborations', (
        select count(*) from public.entry_participants participant
        where participant.user_id = (select auth.uid())
      ),
      'blocking_groups', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', membership.group_id,
            'slug', target.slug,
            'name', target.name,
            'role', membership.role
          ) order by target.name, target.id
        )
        from public.group_members membership
        join public.groups target on target.id = membership.group_id
        where membership.user_id = (select auth.uid())
          and membership.status = 'active'
          and membership.role in ('owner', 'admin')
      ), '[]'::jsonb)
    )
  end;
$$;

create or replace function public.begin_account_deletion(p_deletion_mode text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  request_id uuid;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_deletion_mode not in ('delete_all', 'preserve_public') then
    raise exception using errcode = '22023', message = 'invalid deletion mode';
  end if;
  if exists (
    select 1
    from public.group_members membership
    where membership.user_id = actor
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
  ) then
    raise exception using errcode = '55000', message = 'group responsibilities must be resolved';
  end if;
  if exists (
    select 1 from public.profiles profile
    where profile.id = actor and profile.deleted_at is not null
  ) then
    raise exception using errcode = '55000', message = 'account deletion already completed';
  end if;

  select request.id into request_id
  from public.account_deletion_requests request
  where request.user_id = actor and request.status in ('pending', 'processing')
  for update;
  if request_id is not null then
    return request_id;
  end if;

  insert into public.account_deletion_requests (user_id, deletion_mode)
  values (actor, p_deletion_mode)
  returning id into request_id;
  return request_id;
end;
$$;

create or replace function public.finalize_account_deletion(
  p_request_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.account_deletion_requests%rowtype;
  short_id text;
begin
  if p_request_id is null or p_user_id is null then
    raise exception using errcode = '22023', message = 'request and user are required';
  end if;

  select * into request
  from public.account_deletion_requests target
  where target.id = p_request_id and target.user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'deletion request not found';
  end if;
  if request.status = 'completed' then
    return;
  end if;
  if request.status not in ('pending', 'processing', 'failed') then
    raise exception using errcode = '55000', message = 'deletion request is not actionable';
  end if;
  if exists (
    select 1 from public.group_members membership
    where membership.user_id = p_user_id
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
  ) then
    raise exception using errcode = '55000', message = 'group responsibilities must be resolved';
  end if;

  update public.account_deletion_requests
  set status = 'processing', processing_started_at = coalesce(processing_started_at, now()),
      failure_code = null
  where id = request.id;

  delete from public.entry_drafts where user_id = p_user_id;
  delete from public.user_experience_preferences where user_id = p_user_id;

  delete from public.story_routes route
  where route.created_by = p_user_id
    and (request.deletion_mode = 'delete_all' or route.visibility <> 'public');

  delete from public.map_entries entry
  where entry.user_id = p_user_id
    and (request.deletion_mode = 'delete_all' or entry.visibility <> 'public');

  if request.deletion_mode = 'preserve_public' then
    update public.map_entries
    set featured_at = null
    where user_id = p_user_id and visibility = 'public';
    update public.story_routes
    set featured_at = null, featured_by = null
    where created_by = p_user_id and visibility = 'public';
  end if;

  delete from public.entry_participants where user_id = p_user_id;
  update public.entry_participants set invited_by = null where invited_by = p_user_id;
  update public.entry_edit_logs set editor_id = null where editor_id = p_user_id;
  update public.tags set created_by = null where created_by = p_user_id;
  update public.entry_tags set added_by = null where added_by = p_user_id;

  delete from public.entry_likes where user_id = p_user_id;
  delete from public.follows
  where follower_id = p_user_id or following_id = p_user_id;
  update public.entry_comments
  set content = '', deleted_at = coalesce(deleted_at, now()), updated_at = now()
  where user_id = p_user_id;
  update public.reports set reporter_id = null where reporter_id = p_user_id;

  delete from public.group_invitations
  where inviter_id = p_user_id or invitee_id = p_user_id;
  delete from public.group_members where user_id = p_user_id;

  short_id := left(replace(p_user_id::text, '-', ''), 8);
  update public.profiles
  set
    username = 'deleted-' || replace(p_user_id::text, '-', ''),
    display_name = '已注销用户-' || short_id,
    avatar_url = null,
    bio = null,
    deleted_at = coalesce(deleted_at, now()),
    updated_at = now()
  where id = p_user_id;

  update public.account_deletion_requests
  set status = 'completed', completed_at = now(), failure_code = null
  where id = request.id;
end;
$$;

create or replace function public.export_my_story_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then
      null
    else pg_catalog.jsonb_build_object(
      'schema_version', 1,
      'exported_at', now(),
      'profile', (
        select pg_catalog.jsonb_build_object(
          'id', profile.id,
          'username', profile.username,
          'display_name', profile.display_name,
          'avatar_url', profile.avatar_url,
          'bio', profile.bio,
          'created_at', profile.created_at
        )
        from public.profiles profile
        where profile.id = (select auth.uid()) and profile.deleted_at is null
      ),
      'owned_entries', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'ownership', 'owner',
            'id', entry.id,
            'title', entry.title,
            'content', entry.content,
            'place_name', entry.place_name,
            'latitude', entry.latitude,
            'longitude', entry.longitude,
            'occurred_at', entry.occurred_at,
            'occurred_local', entry.occurred_local,
            'occurred_timezone', entry.occurred_timezone,
            'occurred_date', entry.occurred_date,
            'occurred_year', entry.occurred_year,
            'time_precision', entry.time_precision,
            'time_label', entry.time_label,
            'visibility', entry.visibility,
            'group_id', entry.group_id,
            'place_category_slug', entry.place_category_slug,
            'unlock_at', entry.unlock_at,
            'created_at', entry.created_at,
            'updated_at', entry.updated_at,
            'tags', coalesce((
              select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'name', tag.name, 'slug', tag.slug,
                  'type', tag.type, 'semantic_key', tag.semantic_key
                ) order by tag.name, tag.id
              )
              from public.entry_tags link
              join public.tags tag on tag.id = link.tag_id
              where link.entry_id = entry.id
            ), '[]'::jsonb)
          ) order by entry.created_at, entry.id
        )
        from public.map_entries entry
        where entry.user_id = (select auth.uid())
      ), '[]'::jsonb),
      'participant_entries', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'ownership', 'participant',
            'id', entry.id,
            'title', entry.title,
            'content', entry.content,
            'place_name', entry.place_name,
            'latitude', entry.latitude,
            'longitude', entry.longitude,
            'occurred_at', entry.occurred_at,
            'occurred_local', entry.occurred_local,
            'occurred_timezone', entry.occurred_timezone,
            'occurred_date', entry.occurred_date,
            'occurred_year', entry.occurred_year,
            'time_precision', entry.time_precision,
            'time_label', entry.time_label,
            'visibility', entry.visibility,
            'group_id', entry.group_id,
            'place_category_slug', entry.place_category_slug,
            'unlock_at', entry.unlock_at,
            'created_at', entry.created_at,
            'updated_at', entry.updated_at,
            'tags', coalesce((
              select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'name', tag.name, 'slug', tag.slug,
                  'type', tag.type, 'semantic_key', tag.semantic_key
                ) order by tag.name, tag.id
              )
              from public.entry_tags link
              join public.tags tag on tag.id = link.tag_id
              where link.entry_id = entry.id
            ), '[]'::jsonb)
          ) order by entry.created_at, entry.id
        )
        from public.entry_participants participant
        join public.map_entries entry on entry.id = participant.entry_id
        where participant.user_id = (select auth.uid())
          and participant.status = 'accepted'
          and entry.user_id <> (select auth.uid())
          and public.can_read_entry(entry.id)
      ), '[]'::jsonb),
      'owned_routes', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', route.id,
            'share_slug', route.share_slug,
            'title', route.title,
            'description', route.description,
            'visibility', route.visibility,
            'group_id', route.group_id,
            'published_at', route.published_at,
            'archived_at', route.archived_at,
            'created_at', route.created_at,
            'updated_at', route.updated_at,
            'items', coalesce((
              select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'id', item.id,
                  'entry_id', item.entry_id,
                  'position', item.position,
                  'note', item.note,
                  'relation_type', item.relation_type,
                  'created_at', item.created_at
                ) order by item.position, item.id
              )
              from public.story_route_items item
              where item.route_id = route.id
            ), '[]'::jsonb)
          ) order by route.created_at, route.id
        )
        from public.story_routes route
        where route.created_by = (select auth.uid())
      ), '[]'::jsonb)
    )
  end;
$$;

revoke all on function public.get_account_deletion_impact() from public, anon;
revoke all on function public.begin_account_deletion(text) from public, anon;
revoke all on function public.export_my_story_data() from public, anon;
revoke all on function public.finalize_account_deletion(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.get_account_deletion_impact() to authenticated;
grant execute on function public.begin_account_deletion(text) to authenticated;
grant execute on function public.export_my_story_data() to authenticated;
grant execute on function public.finalize_account_deletion(uuid, uuid) to service_role;

comment on table public.account_deletion_requests is
  'Auditable, idempotent bridge between fresh user confirmation, Auth soft deletion and application-data cleanup.';
comment on function public.export_my_story_data() is
  'Returns only the caller-owned data and currently readable accepted collaborations; never returns auth metadata or email.';
comment on function public.finalize_account_deletion(uuid, uuid) is
  'Service-role-only transactional application-data deletion/anonymization after Auth identity deletion.';

notify pgrst, 'reload schema';
