-- Story-and-Place v1.1: Time Capsules.
-- Future capsules are readable by their creator only. Group creators must
-- also retain active membership. At unlock_at the existing visibility model
-- becomes effective automatically on the next database query.

do $$
begin
  if to_regclass('public.map_entries') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null
    or to_regprocedure('public.can_interact_entry(uuid)') is null
    or to_regprocedure('public.can_collaborate_entry(uuid)') is null
    or to_regprocedure('public.can_edit_entry_field(uuid,text)') is null
    or to_regprocedure('public.can_read_entry_edit_log(uuid,timestamp with time zone)') is null
    or to_regprocedure('public.create_entry(jsonb,text[])') is null
    or to_regprocedure('public.update_entry(uuid,jsonb,text[])') is null
    or to_regprocedure('public.save_story_route(uuid,text,text,text,uuid,boolean,jsonb)') is null
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
      message = 'time capsules require all migrations through 202608040002';
  end if;
end;
$$;

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
          entry.unlock_at > now()
          and entry.user_id = (select auth.uid())
          and (
            entry.visibility <> 'group'
            or public.is_active_group_member(entry.group_id)
          )
        )
        or (
          (entry.unlock_at is null or entry.unlock_at <= now())
          and (
            entry.visibility = 'public'
            or (
              entry.visibility = 'private'
              and (
                entry.user_id = (select auth.uid())
                or exists (
                  select 1
                  from public.entry_participants participant
                  where participant.entry_id = entry.id
                    and participant.user_id = (select auth.uid())
                    and participant.status = 'accepted'
                )
              )
            )
            or (
              entry.visibility = 'group'
              and public.is_active_group_member(entry.group_id)
            )
          )
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
  select (select auth.uid()) is not null and exists (
    select 1
    from public.map_entries entry
    where entry.id = p_entry_id
      and (
        entry.visibility <> 'group'
        or public.is_active_group_member(entry.group_id)
      )
      and (
        entry.user_id = (select auth.uid())
        or (
          (entry.unlock_at is null or entry.unlock_at <= now())
          and exists (
            select 1
            from public.entry_participants participant
            where participant.entry_id = entry.id
              and participant.user_id = (select auth.uid())
              and participant.status = 'accepted'
          )
        )
      )
  );
$$;

create or replace function public.can_edit_entry_field(
  p_entry_id uuid,
  p_field text
)
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
        entry.visibility <> 'group'
        or public.is_active_group_member(entry.group_id)
      )
      and (
        entry.user_id = (select auth.uid())
        or (
          (entry.unlock_at is null or entry.unlock_at <= now())
          and exists (
            select 1
            from public.entry_participants participant
            where participant.entry_id = entry.id
              and participant.user_id = (select auth.uid())
              and participant.status = 'accepted'
              and p_field = any(participant.editable_fields)
          )
        )
      )
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
  select (select auth.uid()) is not null and exists (
    select 1
    from public.map_entries entry
    where entry.id = p_entry_id
      and (
        entry.visibility <> 'group'
        or public.is_active_group_member(entry.group_id)
      )
      and (
        entry.user_id = (select auth.uid())
        or (
          (entry.unlock_at is null or entry.unlock_at <= now())
          and exists (
            select 1
            from public.entry_participants participant
            where participant.entry_id = entry.id
              and participant.user_id = (select auth.uid())
              and participant.status = 'accepted'
              and participant.responded_at <= p_created_at
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
  select (select auth.uid()) is not null and exists (
    select 1
    from public.map_entries entry
    where entry.id = p_entry_id
      and (entry.unlock_at is null or entry.unlock_at <= now())
      and public.can_read_entry(entry.id)
      and entry.visibility in ('public', 'group')
  );
$$;

create or replace function public.create_entry_v11(
  p_entry jsonb,
  p_tag_names text[] default '{}'::text[]
)
returns public.map_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target_visibility text;
  target_group_id uuid;
  target_unlock_at timestamptz;
  created_entry public.map_entries%rowtype;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if jsonb_typeof(coalesce(p_entry, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'entry payload must be an object';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_entry) key
    where key not in (
      'title', 'content', 'place_name', 'latitude', 'longitude',
      'occurred_local', 'occurred_timezone', 'occurred_date',
      'occurred_year', 'time_precision', 'time_label', 'visibility',
      'group_id', 'place_category_slug', 'allow_comments', 'unlock_at'
    )
  ) then
    raise exception using errcode = '22023', message = 'entry payload contains restricted fields';
  end if;

  target_unlock_at := (p_entry ->> 'unlock_at')::timestamptz;
  if target_unlock_at is not null and target_unlock_at <= now() then
    raise exception using errcode = '23514', message = 'unlock time must be in the future';
  end if;

  target_visibility := coalesce(p_entry ->> 'visibility', 'private');
  target_group_id := (p_entry ->> 'group_id')::uuid;
  perform public.assert_entry_rpc_group_target(
    target_visibility,
    target_group_id
  );

  insert into public.map_entries (
    user_id,
    title,
    content,
    place_name,
    latitude,
    longitude,
    occurred_local,
    occurred_timezone,
    occurred_date,
    occurred_year,
    time_precision,
    time_label,
    visibility,
    group_id,
    place_category_slug,
    allow_comments,
    unlock_at
  )
  values (
    actor,
    p_entry ->> 'title',
    p_entry ->> 'content',
    p_entry ->> 'place_name',
    (p_entry ->> 'latitude')::double precision,
    (p_entry ->> 'longitude')::double precision,
    (p_entry ->> 'occurred_local')::timestamp without time zone,
    p_entry ->> 'occurred_timezone',
    (p_entry ->> 'occurred_date')::date,
    (p_entry ->> 'occurred_year')::integer,
    p_entry ->> 'time_precision',
    p_entry ->> 'time_label',
    target_visibility,
    target_group_id,
    coalesce(p_entry ->> 'place_category_slug', 'other'),
    coalesce((p_entry ->> 'allow_comments')::boolean, true),
    target_unlock_at
  )
  returning * into created_entry;

  perform public.replace_entry_tags(
    created_entry.id,
    coalesce(p_tag_names, '{}'::text[]),
    actor,
    false
  );
  return created_entry;
end;
$$;

create or replace function public.update_entry_v11(
  p_entry_id uuid,
  p_patch jsonb,
  p_tag_names text[] default null
)
returns public.map_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  existing public.map_entries%rowtype;
  updated_entry public.map_entries%rowtype;
  target_unlock_at timestamptz;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'entry patch must be an object';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_patch) key
    where key not in (
      'title', 'content', 'place_name', 'latitude', 'longitude',
      'occurred_local', 'occurred_timezone', 'occurred_date',
      'occurred_year', 'time_precision', 'time_label', 'visibility',
      'group_id', 'place_category_slug', 'allow_comments', 'unlock_at'
    )
  ) then
    raise exception using errcode = '22023', message = 'entry patch contains restricted fields';
  end if;

  select * into existing
  from public.map_entries
  where id = p_entry_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'entry not found';
  end if;
  if p_patch ? 'unlock_at' and existing.user_id <> actor then
    raise exception using errcode = '42501', message = 'only the entry owner can change unlock time';
  end if;

  target_unlock_at := case
    when p_patch ? 'unlock_at' then (p_patch ->> 'unlock_at')::timestamptz
    else existing.unlock_at
  end;
  if target_unlock_at is distinct from existing.unlock_at
    and target_unlock_at is not null
    and target_unlock_at <= now()
  then
    raise exception using errcode = '23514', message = 'unlock time must be in the future';
  end if;

  if p_patch ? 'unlock_at' and target_unlock_at is distinct from existing.unlock_at then
    update public.map_entries
    set unlock_at = target_unlock_at
    where id = p_entry_id
    returning * into updated_entry;
  end if;
  updated_entry := public.update_entry(
    p_entry_id,
    p_patch - 'unlock_at',
    p_tag_names
  );
  return updated_entry;
end;
$$;

create or replace function public.get_social_feed_v11(
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  user_id uuid,
  title text,
  content text,
  place_name text,
  latitude double precision,
  longitude double precision,
  time_label text,
  visibility text,
  group_id uuid,
  place_category_slug text,
  allow_comments boolean,
  unlock_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  author_display_name text,
  author_avatar_url text,
  group_name text,
  group_slug text,
  like_count bigint,
  comment_count bigint,
  user_liked boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    entry.id,
    entry.user_id,
    entry.title::text,
    entry.content,
    entry.place_name,
    entry.latitude,
    entry.longitude,
    entry.time_label,
    entry.visibility,
    entry.group_id,
    entry.place_category_slug,
    entry.allow_comments,
    entry.unlock_at,
    entry.created_at,
    entry.updated_at,
    profile.display_name,
    profile.avatar_url,
    target_group.name::text,
    target_group.slug,
    (select count(*) from public.entry_likes likes where likes.entry_id = entry.id),
    (
      select count(*)
      from public.entry_comments comment
      where comment.entry_id = entry.id and comment.deleted_at is null
    ),
    exists (
      select 1
      from public.entry_likes mine
      where mine.entry_id = entry.id
        and mine.user_id = (select auth.uid())
    )
  from public.map_entries entry
  join public.profiles profile on profile.id = entry.user_id
  left join public.groups target_group on target_group.id = entry.group_id
  where (select auth.uid()) is not null
    and public.can_read_entry(entry.id)
    and (
      (
        entry.user_id = (select auth.uid())
        and entry.visibility in ('public', 'private')
      )
      or (
        entry.visibility = 'public'
        and exists (
          select 1
          from public.follows follow
          where follow.follower_id = (select auth.uid())
            and follow.following_id = entry.user_id
        )
      )
      or (
        entry.visibility = 'group'
        and public.is_active_group_member(entry.group_id)
      )
    )
    and (
      p_cursor_created_at is null
      or (entry.created_at, entry.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by entry.created_at desc, entry.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

create or replace function public.get_timeline_entries_v11(
  p_scope text,
  p_target_id uuid,
  p_order text default 'desc',
  p_visibility text default null,
  p_category_slugs text[] default null,
  p_author_id uuid default null,
  p_keyword text default null,
  p_start_year integer default null,
  p_end_year integer default null,
  p_include_undated boolean default true,
  p_capsule_state text default null,
  p_offset integer default 0,
  p_limit integer default 51
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
      case
        when entry.time_precision = 'approximate' then
          (
            regexp_match(
              entry.time_label,
              '(^|[^0-9])([1-9][0-9]{3})([^0-9]|$)'
            )
          )[2]::integer
        else null
      end
    ) as event_year
  ) timeline
  where p_scope in ('mine', 'user', 'group')
    and (
      (
        p_scope = 'mine'
        and p_target_id = (select auth.uid())
        and (
          entry.user_id = p_target_id
          or exists (
            select 1
            from public.entry_participants participant
            where participant.entry_id = entry.id
              and participant.user_id = p_target_id
              and participant.status = 'accepted'
              and (
                entry.visibility <> 'group'
                or public.is_active_group_member(entry.group_id)
              )
          )
        )
      )
      or (
        p_scope = 'user'
        and entry.user_id = p_target_id
        and entry.visibility = 'public'
      )
      or (
        p_scope = 'group'
        and entry.group_id = p_target_id
        and entry.visibility = 'group'
      )
    )
    and (p_visibility is null or entry.visibility = p_visibility)
    and (
      p_category_slugs is null
      or entry.place_category_slug = any(p_category_slugs)
    )
    and (p_author_id is null or entry.user_id = p_author_id)
    and (
      nullif(btrim(coalesce(p_keyword, '')), '') is null
      or position(
        lower(btrim(p_keyword))
        in lower(concat_ws(
          ' ',
          entry.title,
          entry.content,
          entry.place_name,
          entry.time_label
        ))
      ) > 0
    )
    and (p_include_undated or timeline.event_year is not null)
    and (p_start_year is null or timeline.event_year >= p_start_year)
    and (p_end_year is null or timeline.event_year <= p_end_year)
    and (
      p_capsule_state is null
      or (p_capsule_state = 'current' and entry.unlock_at is null)
      or (
        p_capsule_state = 'past'
        and entry.unlock_at is not null
        and entry.unlock_at <= now()
      )
      or (p_capsule_state = 'future' and entry.unlock_at > now())
    )
  order by
    (timeline.event_year is null) asc,
    case when p_order = 'asc' then timeline.event_year end asc,
    case when p_order <> 'asc' then timeline.event_year end desc,
    case when p_order = 'asc'
      then coalesce(entry.occurred_local, entry.occurred_date::timestamp)
    end asc nulls last,
    case when p_order <> 'asc'
      then coalesce(entry.occurred_local, entry.occurred_date::timestamp)
    end desc nulls last,
    case when p_order = 'asc' then entry.created_at end asc,
    case when p_order <> 'asc' then entry.created_at end desc,
    entry.id asc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 51), 1), 51);
$$;

create or replace function public.protect_routes_for_time_capsule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unlock_at > now()
    and (old.unlock_at is null or old.unlock_at <= now())
  then
    -- A route owned by somebody else must not retain a hidden node whose
    -- node_count would reveal that the newly locked entry still exists.
    delete from public.story_route_items item
    using public.story_routes route
    where item.route_id = route.id
      and item.entry_id = new.id
      and route.created_by <> new.user_id;

    update public.story_routes route
    set
      visibility = 'private',
      group_id = null,
      privacy_downgraded_at = now()
    where route.visibility <> 'private'
      and route.created_by = new.user_id
      and exists (
        select 1
        from public.story_route_items item
        where item.route_id = route.id
          and item.entry_id = new.id
      );
  end if;
  return new;
end;
$$;

drop trigger if exists map_entries_protect_routes_for_capsule
on public.map_entries;
create trigger map_entries_protect_routes_for_capsule
after update of unlock_at on public.map_entries
for each row execute function public.protect_routes_for_time_capsule();

create or replace function public.guard_capsule_story_route_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.map_entries entry
    join public.story_routes route on route.id = new.route_id
    where entry.id = new.entry_id
      and entry.unlock_at > now()
      and (
        route.visibility <> 'private'
        or route.created_by <> entry.user_id
      )
  ) then
    raise exception using
      errcode = '42501',
      message = 'locked capsule is only eligible for its owner private route';
  end if;
  return new;
