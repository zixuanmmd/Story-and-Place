-- v1.4 commercial foundation: public plan catalog, entitlement-driven limits,
-- private subscription state, exact usage reporting and database-enforced quotas.
--
-- This migration does not connect a payment provider and does not charge users.
-- Rollback note: remove the quota trigger/functions before dropping these tables.
-- Do not roll back after subscriptions exist without first preserving that state.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.map_entries') is null
    or to_regclass('public.story_routes') is null
    or to_regclass('public.entry_media_assets') is null
    or to_regprocedure('public.set_updated_at()') is null
    or to_regprocedure('public.is_account_restricted(uuid)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'commercial foundation requires the v1.4 media and governance migrations';
  end if;
end;
$$;

create table if not exists public.plans (
  code text primary key,
  name varchar(80) not null,
  description varchar(500) not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_code_format check (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint plans_name_not_blank check (char_length(btrim(name)) between 1 and 80),
  constraint plans_description_length check (char_length(description) <= 500),
  constraint plans_sort_order_range check (sort_order between 0 and 10000)
);

create table if not exists public.plan_entitlements (
  plan_code text not null references public.plans(code) on delete cascade,
  entitlement_key text not null,
  value_type text not null,
  boolean_value boolean,
  integer_value bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_code, entitlement_key),
  constraint plan_entitlements_known_key check (
    entitlement_key in (
      'can_upload_media',
      'max_storage_bytes',
      'max_media_files',
      'max_story_routes',
      'advanced_export'
    )
  ),
  constraint plan_entitlements_value_type check (
    value_type in ('boolean', 'integer')
  ),
  constraint plan_entitlements_typed_value check (
    (value_type = 'boolean' and boolean_value is not null and integer_value is null)
    or
    (value_type = 'integer' and boolean_value is null and integer_value is not null and integer_value >= 0)
  )
);

create table if not exists public.user_subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  plan_code text not null references public.plans(code) on delete restrict,
  status text not null default 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_subscriptions_status_values check (
    status in ('trialing', 'active', 'past_due', 'canceled')
  ),
  constraint user_subscriptions_period_order check (
    current_period_start is null
    or current_period_end is null
    or current_period_end > current_period_start
  ),
  constraint user_subscriptions_cancel_state check (
    status = 'canceled' or canceled_at is null
  )
);

create index if not exists user_subscriptions_plan_status_idx
  on public.user_subscriptions(plan_code, status, current_period_end);

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at
before update on public.plans
for each row execute function public.set_updated_at();

drop trigger if exists plan_entitlements_set_updated_at on public.plan_entitlements;
create trigger plan_entitlements_set_updated_at
before update on public.plan_entitlements
for each row execute function public.set_updated_at();

drop trigger if exists user_subscriptions_set_updated_at on public.user_subscriptions;
create trigger user_subscriptions_set_updated_at
before update on public.user_subscriptions
for each row execute function public.set_updated_at();

insert into public.plans (code, name, description, sort_order)
values
  ('free', 'Free', '保留完整的故事记录核心能力与基础媒体空间。', 10),
  ('supporter', 'Supporter', '为长期记录者预留更大的媒体与故事线路容量。', 20),
  ('creator', 'Creator', '为持续公开创作与大型地图预留更高容量。', 30)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order;

insert into public.plan_entitlements (
  plan_code, entitlement_key, value_type, boolean_value, integer_value
)
values
  ('free', 'can_upload_media', 'boolean', true, null),
  ('free', 'max_storage_bytes', 'integer', null, 524288000),
  ('free', 'max_media_files', 'integer', null, 1000),
  ('free', 'max_story_routes', 'integer', null, 100),
  ('free', 'advanced_export', 'boolean', true, null),
  ('supporter', 'can_upload_media', 'boolean', true, null),
  ('supporter', 'max_storage_bytes', 'integer', null, 5368709120),
  ('supporter', 'max_media_files', 'integer', null, 10000),
  ('supporter', 'max_story_routes', 'integer', null, 500),
  ('supporter', 'advanced_export', 'boolean', true, null),
  ('creator', 'can_upload_media', 'boolean', true, null),
  ('creator', 'max_storage_bytes', 'integer', null, 21474836480),
  ('creator', 'max_media_files', 'integer', null, 50000),
  ('creator', 'max_story_routes', 'integer', null, 2000),
  ('creator', 'advanced_export', 'boolean', true, null)
