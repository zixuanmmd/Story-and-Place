-- Story-and-Place v1.3: owner-only server drafts and optimistic autosave.
--
-- map_entries continues to represent published stories. Unpublished form state
-- lives in this separate table so existing public, group, feed, route, tag and
-- search queries cannot accidentally include drafts.

do $$
begin
  if to_regclass('public.map_entries') is null
    or to_regclass('public.profiles') is null
    or to_regprocedure('public.create_entry_v11(jsonb,text[])') is null
    or to_regprocedure('public.update_entry_v11(uuid,jsonb,text[])') is null
  then
    raise exception using
      errcode = '55000',
      message = 'v1.3 entry drafts require all migrations through 202608080001';
  end if;
end;
$$;

create table if not exists public.entry_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_entry_id uuid references public.map_entries(id) on delete cascade,
  source_updated_at timestamptz,
  payload jsonb,
  tag_input text not null default '',
  revision bigint not null default 1,
  client_instance_id uuid not null,
  status text not null default 'draft',
  published_entry_id uuid references public.map_entries(id) on delete set null,
  published_at timestamptz,
  discarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entry_drafts_status_values
    check (status in ('draft', 'published', 'discarded')),
  constraint entry_drafts_revision_positive check (revision > 0),
  constraint entry_drafts_tag_input_length check (char_length(tag_input) <= 500),
  constraint entry_drafts_payload_lifecycle check (
    (status = 'draft' and payload is not null and published_at is null and discarded_at is null)
    or (status = 'published' and payload is null and published_at is not null and discarded_at is null)
    or (status = 'discarded' and payload is null and published_at is null and discarded_at is not null)
  ),
  constraint entry_drafts_source_snapshot_consistency check (
    (source_entry_id is null and source_updated_at is null)
    or (source_entry_id is not null and source_updated_at is not null)
  )
);

create unique index if not exists entry_drafts_active_source_unique_idx
  on public.entry_drafts(user_id, source_entry_id)
  where status = 'draft' and source_entry_id is not null;

create index if not exists entry_drafts_user_status_updated_idx
  on public.entry_drafts(user_id, status, updated_at desc, id desc);

create index if not exists entry_drafts_source_idx
  on public.entry_drafts(source_entry_id)
  where source_entry_id is not null;

create or replace function public.validate_entry_draft_payload(p_payload jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  values_object jsonb;
  key text;
begin
  if jsonb_typeof(p_payload) <> 'object'
    or p_payload ->> 'version' <> '1'
    or jsonb_typeof(p_payload -> 'values') <> 'object'
  then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_payload) envelope_key
    where envelope_key not in ('version', 'values')
  ) then
    return false;
  end if;

  values_object := p_payload -> 'values';
  if not values_object ?& array[
    'title', 'content', 'place_name', 'latitude', 'longitude',
    'time_precision', 'time_value', 'occurred_timezone', 'visibility',
    'group_id', 'place_category_slug', 'allow_comments', 'unlock_at'
  ] then
    return false;
  end if;
  for key in select jsonb_object_keys(values_object)
  loop
    if key not in (
      'title', 'content', 'place_name', 'latitude', 'longitude',
      'time_precision', 'time_value', 'occurred_timezone', 'visibility',
      'group_id', 'place_category_slug', 'allow_comments', 'unlock_at'
    ) then
      return false;
    end if;
  end loop;

  if jsonb_typeof(values_object -> 'title') <> 'string'
    or char_length(values_object ->> 'title') > 100
    or jsonb_typeof(values_object -> 'content') <> 'string'
    or char_length(values_object ->> 'content') > 5000
    or jsonb_typeof(values_object -> 'place_name') <> 'string'
    or char_length(values_object ->> 'place_name') > 200
    or jsonb_typeof(values_object -> 'time_precision') <> 'string'
    or values_object ->> 'time_precision' not in ('exact', 'date', 'month', 'year', 'approximate')
    or jsonb_typeof(values_object -> 'time_value') <> 'string'
    or char_length(values_object ->> 'time_value') > 120
    or jsonb_typeof(values_object -> 'occurred_timezone') <> 'string'
    or char_length(values_object ->> 'occurred_timezone') > 100
    or jsonb_typeof(values_object -> 'visibility') <> 'string'
    or values_object ->> 'visibility' not in ('public', 'private', 'group')
    or jsonb_typeof(values_object -> 'group_id') <> 'string'
    or char_length(values_object ->> 'group_id') > 36
    or jsonb_typeof(values_object -> 'place_category_slug') <> 'string'
    or values_object ->> 'place_category_slug' not in (
      'home', 'school', 'work', 'food', 'transport', 'street',
      'nature', 'landmark', 'medical', 'travel', 'memorial', 'other'
    )
    or jsonb_typeof(values_object -> 'allow_comments') <> 'boolean'
    or jsonb_typeof(values_object -> 'unlock_at') <> 'string'
    or char_length(values_object ->> 'unlock_at') > 32
  then
    return false;
  end if;

  if jsonb_typeof(values_object -> 'latitude') not in ('number', 'null')
    or jsonb_typeof(values_object -> 'longitude') not in ('number', 'null')
  then
    return false;
  end if;
  if jsonb_typeof(values_object -> 'latitude') = 'number'
    and (values_object ->> 'latitude')::double precision not between -90 and 90
  then
    return false;
  end if;
  if jsonb_typeof(values_object -> 'longitude') = 'number'
    and (values_object ->> 'longitude')::double precision not between -180 and 180
  then
    return false;
  end if;

  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.save_entry_draft(
  p_draft_id uuid,
  p_source_entry_id uuid,
  p_payload jsonb,
  p_tag_input text,
  p_expected_revision bigint,
  p_client_instance_id uuid
)
returns public.entry_drafts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  existing public.entry_drafts%rowtype;
  source_updated timestamptz;
  saved public.entry_drafts%rowtype;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if not public.validate_entry_draft_payload(p_payload)
    or char_length(coalesce(p_tag_input, '')) > 500
    or p_client_instance_id is null
  then
    raise exception using errcode = '22023', message = 'invalid draft payload';
  end if;

  if p_draft_id is null then
    if coalesce(p_expected_revision, 0) <> 0 then
      raise exception using errcode = '40001', message = 'draft revision conflict';
    end if;
    if p_source_entry_id is not null then
      select entry.updated_at
      into source_updated
      from public.map_entries entry
      where entry.id = p_source_entry_id
        and entry.user_id = actor;
      if source_updated is null then
        raise exception using errcode = '42501', message = 'source entry ownership required';
      end if;
      if exists (
        select 1
        from public.entry_drafts draft
        where draft.user_id = actor
          and draft.source_entry_id = p_source_entry_id
          and draft.status = 'draft'
      ) then
        raise exception using errcode = '40001', message = 'active draft already exists';
      end if;
    end if;

    insert into public.entry_drafts (
      user_id, source_entry_id, source_updated_at, payload, tag_input,
      revision, client_instance_id
    ) values (
      actor, p_source_entry_id, source_updated, p_payload,
      coalesce(p_tag_input, ''), 1, p_client_instance_id
    )
    returning * into saved;
    return saved;
  end if;

  select * into existing
  from public.entry_drafts draft
  where draft.id = p_draft_id
  for update;

  if not found or existing.user_id <> actor then
    raise exception using errcode = 'P0002', message = 'draft not found';
  end if;
  if existing.status <> 'draft' then
    raise exception using errcode = '55000', message = 'draft is no longer editable';
  end if;
  if existing.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'draft revision conflict';
  end if;
  if existing.source_entry_id is distinct from p_source_entry_id then
    raise exception using errcode = '42501', message = 'draft source cannot change';
  end if;

  update public.entry_drafts
  set
    payload = p_payload,
    tag_input = coalesce(p_tag_input, ''),
    revision = revision + 1,
    client_instance_id = p_client_instance_id,
    updated_at = now()
  where id = existing.id
  returning * into saved;
  return saved;
