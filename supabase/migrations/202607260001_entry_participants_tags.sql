-- Entry participants, field-scoped collaboration, immutable edit history,
-- free-form tags, privacy-safe tag aggregation, and Realtime refresh support.
-- This migration is additive and preserves map_entries.user_id as the owner.

do $$
begin
  if to_regclass('public.map_entries') is null
    or to_regclass('public.profiles') is null
    or to_regclass('public.group_members') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null
    or to_regprocedure('public.is_active_group_member(uuid)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'entry collaboration requires all migrations through 202607250003';
  end if;
end;
$$;

create table public.entry_participants (
  entry_id uuid not null references public.map_entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending',
  editable_fields text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  revoked_at timestamptz,
  primary key (entry_id, user_id),
  constraint entry_participants_status_values
    check (status in ('pending', 'accepted', 'declined', 'revoked')),
  constraint entry_participants_editable_fields_values check (
    editable_fields <@ array[
      'title', 'content', 'place', 'location', 'time', 'category', 'tags'
    ]::text[]
    and cardinality(editable_fields) <= 7
  ),
  constraint entry_participants_status_time_consistency check (
    (status = 'pending' and responded_at is null and revoked_at is null)
    or (status = 'accepted' and responded_at is not null and revoked_at is null)
    or (status = 'declined' and responded_at is not null and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  )
);

create table public.entry_edit_logs (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.map_entries(id) on delete cascade,
  editor_id uuid references public.profiles(id) on delete set null,
  changed_fields text[] not null,
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint entry_edit_logs_changed_fields_not_empty
    check (cardinality(changed_fields) between 1 and 32),
  constraint entry_edit_logs_values_are_objects
    check (
      jsonb_typeof(old_values) = 'object'
      and jsonb_typeof(new_values) = 'object'
    )
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name varchar(40) not null,
  normalized_name text not null unique,
  slug text not null unique
    default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint tags_name_not_blank
    check (char_length(btrim(name)) between 1 and 40),
  constraint tags_normalized_name_not_blank
    check (char_length(normalized_name) between 1 and 40),
  constraint tags_slug_format
    check (slug ~ '^[a-f0-9]{20}$')
);

create table public.entry_tags (
  entry_id uuid not null references public.map_entries(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (entry_id, tag_id)
);

create index entry_participants_user_status_idx
  on public.entry_participants(user_id, status, updated_at desc);
create index entry_participants_entry_status_idx
  on public.entry_participants(entry_id, status);
create index entry_edit_logs_entry_created_idx
  on public.entry_edit_logs(entry_id, created_at desc, id desc);
create index entry_edit_logs_editor_created_idx
  on public.entry_edit_logs(editor_id, created_at desc);
create index entry_tags_tag_entry_idx
  on public.entry_tags(tag_id, entry_id);
create index tags_normalized_name_idx
  on public.tags(normalized_name);

create trigger entry_participants_set_updated_at
before update on public.entry_participants
for each row execute function public.set_updated_at();

create or replace function public.normalize_tag_name(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(coalesce(value, '')),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.normalize_tag_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := pg_catalog.regexp_replace(
    pg_catalog.btrim(new.name),
    '[[:space:]]+',
    ' ',
    'g'
  );
  new.normalized_name := public.normalize_tag_name(new.name);
  if char_length(new.name) not between 1 and 40 then
    raise exception using errcode = '23514', message = 'invalid tag name';
  end if;
  return new;
end;
$$;

create trigger tags_normalize_before_write
before insert or update of name on public.tags
for each row execute function public.normalize_tag_before_write();

create or replace function public.is_accepted_entry_participant(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.entry_participants participant
    where participant.entry_id = p_entry_id
      and participant.user_id = (select auth.uid())
      and participant.status = 'accepted'
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
        or exists (
          select 1
          from public.entry_participants participant
          where participant.entry_id = entry.id
            and participant.user_id = (select auth.uid())
            and participant.status = 'accepted'
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
        or exists (
          select 1
          from public.entry_participants participant
          where participant.entry_id = entry.id
            and participant.user_id = (select auth.uid())
            and participant.status = 'accepted'
            and p_field = any(participant.editable_fields)
        )
      )
  );
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
        or exists (
          select 1
          from public.entry_participants participant
          where participant.entry_id = entry.id
            and participant.user_id = (select auth.uid())
            and participant.status = 'accepted'
            and participant.responded_at <= p_created_at
        )
      )
  );
$$;

create or replace function public.can_read_tag(p_tag_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.entry_tags entry_tag
    where entry_tag.tag_id = p_tag_id
      and public.can_read_entry(entry_tag.entry_id)
  );
$$;

create or replace function public.invite_entry_participant(
  p_entry_id uuid,
  p_invitee_id uuid,
  p_editable_fields text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  entry_row public.map_entries%rowtype;
  normalized_fields text[];
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select * into entry_row
  from public.map_entries
  where id = p_entry_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'entry not found';
  end if;
  if entry_row.user_id <> actor then
    raise exception using errcode = '42501', message = 'entry owner required';
  end if;
  if p_invitee_id = actor then
    raise exception using errcode = '23514', message = 'cannot invite entry owner';
  end if;
  if not exists (select 1 from public.profiles where id = p_invitee_id) then
    raise exception using errcode = 'P0002', message = 'invitee not found';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_editable_fields, '{}'::text[])) field_name
    where field_name not in (
      'title', 'content', 'place', 'location', 'time', 'category', 'tags'
    )
  ) then
    raise exception using errcode = '22023', message = 'invalid editable entry field';
  end if;
  if entry_row.visibility = 'group' and not exists (
    select 1
    from public.group_members membership
    where membership.group_id = entry_row.group_id
      and membership.user_id = p_invitee_id
      and membership.status = 'active'
  ) then
    raise exception using
      errcode = '42501',
      message = 'invitee must be an active group member';
  end if;
  if exists (
    select 1
    from public.entry_participants participant
    where participant.entry_id = p_entry_id
      and participant.user_id = p_invitee_id
      and participant.status = 'accepted'
  ) then
    raise exception using errcode = '23505', message = 'participant already accepted';
  end if;

  select coalesce(array_agg(distinct field_name order by field_name), '{}'::text[])
  into normalized_fields
  from unnest(coalesce(p_editable_fields, '{}'::text[])) field_name;

  insert into public.entry_participants (
    entry_id,
    user_id,
    invited_by,
    status,
    editable_fields
  )
  values (
    p_entry_id,
    p_invitee_id,
    actor,
    'pending',
    normalized_fields
  )
  on conflict (entry_id, user_id) do update
  set
    invited_by = excluded.invited_by,
    status = 'pending',
    editable_fields = excluded.editable_fields,
    responded_at = null,
    revoked_at = null,
    updated_at = now();
