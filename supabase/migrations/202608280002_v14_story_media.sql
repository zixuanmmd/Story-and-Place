-- Story-and-Place v1.4 Phase 3: private story media, quotas and cleanup.
--
-- Media is never public at the bucket level. Browser roles can only read a
-- ready asset when the current request can read its parent story. All writes
-- are reserved through owner-scoped RPCs and completed by trusted server code.

do $$
begin
  if to_regclass('public.map_entries') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null
    or to_regprocedure('public.set_updated_at()') is null
  then
    raise exception using
      errcode = '55000',
      message = 'v1.4 story media requires all migrations through 202608280001';
  end if;
end;
$$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'story-media',
  'story-media',
  false,
  6291456,
  array['image/webp']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.entry_media_assets (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.map_entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  thumbnail_path text not null unique,
  source_mime_type text not null,
  mime_type text not null default 'image/webp',
  width integer not null,
  height integer not null,
  size_bytes bigint not null,
  thumbnail_size_bytes bigint not null,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  status text not null default 'pending',
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entry_media_source_mime_values
    check (source_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint entry_media_mime_value check (mime_type = 'image/webp'),
  constraint entry_media_dimensions
    check (width between 1 and 20000 and height between 1 and 20000),
  constraint entry_media_size
    check (size_bytes between 1 and 6291456),
  constraint entry_media_thumbnail_size
    check (thumbnail_size_bytes between 1 and 2097152),
  constraint entry_media_sort_order check (sort_order between 0 and 9),
  constraint entry_media_status_values
    check (status in ('pending', 'ready', 'failed', 'deleting', 'deleted')),
  constraint entry_media_cover_ready
    check (not is_cover or status = 'ready'),
  constraint entry_media_storage_path_shape
    check (
      storage_path = user_id::text || '/' || entry_id::text || '/' || id::text || '.webp'
      and thumbnail_path = user_id::text || '/' || entry_id::text || '/' || id::text || '-thumb.webp'
    )
);

create index if not exists entry_media_assets_entry_status_sort_idx
  on public.entry_media_assets(entry_id, status, sort_order, created_at);
create index if not exists entry_media_assets_user_status_idx
  on public.entry_media_assets(user_id, status, created_at desc);
create unique index if not exists entry_media_assets_one_cover_idx
  on public.entry_media_assets(entry_id)
  where is_cover and status = 'ready';

create table if not exists public.media_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid unique,
  bucket_id text not null default 'story-media',
  object_paths text[] not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_cleanup_bucket check (bucket_id = 'story-media'),
  constraint media_cleanup_paths check (
    cardinality(object_paths) between 1 and 2
    and array_position(object_paths, null) is null
  ),
  constraint media_cleanup_status_values
    check (status in ('pending', 'processing', 'failed')),
  constraint media_cleanup_attempt_count check (attempt_count between 0 and 20)
);

create index if not exists media_cleanup_queue_claim_idx
  on public.media_cleanup_queue(status, next_attempt_at, created_at);

drop trigger if exists entry_media_assets_set_updated_at on public.entry_media_assets;
create trigger entry_media_assets_set_updated_at
before update on public.entry_media_assets
for each row execute function public.set_updated_at();

drop trigger if exists media_cleanup_queue_set_updated_at on public.media_cleanup_queue;
create trigger media_cleanup_queue_set_updated_at
before update on public.media_cleanup_queue
for each row execute function public.set_updated_at();

create or replace function private.story_media_quota_bytes()
returns bigint
language sql
immutable
security definer
set search_path = ''
as $$
  select 524288000::bigint;