end;
$$;

create or replace function public.publish_entry_draft(
  p_draft_id uuid,
  p_expected_revision bigint,
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
  draft public.entry_drafts%rowtype;
  current_source_updated timestamptz;
  published public.map_entries%rowtype;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select * into draft
  from public.entry_drafts
  where id = p_draft_id
  for update;

  if not found or draft.user_id <> actor then
    raise exception using errcode = 'P0002', message = 'draft not found';
  end if;
  if draft.status <> 'draft' then
    raise exception using errcode = '55000', message = 'draft is no longer editable';
  end if;
  if draft.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'draft revision conflict';
  end if;

  if draft.source_entry_id is null then
    select * into published
    from public.create_entry_v11(p_entry, coalesce(p_tag_names, '{}'::text[]));
  else
    select entry.updated_at
    into current_source_updated
    from public.map_entries entry
    where entry.id = draft.source_entry_id
      and entry.user_id = actor;
    if current_source_updated is null then
      raise exception using errcode = '42501', message = 'source entry ownership required';
    end if;
    if current_source_updated is distinct from draft.source_updated_at then
      raise exception using errcode = '40001', message = 'source entry changed after draft creation';
    end if;
    select * into published
    from public.update_entry_v11(
      draft.source_entry_id,
      p_entry,
      coalesce(p_tag_names, '{}'::text[])
    );
  end if;

  update public.entry_drafts
  set
    status = 'published',
    payload = null,
    tag_input = '',
    revision = revision + 1,
    published_entry_id = published.id,
    published_at = now(),
    updated_at = now()
  where id = draft.id;

  return published;
end;
$$;

create or replace function public.discard_entry_draft(p_draft_id uuid)
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
  update public.entry_drafts
  set
    status = 'discarded',
    payload = null,
    tag_input = '',
    discarded_at = now(),
    updated_at = now(),
    revision = revision + 1
  where id = p_draft_id
    and user_id = actor
    and status = 'draft';
  if not found then
    raise exception using errcode = 'P0002', message = 'draft not found';
  end if;
end;
$$;

alter table public.entry_drafts enable row level security;

create policy "entry_drafts_owner_select"
on public.entry_drafts for select to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.entry_drafts from public, anon, authenticated;
grant select on table public.entry_drafts to authenticated;

revoke all on function public.validate_entry_draft_payload(jsonb) from public;
revoke all on function public.save_entry_draft(uuid, uuid, jsonb, text, bigint, uuid) from public;
revoke all on function public.publish_entry_draft(uuid, bigint, jsonb, text[]) from public;
revoke all on function public.discard_entry_draft(uuid) from public;

grant execute on function public.save_entry_draft(uuid, uuid, jsonb, text, bigint, uuid)
to authenticated;
grant execute on function public.publish_entry_draft(uuid, bigint, jsonb, text[])
to authenticated;
grant execute on function public.discard_entry_draft(uuid)
to authenticated;

comment on table public.entry_drafts is
  'Owner-only unpublished form state. map_entries remains the published-story boundary used by all discovery features.';
comment on column public.entry_drafts.revision is
  'Optimistic concurrency token; every autosave, publish or discard increments it.';
comment on column public.entry_drafts.source_updated_at is
  'Snapshot of an edited published entry, preventing a stale draft from overwriting later changes.';

notify pgrst, 'reload schema';