on conflict (plan_code, entitlement_key) do update
set value_type = excluded.value_type,
    boolean_value = excluded.boolean_value,
    integer_value = excluded.integer_value;

create or replace function private.resolve_user_plan_code(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select subscription.plan_code
      from public.user_subscriptions subscription
      join public.plans plan on plan.code = subscription.plan_code
      where subscription.user_id = p_user_id
        and plan.is_active
        and (
          (
            subscription.status in ('trialing', 'active')
            and (
              subscription.current_period_end is null
              or subscription.current_period_end > now()
            )
          )
          or (
            subscription.status = 'canceled'
            and subscription.current_period_end is not null
            and subscription.current_period_end > now()
          )
        )
      limit 1
    ),
    'free'
  );
$$;

create or replace function private.get_boolean_entitlement(
  p_user_id uuid,
  p_entitlement_key text,
  p_default boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select entitlement.boolean_value
      from public.plan_entitlements entitlement
      where entitlement.plan_code = private.resolve_user_plan_code(p_user_id)
        and entitlement.entitlement_key = p_entitlement_key
        and entitlement.value_type = 'boolean'
    ),
    p_default
  );
$$;

create or replace function private.get_integer_entitlement(
  p_user_id uuid,
  p_entitlement_key text,
  p_default bigint default 0
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select entitlement.integer_value
      from public.plan_entitlements entitlement
      where entitlement.plan_code = private.resolve_user_plan_code(p_user_id)
        and entitlement.entitlement_key = p_entitlement_key
        and entitlement.value_type = 'integer'
    ),
    p_default
  );
$$;

create or replace function public.get_my_commercial_access()
returns table (
  plan_code text,
  plan_name text,
  plan_description text,
  subscription_status text,
  current_period_end timestamptz,
  can_upload_media boolean,
  max_storage_bytes bigint,
  max_media_files bigint,
  max_story_routes bigint,
  advanced_export boolean,
  story_count bigint,
  active_route_count bigint,
  storage_bytes bigint,
  media_file_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  resolved_plan text;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  resolved_plan := private.resolve_user_plan_code(actor);

  return query
  select
    plan.code,
    plan.name::text,
    plan.description::text,
    subscription.status,
    subscription.current_period_end,
    private.get_boolean_entitlement(actor, 'can_upload_media', false),
    private.get_integer_entitlement(actor, 'max_storage_bytes', 0),
    private.get_integer_entitlement(actor, 'max_media_files', 0),
    private.get_integer_entitlement(actor, 'max_story_routes', 0),
    private.get_boolean_entitlement(actor, 'advanced_export', false),
    (select count(*) from public.map_entries entry where entry.user_id = actor),
    (
      select count(*)
      from public.story_routes route
      where route.created_by = actor and route.archived_at is null
    ),
    (
      select coalesce(sum(asset.size_bytes + asset.thumbnail_size_bytes), 0)::bigint
      from public.entry_media_assets asset
      where asset.user_id = actor and asset.status in ('pending', 'ready')
    ),
    (
      select count(*)
      from public.entry_media_assets asset
      where asset.user_id = actor and asset.status in ('pending', 'ready')
    )
  from public.plans plan
  left join public.user_subscriptions subscription
    on subscription.user_id = actor
    and subscription.plan_code = plan.code
  where plan.code = resolved_plan;
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
    private.get_integer_entitlement((select auth.uid()), 'max_storage_bytes', 0),
    count(*)::integer
  from public.entry_media_assets asset
  where asset.user_id = (select auth.uid())
    and asset.status in ('pending', 'ready');
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
  current_files bigint;
  max_bytes bigint;
  max_files bigint;
  reserved public.entry_media_assets%rowtype;
begin
  if actor is null or public.is_account_restricted(actor) then
    raise exception using errcode = '42501', message = 'media owner unavailable';
  end if;
  if not private.get_boolean_entitlement(actor, 'can_upload_media', false) then
    raise exception using errcode = '42501', message = 'media upload entitlement required';
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor::text, 8142301)
  );

  select
    coalesce(sum(asset.size_bytes + asset.thumbnail_size_bytes), 0)::bigint,
    count(*)::bigint
  into current_bytes, current_files
  from public.entry_media_assets asset
  where asset.user_id = actor and asset.status in ('pending', 'ready');

  max_bytes := private.get_integer_entitlement(actor, 'max_storage_bytes', 0);
  max_files := private.get_integer_entitlement(actor, 'max_media_files', 0);

  if (
    select count(*) from public.entry_media_assets asset
    where asset.entry_id = p_entry_id and asset.status in ('pending', 'ready')
  ) >= 10 then
    raise exception using errcode = '23514', message = 'entry media limit reached';
  end if;
  if current_files >= max_files then
    raise exception using errcode = '23514', message = 'story media file quota reached';
  end if;
  if current_bytes + p_size_bytes + p_thumbnail_size_bytes > max_bytes then
    raise exception using errcode = '23514', message = 'story media storage quota reached';
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