$$;

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
  if actor is null then
    raise exception using errcode = '22023', message = 'media owner is required';
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
    select 1
    from public.map_entries entry
    where entry.id = p_entry_id
      and entry.user_id = actor
      and (
        entry.visibility <> 'group'
        or exists (
          select 1
          from public.group_members membership
          where membership.group_id = entry.group_id
            and membership.user_id = actor
            and membership.status = 'active'
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'entry media owner required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor::text, 8142301)
  );

  select coalesce(sum(asset.size_bytes + asset.thumbnail_size_bytes), 0)::bigint
  into current_bytes
  from public.entry_media_assets asset
  where asset.user_id = actor
    and asset.status in ('pending', 'ready');

  if (
    select count(*)
    from public.entry_media_assets asset
    where asset.entry_id = p_entry_id
      and asset.status in ('pending', 'ready')
  ) >= 10 then
    raise exception using errcode = '23514', message = 'entry media limit reached';
  end if;
  if current_bytes + p_size_bytes + p_thumbnail_size_bytes
    > private.story_media_quota_bytes()
  then
    raise exception using errcode = '23514', message = 'story media quota reached';
  end if;

  insert into public.entry_media_assets (
    id,
    entry_id,
    user_id,
    storage_path,
    thumbnail_path,
    source_mime_type,
    width,
    height,
    size_bytes,
    thumbnail_size_bytes
  ) values (
    asset_id,
    p_entry_id,
    actor,
    actor::text || '/' || p_entry_id::text || '/' || asset_id::text || '.webp',
    actor::text || '/' || p_entry_id::text || '/' || asset_id::text || '-thumb.webp',
    p_source_mime_type,
    p_width,
    p_height,
    p_size_bytes,
    p_thumbnail_size_bytes
  ) returning * into reserved;

  return reserved;
end;
$$;

create or replace function public.mark_entry_media_asset_ready(p_asset_id uuid)
returns public.entry_media_assets
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.entry_media_assets%rowtype;
begin
  select * into target
  from public.entry_media_assets
  where id = p_asset_id
  for update;
  if not found or target.status <> 'pending' then
    raise exception using errcode = '55000', message = 'media asset is not pending';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target.entry_id::text, 8142302)
  );

  update public.entry_media_assets asset
  set
    status = 'ready',
    failure_code = null,
    sort_order = (
      select coalesce(max(existing.sort_order), -1) + 1
      from public.entry_media_assets existing
      where existing.entry_id = target.entry_id
        and existing.status = 'ready'
    ),
    is_cover = not exists (
      select 1
      from public.entry_media_assets existing
      where existing.entry_id = target.entry_id
        and existing.status = 'ready'
        and existing.is_cover
    )
  where asset.id = p_asset_id
  returning * into target;
  return target;
end;
$$;

