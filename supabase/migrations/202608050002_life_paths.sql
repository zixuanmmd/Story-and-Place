-- Story-and-Place v1.1: public Life Paths.
--
-- Life Paths are derived from existing public, unlocked map entries. No story
-- content or coordinates are copied into a new table. Existing UUID profile
-- links remain valid while profiles gain a stable, public username.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.map_entries') is null
    or to_regclass('public.story_routes') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null
    or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'map_entries'
        and column_name = 'unlock_at'
    )
  then
    raise exception using
      errcode = '55000',
      message = 'life paths require all migrations through 202608050001';
  end if;
end;
$$;

alter table public.profiles
  add column if not exists username text;

-- Prefer a readable ASCII display name when it already resembles a handle.
-- Chinese or otherwise non-handle display names receive a deterministic
-- traveler-<uuid> value. Collision handling is deterministic and never
-- deletes or merges an existing profile.
with username_candidates as (
  select
    profile.id,
    case
      when lower(btrim(profile.display_name))
        ~ '^[a-z][a-z0-9]*(?:[ _-][a-z0-9]+)*$'
      then left(
        regexp_replace(
          lower(btrim(profile.display_name)),
          '[ _-]+',
          '-',
          'g'
        ),
        48
      )
      else 'traveler-' || replace(profile.id::text, '-', '')
    end as base_username
  from public.profiles profile
  where profile.username is null
), ranked_usernames as (
  select
    candidate.*,
    row_number() over (
      partition by candidate.base_username
      order by candidate.id
    ) as collision_rank
  from username_candidates candidate
)
update public.profiles profile
set username = case
  when ranked.collision_rank = 1 then ranked.base_username
  else left(ranked.base_username, 15) || '-' || replace(profile.id::text, '-', '')
end
from ranked_usernames ranked
where profile.id = ranked.id
  and profile.username is null;

alter table public.profiles
  alter column username set default (
    'traveler-' || replace(gen_random_uuid()::text, '-', '')
  ),
  alter column username set not null;

-- Keep registration compatible with the existing auth.users trigger while
-- making the generated handle deterministic for new accounts. Email remains
-- exclusively in auth.users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
begin
  requested_name :=
    public.format_display_name(new.raw_user_meta_data ->> 'display_name');

  if char_length(requested_name) not between 1 and 80 then
    requested_name := '地图旅人-' || new.id::text;
  end if;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    'traveler-' || replace(new.id::text, '-', ''),
    requested_name
  );

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_username_format'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_username_format check (
        char_length(username) between 3 and 48
        and username = lower(username)
        and username ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'
      );
  end if;
end;
$$;

create unique index if not exists profiles_username_uidx
  on public.profiles(username);

create index if not exists map_entries_public_life_path_idx
  on public.map_entries(
    user_id,
    unlock_at,
    occurred_year,
    occurred_date,
    created_at,
    id
  )
  where visibility = 'public';

create or replace function public.resolve_public_profile(
  p_identifier text
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    profile.id,
    profile.username,
    profile.display_name,
    profile.avatar_url,
    profile.bio,
    profile.created_at,
    profile.updated_at
  from public.profiles profile
  where char_length(btrim(coalesce(p_identifier, ''))) between 3 and 48
    and (
      profile.username = lower(btrim(p_identifier))
      or profile.id::text = lower(btrim(p_identifier))
    )
  limit 1;
$$;

create or replace function public.get_public_life_path_entries(
  p_profile_id uuid,
  p_offset integer default 0,
  p_limit integer default 201
)
returns setof public.map_entries
language sql
stable
security invoker
set search_path = ''
as $$
  select entry.*
  from public.map_entries entry
  cross join lateral (
    select coalesce(
      entry.occurred_year,
      extract(year from entry.occurred_date)::integer,
      extract(year from entry.occurred_local)::integer,
      extract(year from entry.occurred_at)::integer
    ) as event_year
  ) event_time
  where entry.user_id = p_profile_id
    and entry.visibility = 'public'
    and (entry.unlock_at is null or entry.unlock_at <= now())
    and public.can_read_entry(entry.id)
  order by
    (event_time.event_year is null) asc,
    event_time.event_year asc,
    coalesce(entry.occurred_local, entry.occurred_date::timestamp) asc nulls last,
    entry.created_at asc,
    entry.id asc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 201), 1), 201);
$$;

create or replace function public.get_public_life_path_summary(
  p_profile_id uuid
)
returns table (
  public_story_count bigint,
  earliest_year integer,
  latest_year integer,
  distinct_place_count bigint,
  first_time_label text,
  last_time_label text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with visible_entries as (
    select
      entry.id,
      entry.time_label,
      entry.latitude,
      entry.longitude,
      entry.created_at,
      coalesce(
        entry.occurred_year,
        extract(year from entry.occurred_date)::integer,
        extract(year from entry.occurred_local)::integer,
        extract(year from entry.occurred_at)::integer
      ) as event_year,
      coalesce(entry.occurred_local, entry.occurred_date::timestamp) as local_time
    from public.map_entries entry
    where entry.user_id = p_profile_id
      and entry.visibility = 'public'
      and (entry.unlock_at is null or entry.unlock_at <= now())
      and public.can_read_entry(entry.id)
  )
  select
    count(*)::bigint,
    min(visible.event_year)::integer,
    max(visible.event_year)::integer,
    count(distinct (visible.latitude, visible.longitude))::bigint,
    (
      select first_entry.time_label
      from visible_entries first_entry
      order by
        (first_entry.event_year is null) asc,
        first_entry.event_year asc,
        first_entry.local_time asc nulls last,
        first_entry.created_at asc,
        first_entry.id asc
      limit 1
    ),
    (
      select last_entry.time_label
      from visible_entries last_entry
      order by
        (last_entry.event_year is null) asc,
        last_entry.event_year desc,
        last_entry.local_time desc nulls last,
        last_entry.created_at desc,
        last_entry.id desc
      limit 1
    )
  from visible_entries visible;
$$;

-- username is public profile metadata, but direct clients cannot change it.
-- Existing column-level INSERT/UPDATE grants intentionally remain unchanged.
revoke all on function public.resolve_public_profile(text) from public;
revoke all on function public.get_public_life_path_entries(uuid, integer, integer) from public;
revoke all on function public.get_public_life_path_summary(uuid) from public;
revoke all on function public.handle_new_user() from public;

grant execute on function public.resolve_public_profile(text)
  to anon, authenticated;
grant execute on function public.get_public_life_path_entries(uuid, integer, integer)
  to anon, authenticated;
grant execute on function public.get_public_life_path_summary(uuid)
  to anon, authenticated;

comment on column public.profiles.username is
  'Stable public profile handle. It is generated by the database and is not directly client-editable.';
comment on function public.get_public_life_path_entries(uuid, integer, integer) is
  'Chronological public Life Path entries. Private, group, and future capsule entries are always excluded.';
comment on function public.get_public_life_path_summary(uuid) is
  'Public Life Path aggregate. Counts and time bounds use only unlocked public entries.';

notify pgrst, 'reload schema';