end;
$$;

create or replace function public.respond_entry_participant_invitation(
  p_entry_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  entry_row public.map_entries%rowtype;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  perform 1
  from public.entry_participants participant
  where participant.entry_id = p_entry_id
    and participant.user_id = actor
    and participant.status = 'pending'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pending invitation not found';
  end if;

  select * into entry_row
  from public.map_entries
  where id = p_entry_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'entry not found';
  end if;
  if p_accept and entry_row.visibility = 'group'
    and not public.is_active_group_member(entry_row.group_id)
  then
    raise exception using
      errcode = '42501',
      message = 'active group membership required';
  end if;

  update public.entry_participants
  set
    status = case when p_accept then 'accepted' else 'declined' end,
    responded_at = now(),
    revoked_at = null,
    updated_at = now()
  where entry_id = p_entry_id
    and user_id = actor;
end;
$$;

create or replace function public.revoke_entry_participant(
  p_entry_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.map_entries
    where id = p_entry_id
      and user_id = (select auth.uid())
  ) then
    raise exception using errcode = '42501', message = 'entry owner required';
  end if;

  update public.entry_participants
  set
    status = 'revoked',
    revoked_at = now(),
    updated_at = now()
  where entry_id = p_entry_id
    and user_id = p_user_id
    and status <> 'revoked';
  if not found then
    raise exception using errcode = 'P0002', message = 'participant not found';
  end if;
end;
$$;

create or replace function public.update_entry_participant_permissions(
  p_entry_id uuid,
  p_user_id uuid,
  p_editable_fields text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_fields text[];
begin
  if not exists (
    select 1
    from public.map_entries
    where id = p_entry_id
      and user_id = (select auth.uid())
  ) then
    raise exception using errcode = '42501', message = 'entry owner required';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_editable_fields, '{}'::text[])) field_name
    where field_name not in (
      'title', 'content', 'place', 'location', 'time', 'category', 'tags'
    )
  ) then
    raise exception using errcode = '22023', message = 'invalid editable entry field';
  end if;

  select coalesce(array_agg(distinct field_name order by field_name), '{}'::text[])
  into normalized_fields
  from unnest(coalesce(p_editable_fields, '{}'::text[])) field_name;

  update public.entry_participants
  set editable_fields = normalized_fields, updated_at = now()
  where entry_id = p_entry_id
    and user_id = p_user_id
    and status in ('pending', 'accepted');
  if not found then
    raise exception using errcode = 'P0002', message = 'active invitation not found';
  end if;
end;
$$;

create or replace function public.log_map_entry_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb;
  new_row jsonb;
  changed text[];
