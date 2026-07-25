-- Story timelines and shareable story routes.
-- Requires the social/group migration because route visibility reuses its
-- membership and entry-read permission helpers.

do $$
begin
  if to_regclass('public.groups') is null
    or to_regclass('public.group_members') is null
    or to_regclass('public.map_entries') is null
    or to_regprocedure('public.is_active_group_member(uuid)') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'story routes require migration 202607230001_groups_social_categories.sql';
  end if;
end;
$$;

create table public.story_routes (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete restrict,
  title varchar(100) not null,
  description varchar(2000) not null default '',
  visibility text not null default 'private',
  share_slug text not null unique
    default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
  published_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  featured_at timestamptz,
  featured_by uuid references public.profiles(id) on delete set null,
  privacy_downgraded_at timestamptz,
  node_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint story_routes_title_not_blank check (char_length(btrim(title)) between 1 and 100),
  constraint story_routes_description_length check (char_length(description) <= 2000),
  constraint story_routes_visibility_values check (visibility in ('public', 'private', 'group')),
  constraint story_routes_group_visibility_consistency check (
    (visibility = 'group' and group_id is not null)
    or (visibility <> 'group' and group_id is null)
  ),
  constraint story_routes_node_count_range check (node_count between 0 and 200),
  constraint story_routes_archive_actor_consistency check (
    (archived_at is null and archived_by is null)
    or (archived_at is not null and archived_by is not null)
  ),
  constraint story_routes_feature_actor_consistency check (
    (featured_at is null and featured_by is null)
    or (featured_at is not null and featured_by is not null)
  )
);

create table public.story_route_items (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.story_routes(id) on delete cascade,
  entry_id uuid not null references public.map_entries(id) on delete cascade,
  position integer not null,
  note varchar(500) not null default '',
  created_at timestamptz not null default now(),
  constraint story_route_items_position_range check (position between 1 and 200),
  constraint story_route_items_note_length check (char_length(note) <= 500),
  constraint story_route_items_route_entry_unique unique (route_id, entry_id),
  constraint story_route_items_route_position_unique unique (route_id, position)
);

create index story_routes_creator_updated_idx
  on public.story_routes(created_by, updated_at desc, id desc);
create index story_routes_group_published_idx
  on public.story_routes(group_id, published_at desc, id desc)
  where visibility = 'group' and archived_at is null;
create index story_routes_public_published_idx
  on public.story_routes(published_at desc, id desc)
  where visibility = 'public' and archived_at is null and published_at is not null;
create index story_route_items_route_position_idx
  on public.story_route_items(route_id, position);
create index story_route_items_entry_idx
  on public.story_route_items(entry_id);

create index if not exists map_entries_owner_timeline_idx
  on public.map_entries(user_id, occurred_year, occurred_date, created_at desc, id desc);
create index if not exists map_entries_group_timeline_idx
  on public.map_entries(group_id, occurred_year, occurred_date, created_at desc, id desc)
  where visibility = 'group';

create or replace function public.get_timeline_entries(
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
  p_offset integer default 0,
  p_limit integer default 51
)
returns setof public.map_entries
language sql
stable
security invoker
set search_path = ''
as $$
  select e.*
  from public.map_entries e
  cross join lateral (
    select coalesce(
      e.occurred_year,
      case
        when e.time_precision = 'approximate' then
          (
            regexp_match(
              e.time_label,
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
        and e.user_id = p_target_id
      )
      or (
        p_scope = 'user'
        and e.user_id = p_target_id
        and e.visibility = 'public'
      )
      or (
        p_scope = 'group'
        and e.group_id = p_target_id
        and e.visibility = 'group'
      )
    )
    and (p_visibility is null or e.visibility = p_visibility)
    and (
      p_category_slugs is null
      or e.place_category_slug = any(p_category_slugs)
    )
    and (p_author_id is null or e.user_id = p_author_id)
    and (
      nullif(btrim(coalesce(p_keyword, '')), '') is null
      or position(
        lower(btrim(p_keyword))
        in lower(concat_ws(' ', e.title, e.content, e.place_name, e.time_label))
      ) > 0
    )
    and (p_include_undated or timeline.event_year is not null)
    and (p_start_year is null or timeline.event_year >= p_start_year)
    and (p_end_year is null or timeline.event_year <= p_end_year)
  order by
    (timeline.event_year is null) asc,
    case when p_order = 'asc' then timeline.event_year end asc,
    case when p_order <> 'asc' then timeline.event_year end desc,
    case when p_order = 'asc' then coalesce(e.occurred_local, e.occurred_date::timestamp) end asc nulls last,
    case when p_order <> 'asc' then coalesce(e.occurred_local, e.occurred_date::timestamp) end desc nulls last,
    case when p_order = 'asc' then e.created_at end asc,
    case when p_order <> 'asc' then e.created_at end desc,
    e.id asc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 51), 1), 51);
$$;