end;
$$;

drop trigger if exists story_route_items_guard_capsule
on public.story_route_items;
create trigger story_route_items_guard_capsule
before insert or update on public.story_route_items
for each row execute function public.guard_capsule_story_route_item();

revoke all on function public.can_read_entry(uuid) from public;
revoke all on function public.can_collaborate_entry(uuid) from public;
revoke all on function public.can_edit_entry_field(uuid, text) from public;
revoke all on function public.can_read_entry_edit_log(uuid, timestamptz) from public;
revoke all on function public.can_interact_entry(uuid) from public;
revoke all on function public.create_entry_v11(jsonb, text[]) from public, anon;
revoke all on function public.update_entry_v11(uuid, jsonb, text[]) from public, anon;
revoke all on function public.get_social_feed_v11(timestamptz, uuid, integer)
from public, anon;
revoke all on function public.get_timeline_entries_v11(
  text, uuid, text, text, text[], uuid, text,
  integer, integer, boolean, text, integer, integer
) from public;
revoke all on function public.protect_routes_for_time_capsule() from public;
revoke all on function public.guard_capsule_story_route_item() from public;

grant execute on function public.can_read_entry(uuid) to anon, authenticated;
grant execute on function public.can_collaborate_entry(uuid) to authenticated;
grant execute on function public.can_edit_entry_field(uuid, text) to authenticated;
grant execute on function public.can_read_entry_edit_log(uuid, timestamptz)
to authenticated;
grant execute on function public.can_interact_entry(uuid) to authenticated;
grant execute on function public.create_entry_v11(jsonb, text[]) to authenticated;
grant execute on function public.update_entry_v11(uuid, jsonb, text[])
to authenticated;
grant execute on function public.get_social_feed_v11(timestamptz, uuid, integer)
to authenticated;
grant execute on function public.get_timeline_entries_v11(
  text, uuid, text, text, text[], uuid, text,
  integer, integer, boolean, text, integer, integer
) to anon, authenticated;

comment on function public.can_read_entry(uuid) is
  'Canonical entry read boundary. Future capsules require creator identity; group creators also require active membership.';
comment on function public.create_entry_v11(jsonb, text[]) is
  'Creates a legacy-compatible entry plus an optional future unlock instant.';
comment on function public.update_entry_v11(uuid, jsonb, text[]) is
  'Updates entries while reserving unlock_at changes for the creator.';

notify pgrst, 'reload schema';