begin
  old_row := to_jsonb(old)
    - 'id' - 'user_id' - 'created_at' - 'updated_at';
  new_row := to_jsonb(new)
    - 'id' - 'user_id' - 'created_at' - 'updated_at';

  select coalesce(array_agg(key order by key), '{}'::text[])
  into changed
  from jsonb_object_keys(new_row) key
  where old_row -> key is distinct from new_row -> key;

  if cardinality(changed) > 0 then
    insert into public.entry_edit_logs (
      entry_id,
      editor_id,
      changed_fields,
      old_values,
      new_values
    )
    select
      new.id,
      (select auth.uid()),
      changed,
      coalesce(jsonb_object_agg(key, old_row -> key), '{}'::jsonb),
      coalesce(jsonb_object_agg(key, new_row -> key), '{}'::jsonb)
    from unnest(changed) key;
  end if;
  return new;
end;
$$;

create trigger map_entries_log_edit
after update on public.map_entries
for each row execute function public.log_map_entry_edit();

create or replace function public.replace_entry_tags(
  p_entry_id uuid,
  p_tag_names text[],
  p_actor uuid,
  p_log_change boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_names text[];
  new_names text[];
begin
  if cardinality(coalesce(p_tag_names, '{}'::text[])) > 10 then
    raise exception using errcode = '23514', message = 'an entry can have at most 10 tags';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_tag_names, '{}'::text[])) raw_name
    where char_length(
      pg_catalog.regexp_replace(
        pg_catalog.btrim(raw_name),
        '[[:space:]]+',
        ' ',
        'g'
      )
    ) not between 1 and 40
  ) then
    raise exception using errcode = '23514', message = 'invalid tag name';
  end if;

  select coalesce(array_agg(tag.name order by tag.normalized_name), '{}'::text[])
  into old_names
  from public.entry_tags entry_tag
  join public.tags tag on tag.id = entry_tag.tag_id
  where entry_tag.entry_id = p_entry_id;

  with prepared as (
    select distinct on (public.normalize_tag_name(raw_name))
      pg_catalog.regexp_replace(
        pg_catalog.btrim(raw_name),
        '[[:space:]]+',
        ' ',
        'g'
      ) as name,
      public.normalize_tag_name(raw_name) as normalized_name
    from unnest(coalesce(p_tag_names, '{}'::text[])) raw_name
    order by public.normalize_tag_name(raw_name), raw_name
  )
  insert into public.tags (name, normalized_name, created_by)
  select prepared.name, prepared.normalized_name, p_actor
  from prepared
  where prepared.normalized_name <> ''
  on conflict (normalized_name) do nothing;

  delete from public.entry_tags
  where entry_id = p_entry_id;

  insert into public.entry_tags (entry_id, tag_id, added_by)
  select p_entry_id, tag.id, p_actor
  from public.tags tag
  where tag.normalized_name in (
    select public.normalize_tag_name(raw_name)
    from unnest(coalesce(p_tag_names, '{}'::text[])) raw_name
  )
  on conflict (entry_id, tag_id) do nothing;

  select coalesce(array_agg(tag.name order by tag.normalized_name), '{}'::text[])
  into new_names
  from public.entry_tags entry_tag
  join public.tags tag on tag.id = entry_tag.tag_id
  where entry_tag.entry_id = p_entry_id;

  if p_log_change and old_names is distinct from new_names then
    insert into public.entry_edit_logs (
      entry_id,
      editor_id,
      changed_fields,
      old_values,
      new_values
    )
    values (
      p_entry_id,
      p_actor,
      array['tags'],
      jsonb_build_object('tags', to_jsonb(old_names)),
      jsonb_build_object('tags', to_jsonb(new_names))
    );
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
    coalesce(p_entry ->> 'visibility', 'private'),
    (p_entry ->> 'group_id')::uuid,
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
    visibility = case when p_patch ? 'visibility' then p_patch ->> 'visibility' else visibility end,
    group_id = case when p_patch ? 'group_id' then (p_patch ->> 'group_id')::uuid else group_id end,
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

create or replace function public.set_entry_tags(
  p_entry_id uuid,
  p_tag_names text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not public.can_edit_entry_field(p_entry_id, 'tags') then
    raise exception using errcode = '42501', message = 'tag edit permission required';
  end if;
  perform public.replace_entry_tags(
    p_entry_id,
    coalesce(p_tag_names, '{}'::text[]),
    actor,
    true
  );
end;
$$;

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

create or replace function public.get_tag_entries(
  p_tag_slug text,
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
  from public.tags tag
  join public.entry_tags entry_tag on entry_tag.tag_id = tag.id
  join public.map_entries entry on entry.id = entry_tag.entry_id
  where tag.slug = p_tag_slug
    and public.can_read_entry(entry.id)
  order by entry.updated_at desc, entry.id desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 51), 1), 51);