create trigger story_routes_set_updated_at
before update on public.story_routes
for each row execute function public.set_updated_at();

create or replace function public.can_view_story_route(p_route_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.story_routes r
    where r.id = p_route_id
      and (
        (
          r.visibility = 'private'
          and r.created_by = (select auth.uid())
        )
        or (
          r.visibility = 'public'
          and (
            r.created_by = (select auth.uid())
            or (
              r.published_at is not null
              and r.archived_at is null
            )
          )
        )
        or (
          r.visibility = 'group'
          and public.is_active_group_member(r.group_id)
          and (
            r.created_by = (select auth.uid())
            or r.published_at is not null
          )
        )
      )
  );
$$;

create or replace function public.can_read_story_route_item(
  p_route_id uuid,
  p_entry_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_view_story_route(p_route_id)
    and public.can_read_entry(p_entry_id);
$$;

create or replace function public.save_story_route(
  p_route_id uuid,
  p_title text,
  p_description text,
  p_visibility text,
  p_group_id uuid,
  p_publish boolean,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target_route_id uuid := p_route_id;
  item_count integer;
  valid_count integer;
  existing public.story_routes%rowtype;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 100 then
    raise exception using errcode = '23514', message = 'invalid route title';
  end if;
  if char_length(coalesce(p_description, '')) > 2000 then
    raise exception using errcode = '23514', message = 'route description too long';
  end if;
  if p_visibility not in ('public', 'private', 'group') then
    raise exception using errcode = '23514', message = 'invalid route visibility';
  end if;
  if (p_visibility = 'group') <> (p_group_id is not null) then
    raise exception using errcode = '23514', message = 'route group does not match visibility';
  end if;
  if p_visibility = 'group' and (
    not public.is_active_group_member(p_group_id)
    or exists (
      select 1 from public.groups
      where id = p_group_id and archived_at is not null
    )
  ) then
    raise exception using errcode = '42501', message = 'active group membership required';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'route items must be an array';
  end if;

  select count(*) into item_count
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb));
  if item_count < 1 or item_count > 200 then
    raise exception using errcode = '23514', message = 'route must contain between 1 and 200 items';
  end if;
  if p_publish and item_count < 2 then
    raise exception using errcode = '23514', message = 'published route requires at least two items';
  end if;

  if (
    select count(distinct (item->>'entry_id'))
    from jsonb_array_elements(p_items) item
  ) <> item_count or (
    select count(distinct (item->>'position')::integer)
    from jsonb_array_elements(p_items) item
    where (item->>'position') ~ '^[0-9]+$'
  ) <> item_count then
    raise exception using errcode = '23505', message = 'route items must be unique';
  end if;

  select count(*) into valid_count
  from jsonb_array_elements(p_items) item
  join public.map_entries e on e.id = (item->>'entry_id')::uuid
  where (item->>'position')::integer between 1 and 200
    and char_length(coalesce(item->>'note', '')) <= 500
    and (
      e.user_id = actor
      or (
        e.visibility = 'group'
        and public.is_active_group_member(e.group_id)
        and (p_visibility <> 'group' or e.group_id = p_group_id)
      )
    )
    and (
      (p_visibility = 'public' and e.visibility = 'public')
      or (p_visibility = 'private' and public.can_read_entry(e.id))
      or (
        p_visibility = 'group'
        and (
          (e.visibility = 'group' and e.group_id = p_group_id)
          or e.visibility = 'public'
        )
        and public.can_read_entry(e.id)
      )
    );
  if valid_count <> item_count then
    raise exception using errcode = '42501', message = 'one or more route items are not eligible';
  end if;

  if target_route_id is null then
    insert into public.story_routes (
      created_by, title, description, visibility, group_id, published_at, node_count
    ) values (
      actor, btrim(p_title), coalesce(p_description, ''), p_visibility, p_group_id,
      case when p_publish then now() else null end, item_count
    )
    returning id into target_route_id;
  else
    select * into existing
    from public.story_routes
    where id = target_route_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'route not found';
    end if;
    if existing.created_by <> actor or existing.archived_at is not null then
      raise exception using errcode = '42501', message = 'route cannot be edited';
    end if;
    if existing.visibility = 'group'
      and not public.is_active_group_member(existing.group_id)
    then
      raise exception using errcode = '42501', message = 'active group membership required';
    end if;
    update public.story_routes
    set title = btrim(p_title),
        description = coalesce(p_description, ''),
        visibility = p_visibility,
        group_id = p_group_id,
        published_at = case
          when p_publish then coalesce(existing.published_at, now())
          else null
        end,
        node_count = item_count,
        privacy_downgraded_at = null
    where id = target_route_id;
    delete from public.story_route_items where route_id = target_route_id;
  end if;

  insert into public.story_route_items (route_id, entry_id, position, note)
  select
    target_route_id,
    (item->>'entry_id')::uuid,
    (item->>'position')::integer,
    coalesce(item->>'note', '')
  from jsonb_array_elements(p_items) item;

  -- Deleting old nodes fires the safety trigger. Restore the intended publish
  -- state and derived count only after the replacement set is complete.
  update public.story_routes
  set node_count = item_count,
      published_at = case
        when p_publish then coalesce(published_at, now())
        else null
      end
  where id = target_route_id;

  return target_route_id;