create or replace function private.enqueue_media_cleanup(
  p_asset_id uuid,
  p_paths text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if cardinality(p_paths) not between 1 and 2
    or array_position(p_paths, null) is not null
  then
    raise exception using errcode = '22023', message = 'invalid cleanup paths';
  end if;

  insert into public.media_cleanup_queue (
    asset_id,
    object_paths,
    status,
    next_attempt_at,
    processing_started_at,
    last_error_code
  ) values (
    p_asset_id,
    p_paths,
    'pending',
    now(),
    null,
    null
  )
  on conflict (asset_id) do update
  set
    object_paths = excluded.object_paths,
    status = 'pending',
    next_attempt_at = now(),
    processing_started_at = null,
    last_error_code = null;
end;
$$;

create or replace function public.mark_entry_media_asset_failed(
  p_asset_id uuid,
  p_failure_code text default 'upload_failed'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.entry_media_assets%rowtype;
begin
  update public.entry_media_assets
  set
    status = 'failed',
    is_cover = false,
    failure_code = left(coalesce(p_failure_code, 'upload_failed'), 80)
  where id = p_asset_id
    and status in ('pending', 'failed')
  returning * into target;
  if found then
    perform private.enqueue_media_cleanup(
      target.id,
      array[target.storage_path, target.thumbnail_path]
    );
  end if;
end;
$$;

create or replace function public.begin_entry_media_asset_delete(p_asset_id uuid)
returns public.entry_media_assets
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.entry_media_assets%rowtype;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  update public.entry_media_assets asset
  set status = 'deleting', is_cover = false
  where asset.id = p_asset_id
    and asset.user_id = actor
    and asset.status = 'ready'
  returning * into target;
  if not found then
    raise exception using errcode = 'P0002', message = 'media asset not found';
  end if;

  if not exists (
    select 1 from public.entry_media_assets asset
    where asset.entry_id = target.entry_id
      and asset.status = 'ready'
      and asset.is_cover
  ) then
    update public.entry_media_assets asset
    set is_cover = true
    where asset.id = (
      select candidate.id
      from public.entry_media_assets candidate
      where candidate.entry_id = target.entry_id
        and candidate.status = 'ready'
      order by candidate.sort_order, candidate.created_at
      limit 1
    );
  end if;

  perform private.enqueue_media_cleanup(
    target.id,
    array[target.storage_path, target.thumbnail_path]
  );
  return target;
end;
$$;

create or replace function public.set_entry_media_cover(
  p_entry_id uuid,
  p_asset_id uuid
)
returns void
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
  if not exists (
    select 1
    from public.entry_media_assets asset
    where asset.id = p_asset_id
      and asset.entry_id = p_entry_id
      and asset.user_id = actor
      and asset.status = 'ready'
  ) then
    raise exception using errcode = 'P0002', message = 'media asset not found';
  end if;

  update public.entry_media_assets
  set is_cover = false
  where entry_id = p_entry_id
    and user_id = actor
    and status = 'ready';
  update public.entry_media_assets
  set is_cover = true
  where id = p_asset_id;
end;
$$;

create or replace function public.reorder_entry_media_assets(
  p_entry_id uuid,
  p_asset_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  ready_count integer;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if cardinality(p_asset_ids) not between 1 and 10
    or (select count(distinct value) from unnest(p_asset_ids) value)
      <> cardinality(p_asset_ids)
  then
    raise exception using errcode = '22023', message = 'invalid media order';
  end if;

  select count(*)::integer into ready_count
  from public.entry_media_assets asset
  where asset.entry_id = p_entry_id
    and asset.user_id = actor
    and asset.status = 'ready';
  if ready_count <> cardinality(p_asset_ids)
    or exists (
      select 1
      from unnest(p_asset_ids) value
      where not exists (
        select 1
        from public.entry_media_assets asset
        where asset.id = value
          and asset.entry_id = p_entry_id
          and asset.user_id = actor
          and asset.status = 'ready'
      )
    )
  then
    raise exception using errcode = '42501', message = 'media order is incomplete';
  end if;

  update public.entry_media_assets asset
  set sort_order = (ordering.position - 1)::integer
  from unnest(p_asset_ids) with ordinality ordering(asset_id, position)
  where asset.id = ordering.asset_id;
end;
$$;

create or replace function public.get_my_story_media_usage()
returns table (
  used_bytes bigint,
  quota_bytes bigint,
  file_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum(asset.size_bytes + asset.thumbnail_size_bytes), 0)::bigint,
    private.story_media_quota_bytes(),
    count(*)::integer
  from public.entry_media_assets asset
  where asset.user_id = (select auth.uid())
    and asset.status in ('pending', 'ready');
$$;

create or replace function private.queue_deleted_entry_media_asset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'deleted' then
    perform private.enqueue_media_cleanup(
      old.id,
      array[old.storage_path, old.thumbnail_path]
    );
  end if;
  return old;
end;
$$;

drop trigger if exists entry_media_assets_queue_delete on public.entry_media_assets;
create trigger entry_media_assets_queue_delete
before delete on public.entry_media_assets
for each row execute function private.queue_deleted_entry_media_asset();

create or replace function public.claim_story_media_cleanup(p_limit integer default 25)
returns setof public.media_cleanup_queue
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid cleanup limit';
  end if;

  insert into public.media_cleanup_queue (asset_id, object_paths)
  select
    asset.id,
    array[asset.storage_path, asset.thumbnail_path]
  from public.entry_media_assets asset
  where asset.status = 'failed'
    or (asset.status = 'pending' and asset.created_at < now() - interval '1 hour')
  on conflict (asset_id) do nothing;

  return query
  with candidates as (
    select queue.id
    from public.media_cleanup_queue queue
    where queue.next_attempt_at <= now()
      and queue.attempt_count < 20
      and (
        queue.status in ('pending', 'failed')
        or (
          queue.status = 'processing'
          and queue.processing_started_at < now() - interval '15 minutes'
        )
      )
    order by queue.created_at
    for update skip locked
    limit p_limit
  )
  update public.media_cleanup_queue queue
  set
    status = 'processing',
    processing_started_at = now(),
    attempt_count = queue.attempt_count + 1
  from candidates
  where queue.id = candidates.id
  returning queue.*;
end;
$$;

create or replace function public.finish_story_media_cleanup(
  p_queue_id uuid,
  p_succeeded boolean,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.media_cleanup_queue%rowtype;
begin
  select * into target
  from public.media_cleanup_queue
  where id = p_queue_id
  for update;
  if not found or target.status <> 'processing' then
    raise exception using errcode = 'P0002', message = 'cleanup item not found';
  end if;

  if p_succeeded then
    if target.asset_id is not null then
      update public.entry_media_assets
      set status = 'deleted', is_cover = false
      where id = target.asset_id;
      delete from public.entry_media_assets where id = target.asset_id;
    end if;
    delete from public.media_cleanup_queue where id = p_queue_id;
  else
    update public.media_cleanup_queue
    set
      status = 'failed',
      processing_started_at = null,
      last_error_code = left(coalesce(p_error_code, 'storage_remove_failed'), 80),
      next_attempt_at = now() + pg_catalog.make_interval(
        secs => least(3600, 30 * (2 ^ least(attempt_count, 7)))::integer
      )
    where id = p_queue_id;
  end if;
end;
$$;

create or replace function public.complete_entry_media_asset_delete(p_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.entry_media_assets
  set status = 'deleted', is_cover = false
  where id = p_asset_id
    and status in ('pending', 'failed', 'deleting');
  delete from public.entry_media_assets where id = p_asset_id;
  delete from public.media_cleanup_queue where asset_id = p_asset_id;
end;
$$;

alter table public.entry_media_assets enable row level security;
alter table public.media_cleanup_queue enable row level security;

drop policy if exists entry_media_assets_authorized_select on public.entry_media_assets;
create policy entry_media_assets_authorized_select
on public.entry_media_assets for select to anon, authenticated
using (
  status = 'ready'
  and public.can_read_entry(entry_id)
);

drop policy if exists story_media_objects_authorized_select on storage.objects;
create policy story_media_objects_authorized_select
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'story-media'
  and exists (
    select 1
    from public.entry_media_assets asset
    where asset.status = 'ready'
      and (asset.storage_path = name or asset.thumbnail_path = name)
      and public.can_read_entry(asset.entry_id)
  )
);

revoke all on table public.entry_media_assets from public, anon, authenticated;
grant select on table public.entry_media_assets to anon, authenticated;
revoke all on table public.media_cleanup_queue from public, anon, authenticated;
grant select, insert, update, delete on table public.media_cleanup_queue to service_role;

revoke all on function private.story_media_quota_bytes() from public, anon, authenticated;
revoke all on function private.enqueue_media_cleanup(uuid, text[]) from public, anon, authenticated;
revoke all on function private.queue_deleted_entry_media_asset() from public, anon, authenticated;

revoke all on function public.reserve_entry_media_asset(uuid, uuid, text, bigint, bigint, integer, integer)
from public, anon, authenticated;
revoke all on function public.mark_entry_media_asset_ready(uuid)
from public, anon, authenticated;
revoke all on function public.mark_entry_media_asset_failed(uuid, text)
from public, anon, authenticated;
revoke all on function public.begin_entry_media_asset_delete(uuid)
from public, anon, authenticated;
revoke all on function public.set_entry_media_cover(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.reorder_entry_media_assets(uuid, uuid[])
from public, anon, authenticated;
revoke all on function public.get_my_story_media_usage()
from public, anon, authenticated;
revoke all on function public.claim_story_media_cleanup(integer)
from public, anon, authenticated;
revoke all on function public.finish_story_media_cleanup(uuid, boolean, text)
from public, anon, authenticated;
revoke all on function public.complete_entry_media_asset_delete(uuid)
from public, anon, authenticated;

grant execute on function public.reserve_entry_media_asset(uuid, uuid, text, bigint, bigint, integer, integer)
to service_role;
grant execute on function public.begin_entry_media_asset_delete(uuid)
to authenticated;
grant execute on function public.set_entry_media_cover(uuid, uuid)
to authenticated;
grant execute on function public.reorder_entry_media_assets(uuid, uuid[])
to authenticated;
grant execute on function public.get_my_story_media_usage()
to authenticated;

grant execute on function public.mark_entry_media_asset_ready(uuid)
to service_role;
grant execute on function public.mark_entry_media_asset_failed(uuid, text)
to service_role;
grant execute on function public.claim_story_media_cleanup(integer)
to service_role;
grant execute on function public.finish_story_media_cleanup(uuid, boolean, text)
to service_role;
grant execute on function public.complete_entry_media_asset_delete(uuid)
to service_role;

comment on table public.entry_media_assets is
  'Private-bucket story images. Only ready assets whose parent entry passes can_read_entry are visible.';
comment on table public.media_cleanup_queue is
  'Service-only durable queue for removing Storage objects after failures, explicit deletes or cascading story/account deletion.';
comment on function public.get_my_story_media_usage() is
  'Returns the caller media usage and the temporary v1.4 500 MiB entitlement ceiling.';

notify pgrst, 'reload schema';
