-- Harden entry write RPCs so their target group scope is validated inside
-- the security-definer boundary before any map_entries write occurs.

create or replace function public.assert_entry_rpc_group_target(
  p_visibility text,
  p_group_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_visibility = 'group' then
    if p_group_id is null then
      raise exception using
        errcode = '23514',
        message = 'group visibility requires group_id';
    end if;
    if not exists (
      select 1
      from public.groups target_group
      where target_group.id = p_group_id
        and target_group.archived_at is null
    ) then
      raise exception using
        errcode = '55000',
        message = 'group is unavailable or archived';
    end if;
    if not public.is_active_group_member(p_group_id) then
      raise exception using
        errcode = '42501',
        message = 'active target group membership required';
    end if;
  elsif p_group_id is not null then
    raise exception using
      errcode = '23514',
      message = 'non-group entries cannot have group_id';
  end if;
end;
$$;

create or replace function public.create_entry(
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
      'group_id', 'place_category_slug', 'allow_comments'
    )
  ) then
    raise exception using errcode = '22023', message = 'entry payload contains restricted fields';
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
    allow_comments
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
    coalesce((p_entry ->> 'allow_comments')::boolean, true)
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

create or replace function public.update_entry(
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
  is_owner boolean;
  target_visibility text;
  target_group_id uuid;
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
      'group_id', 'place_category_slug', 'allow_comments'
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

  is_owner := existing.user_id = actor;
  if not public.can_collaborate_entry(p_entry_id) then
    raise exception using errcode = '42501', message = 'entry collaboration permission required';
  end if;

  if not is_owner and (
    (p_patch ? 'visibility' and (p_patch ->> 'visibility') is distinct from existing.visibility)
    or (
      p_patch ? 'group_id'
      and (p_patch ->> 'group_id')::uuid is distinct from existing.group_id
    )
    or (
      p_patch ? 'allow_comments'
      and (p_patch ->> 'allow_comments')::boolean is distinct from existing.allow_comments
    )
  ) then
    raise exception using
      errcode = '42501',
      message = 'participants cannot change entry access or comment settings';
  end if;

  if not is_owner
    and p_patch ? 'title'
    and (p_patch ->> 'title') is distinct from existing.title
    and not public.can_edit_entry_field(p_entry_id, 'title')
  then
    raise exception using errcode = '42501', message = 'title edit permission required';
  end if;
  if not is_owner
    and p_patch ? 'content'
    and (p_patch ->> 'content') is distinct from existing.content
    and not public.can_edit_entry_field(p_entry_id, 'content')
  then
    raise exception using errcode = '42501', message = 'content edit permission required';
  end if;
  if not is_owner
    and p_patch ? 'place_name'
    and (p_patch ->> 'place_name') is distinct from existing.place_name
    and not public.can_edit_entry_field(p_entry_id, 'place')
  then
    raise exception using errcode = '42501', message = 'place edit permission required';
  end if;
  if not is_owner and (
    (
      p_patch ? 'latitude'
      and (p_patch ->> 'latitude')::double precision is distinct from existing.latitude
    )
    or (
      p_patch ? 'longitude'
      and (p_patch ->> 'longitude')::double precision is distinct from existing.longitude
    )
  ) and not public.can_edit_entry_field(p_entry_id, 'location') then
    raise exception using errcode = '42501', message = 'location edit permission required';
  end if;
  if not is_owner and (
    (
      p_patch ? 'occurred_local'
      and (p_patch ->> 'occurred_local')::timestamp without time zone
        is distinct from existing.occurred_local
    )
    or (
      p_patch ? 'occurred_timezone'
      and (p_patch ->> 'occurred_timezone') is distinct from existing.occurred_timezone
    )
    or (
      p_patch ? 'occurred_date'
      and (p_patch ->> 'occurred_date')::date is distinct from existing.occurred_date
    )
    or (
      p_patch ? 'occurred_year'
      and (p_patch ->> 'occurred_year')::integer is distinct from existing.occurred_year
    )
    or (
      p_patch ? 'time_precision'
      and (p_patch ->> 'time_precision') is distinct from existing.time_precision
    )
    or (
      p_patch ? 'time_label'
      and (p_patch ->> 'time_label') is distinct from existing.time_label
    )
  ) and not public.can_edit_entry_field(p_entry_id, 'time') then
    raise exception using errcode = '42501', message = 'time edit permission required';
  end if;
  if not is_owner
    and p_patch ? 'place_category_slug'
    and (p_patch ->> 'place_category_slug') is distinct from existing.place_category_slug
    and not public.can_edit_entry_field(p_entry_id, 'category')
  then
    raise exception using errcode = '42501', message = 'category edit permission required';
  end if;
  if p_tag_names is not null
    and not is_owner
    and not public.can_edit_entry_field(p_entry_id, 'tags')
  then
    raise exception using errcode = '42501', message = 'tag edit permission required';
  end if;

  target_visibility := case
    when p_patch ? 'visibility' then p_patch ->> 'visibility'
    else existing.visibility
  end;
  target_group_id := case
    when p_patch ? 'group_id' then (p_patch ->> 'group_id')::uuid
    else existing.group_id
  end;
  perform public.assert_entry_rpc_group_target(
    target_visibility,
    target_group_id
  );

  update public.map_entries
  set
    title = case when p_patch ? 'title' then p_patch ->> 'title' else title end,
    content = case when p_patch ? 'content' then p_patch ->> 'content' else content end,
    place_name = case when p_patch ? 'place_name' then p_patch ->> 'place_name' else place_name end,
    latitude = case when p_patch ? 'latitude' then (p_patch ->> 'latitude')::double precision else latitude end,
    longitude = case when p_patch ? 'longitude' then (p_patch ->> 'longitude')::double precision else longitude end,
    occurred_local = case when p_patch ? 'occurred_local' then (p_patch ->> 'occurred_local')::timestamp without time zone else occurred_local end,
    occurred_timezone = case when p_patch ? 'occurred_timezone' then p_patch ->> 'occurred_timezone' else occurred_timezone end,
    occurred_date = case when p_patch ? 'occurred_date' then (p_patch ->> 'occurred_date')::date else occurred_date end,
    occurred_year = case when p_patch ? 'occurred_year' then (p_patch ->> 'occurred_year')::integer else occurred_year end,
    time_precision = case when p_patch ? 'time_precision' then p_patch ->> 'time_precision' else time_precision end,
    time_label = case when p_patch ? 'time_label' then p_patch ->> 'time_label' else time_label end,
    visibility = target_visibility,
    group_id = target_group_id,
    place_category_slug = case when p_patch ? 'place_category_slug' then p_patch ->> 'place_category_slug' else place_category_slug end,
    allow_comments = case when p_patch ? 'allow_comments' then (p_patch ->> 'allow_comments')::boolean else allow_comments end
  where id = p_entry_id
  returning * into updated_entry;

  if p_tag_names is not null then
    perform public.replace_entry_tags(
      p_entry_id,
      p_tag_names,
      actor,
      true
    );
  end if;
  return updated_entry;
end;
$$;

revoke all on function public.assert_entry_rpc_group_target(text, uuid)
from public, anon, authenticated;
revoke all on function public.create_entry(jsonb, text[]) from public, anon;
revoke all on function public.update_entry(uuid, jsonb, text[]) from public, anon;

grant execute on function public.create_entry(jsonb, text[]) to authenticated;
grant execute on function public.update_entry(uuid, jsonb, text[]) to authenticated;

comment on function public.assert_entry_rpc_group_target(text, uuid) is
  'Internal security-definer assertion for active membership in the target entry group.';
comment on function public.create_entry(jsonb, text[]) is
  'Creates an entry after validating payload fields and active membership in any target group.';
comment on function public.update_entry(uuid, jsonb, text[]) is
  'Updates owner or delegated fields after validating the resulting target group scope.';

notify pgrst, 'reload schema';