create or replace function private.enforce_story_route_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_routes bigint;
  max_routes bigint;
begin
  if new.archived_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.archived_at is null
    and old.created_by = new.created_by
  then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.created_by::text, 8142302)
  );

  max_routes := private.get_integer_entitlement(
    new.created_by,
    'max_story_routes',
    0
  );
  select count(*) into current_routes
  from public.story_routes route
  where route.created_by = new.created_by
    and route.archived_at is null
    and route.id <> new.id;

  if current_routes >= max_routes then
    raise exception using errcode = '23514', message = 'story route quota reached';
  end if;
  return new;
end;
$$;

drop trigger if exists story_routes_enforce_entitlement_quota on public.story_routes;
create trigger story_routes_enforce_entitlement_quota
before insert or update of archived_at, created_by on public.story_routes
for each row execute function private.enforce_story_route_quota();

alter table public.plans enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.user_subscriptions enable row level security;

drop policy if exists "active_plans_are_public" on public.plans;
create policy "active_plans_are_public"
on public.plans for select to anon, authenticated
using (is_active);

drop policy if exists "active_plan_entitlements_are_public" on public.plan_entitlements;
create policy "active_plan_entitlements_are_public"
on public.plan_entitlements for select to anon, authenticated
using (
  exists (
    select 1 from public.plans plan
    where plan.code = plan_entitlements.plan_code and plan.is_active
  )
);

drop policy if exists "users_read_own_subscription" on public.user_subscriptions;
create policy "users_read_own_subscription"
on public.user_subscriptions for select to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.plans from public, anon, authenticated;
revoke all on table public.plan_entitlements from public, anon, authenticated;
revoke all on table public.user_subscriptions from public, anon, authenticated;
grant select on table public.plans to anon, authenticated;
grant select on table public.plan_entitlements to anon, authenticated;
grant select on table public.user_subscriptions to authenticated;

revoke all on function private.resolve_user_plan_code(uuid) from public, anon, authenticated;
revoke all on function private.get_boolean_entitlement(uuid, text, boolean) from public, anon, authenticated;
revoke all on function private.get_integer_entitlement(uuid, text, bigint) from public, anon, authenticated;
revoke all on function private.enforce_story_route_quota() from public, anon, authenticated;
revoke all on function public.get_my_commercial_access() from public, anon, authenticated;
grant execute on function public.get_my_commercial_access() to authenticated;

revoke all on function public.get_my_story_media_usage() from public, anon, authenticated;
grant execute on function public.get_my_story_media_usage() to authenticated;
revoke all on function public.reserve_entry_media_asset(uuid, uuid, text, bigint, bigint, integer, integer)
from public, anon, authenticated;
grant execute on function public.reserve_entry_media_asset(uuid, uuid, text, bigint, bigint, integer, integer)
to service_role;

comment on table public.plans is
  'Public product plan catalog. Application behavior must use entitlements, not plan-name branches.';
comment on table public.plan_entitlements is
  'Typed feature and quota values for each product plan.';
comment on table public.user_subscriptions is
  'Server-managed user plan assignment. No payment provider is connected by this migration.';
comment on function public.get_my_commercial_access() is
  'Returns the authenticated user current entitlements and exact owned-resource usage.';
comment on function private.enforce_story_route_quota() is
  'Serializes new or restored route writes and enforces max_story_routes.';

notify pgrst, 'reload schema';