$$;

create or replace function public.get_visible_tag_summary(p_tag_slug text)
returns table (
  slug text,
  name text,
  entry_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select tag.slug, tag.name::text, count(*)::bigint
  from public.tags tag
  join public.entry_tags entry_tag on entry_tag.tag_id = tag.id
  join public.map_entries entry on entry.id = entry_tag.entry_id
  where tag.slug = p_tag_slug
    and public.can_read_entry(entry.id)
  group by tag.id, tag.slug, tag.name;
$$;

alter table public.entry_participants enable row level security;
alter table public.entry_edit_logs enable row level security;
alter table public.tags enable row level security;
alter table public.entry_tags enable row level security;

drop policy if exists "entries_visible_by_visibility_model"
on public.map_entries;

create policy "entries_visible_by_visibility_model"
on public.map_entries for select to anon, authenticated
using (public.can_read_entry(id));

create policy "entry_participants_visible_to_related_users"
on public.entry_participants for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.map_entries entry
    where entry.id = entry_id
      and entry.user_id = (select auth.uid())
  )
);

create policy "entry_edit_logs_visible_to_current_collaborators"
on public.entry_edit_logs for select to authenticated
using (public.can_read_entry_edit_log(entry_id, created_at));

create policy "tags_visible_with_readable_entries"
on public.tags for select to anon, authenticated
using (public.can_read_tag(id));

create policy "entry_tags_visible_with_entry"
on public.entry_tags for select to anon, authenticated
using (public.can_read_entry(entry_id));

grant select on public.entry_participants to authenticated;
grant select on public.entry_edit_logs to authenticated;
grant select on public.tags to anon, authenticated;
grant select on public.entry_tags to anon, authenticated;

revoke all on function public.normalize_tag_name(text) from public;
revoke all on function public.normalize_tag_before_write() from public;
revoke all on function public.is_accepted_entry_participant(uuid) from public;
revoke all on function public.can_collaborate_entry(uuid) from public;
revoke all on function public.can_edit_entry_field(uuid, text) from public;
revoke all on function public.can_read_entry_edit_log(uuid, timestamptz) from public;
revoke all on function public.can_read_tag(uuid) from public;
revoke all on function public.invite_entry_participant(uuid, uuid, text[]) from public;
revoke all on function public.respond_entry_participant_invitation(uuid, boolean) from public;
revoke all on function public.revoke_entry_participant(uuid, uuid) from public;
revoke all on function public.update_entry_participant_permissions(uuid, uuid, text[]) from public;
revoke all on function public.log_map_entry_edit() from public;
revoke all on function public.replace_entry_tags(uuid, text[], uuid, boolean) from public;
revoke all on function public.create_entry(jsonb, text[]) from public;
revoke all on function public.update_entry(uuid, jsonb, text[]) from public;
revoke all on function public.set_entry_tags(uuid, text[]) from public;
revoke all on function public.get_tag_entries(text, integer, integer) from public;
revoke all on function public.get_visible_tag_summary(text) from public;

grant execute on function public.is_accepted_entry_participant(uuid) to authenticated;
grant execute on function public.can_collaborate_entry(uuid) to authenticated;
grant execute on function public.can_edit_entry_field(uuid, text) to authenticated;
grant execute on function public.invite_entry_participant(uuid, uuid, text[]) to authenticated;
grant execute on function public.respond_entry_participant_invitation(uuid, boolean) to authenticated;
grant execute on function public.revoke_entry_participant(uuid, uuid) to authenticated;
grant execute on function public.update_entry_participant_permissions(uuid, uuid, text[]) to authenticated;
grant execute on function public.create_entry(jsonb, text[]) to authenticated;
grant execute on function public.update_entry(uuid, jsonb, text[]) to authenticated;
grant execute on function public.set_entry_tags(uuid, text[]) to authenticated;
grant execute on function public.get_tag_entries(text, integer, integer) to anon, authenticated;
grant execute on function public.get_visible_tag_summary(text) to anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'map_entries',
    'entry_participants',
    'entry_tags',
    'entry_edit_logs'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end;
$$;

comment on table public.entry_participants is
  'Entry-scoped invitations and accepted collaborators. map_entries.user_id remains the sole owner.';
comment on column public.entry_participants.editable_fields is
  'Logical field groups enforced by update_entry; access fields and deletion are never delegated.';
comment on table public.entry_edit_logs is
  'Immutable database-generated entry and tag edit history.';
comment on table public.tags is
  'Free-form normalized tags. RLS exposes a tag only through at least one readable entry.';
comment on function public.update_entry(uuid, jsonb, text[]) is
  'Controlled field-scoped update path for owners and accepted participants.';

notify pgrst, 'reload schema';