end;
$$;

create or replace function public.archive_story_route(p_route_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  route_row public.story_routes%rowtype;
begin
  select * into route_row from public.story_routes where id = p_route_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'route not found';
  end if;
  if (
    route_row.created_by <> actor
    or (
      route_row.visibility = 'group'
      and not public.is_active_group_member(route_row.group_id)
    )
  ) and not (
    route_row.visibility = 'group' and public.is_group_admin(route_row.group_id)
  ) then
    raise exception using errcode = '42501', message = 'route cannot be archived';
  end if;
  update public.story_routes
  set archived_at = coalesce(archived_at, now()),
      archived_by = coalesce(archived_by, actor)
  where id = p_route_id;
end;
$$;

create or replace function public.feature_story_route(
  p_route_id uuid,
  p_featured boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  route_group uuid;
begin
  select r.group_id into route_group
  from public.story_routes r
  join public.groups g on g.id = r.group_id
  where r.id = p_route_id
    and r.visibility = 'group'
    and r.archived_at is null
    and g.archived_at is null;
  if route_group is null or not public.is_group_admin(route_group) then
    raise exception using errcode = '42501', message = 'group admin required';
  end if;
  update public.story_routes
  set featured_at = case when p_featured then now() else null end,
      featured_by = case when p_featured then actor else null end
  where id = p_route_id;
end;
$$;

create or replace function public.refresh_story_route_after_item_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining integer;
begin
  select count(*) into remaining
  from public.story_route_items
  where route_id = old.route_id;
  update public.story_routes
  set node_count = remaining,
      published_at = case when remaining < 2 then null else published_at end
  where id = old.route_id;
  return old;
end;
$$;

create trigger story_route_items_refresh_after_delete
after delete on public.story_route_items
for each row execute function public.refresh_story_route_after_item_delete();

create or replace function public.protect_public_story_routes_on_entry_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.visibility = 'public' and new.visibility <> 'public' then
    update public.story_routes r
    set visibility = 'private',
        group_id = null,
        privacy_downgraded_at = now()
    where r.visibility = 'public'
      and exists (
        select 1 from public.story_route_items i
        where i.route_id = r.id and i.entry_id = new.id
      );
  end if;
  return new;
end;
$$;

create trigger map_entries_protect_public_routes
after update of visibility, group_id on public.map_entries
for each row execute function public.protect_public_story_routes_on_entry_change();

alter table public.story_routes enable row level security;
alter table public.story_route_items enable row level security;

create policy "story_routes_visible_by_route_permission"
on public.story_routes for select to anon, authenticated
using (public.can_view_story_route(id));

create policy "story_route_items_visible_with_route_and_entry"
on public.story_route_items for select to anon, authenticated
using (public.can_read_story_route_item(route_id, entry_id));

grant select on public.story_routes to anon, authenticated;
grant select on public.story_route_items to anon, authenticated;

revoke all on function public.can_view_story_route(uuid) from public;
revoke all on function public.can_read_story_route_item(uuid, uuid) from public;
revoke all on function public.save_story_route(uuid, text, text, text, uuid, boolean, jsonb) from public;
revoke all on function public.archive_story_route(uuid) from public;
revoke all on function public.feature_story_route(uuid, boolean) from public;
revoke all on function public.refresh_story_route_after_item_delete() from public;
revoke all on function public.protect_public_story_routes_on_entry_change() from public;
revoke all on function public.get_timeline_entries(
  text, uuid, text, text, text[], uuid, text, integer, integer, boolean, integer, integer
) from public;

grant execute on function public.can_view_story_route(uuid) to anon, authenticated;
grant execute on function public.can_read_story_route_item(uuid, uuid) to anon, authenticated;
grant execute on function public.save_story_route(uuid, text, text, text, uuid, boolean, jsonb) to authenticated;
grant execute on function public.archive_story_route(uuid) to authenticated;
grant execute on function public.feature_story_route(uuid, boolean) to authenticated;
grant execute on function public.get_timeline_entries(
  text, uuid, text, text, text[], uuid, text, integer, integer, boolean, integer, integer
) to anon, authenticated;

comment on table public.story_routes is
  'Independent ordered story routes. Route nodes reference source entries and never copy entry content or coordinates.';
comment on column public.story_routes.privacy_downgraded_at is
  'Set when a public source entry becomes restricted and the route is automatically changed to private.';
comment on table public.story_route_items is
  'Ordered references to map_entries. Direct client writes are intentionally not granted.';

notify pgrst, 'reload schema';
