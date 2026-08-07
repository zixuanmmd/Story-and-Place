-- Story-and-Place v1.1: activate typed tag discovery and public emotions.
--
-- Existing tag write paths remain unchanged. Known emotion names are promoted
-- in place so their entry_tags relationships and legacy /tags/:slug URLs stay
-- valid. Public emotion RPCs deliberately return public entries only.

do $$
begin
  if to_regclass('public.tags') is null
    or to_regclass('public.entry_tags') is null
    or to_regclass('public.map_entries') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null
    or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tags'
        and column_name = 'type'
    )
    or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tags'
        and column_name = 'semantic_key'
    )
  then
    raise exception using
      errcode = '55000',
      message = 'emotion tags require migration 202608040001';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'tags'
      and policyname = 'tags_visible_with_readable_entries'
  ) or not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'entry_tags'
      and policyname = 'entry_tags_visible_with_entry'
  ) then
    raise exception using
      errcode = '55000',
      message = 'emotion tags require the existing tag RLS policies';
  end if;
end;
$$;

-- Preserve existing IDs and slugs when a normal tag already uses one of these
-- names. This keeps every existing entry_tags relationship intact.
insert into public.tags (
  name,
  normalized_name,
  type,
  semantic_key,
  created_by
)
values
  ('孤独', public.normalize_tag_name('孤独'), 'emotion', 'loneliness', null),
  ('重逢', public.normalize_tag_name('重逢'), 'emotion', 'reunion', null),
  ('成长', public.normalize_tag_name('成长'), 'emotion', 'growth', null),
  ('遗憾', public.normalize_tag_name('遗憾'), 'emotion', 'regret', null),
  ('失去', public.normalize_tag_name('失去'), 'emotion', 'loss', null),
  ('希望', public.normalize_tag_name('希望'), 'emotion', 'hope', null),
  ('恐惧', public.normalize_tag_name('恐惧'), 'emotion', 'fear', null)
on conflict (normalized_name) do update
set
  type = excluded.type,
  semantic_key = excluded.semantic_key;

create or replace function public.get_visible_tags(
  p_tag_type text default null,
  p_offset integer default 0,
  p_limit integer default 51
)
returns table (
  slug text,
  name text,
  tag_type text,
  semantic_key text,
  entry_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    tag.slug,
    tag.name::text,
    tag.type,
    tag.semantic_key,
    count(*)::bigint
  from public.tags tag
  join public.entry_tags entry_tag on entry_tag.tag_id = tag.id
  join public.map_entries entry on entry.id = entry_tag.entry_id
  where (
      p_tag_type is null
      or p_tag_type in ('normal', 'emotion', 'theme', 'character', 'event')
        and tag.type = p_tag_type
    )
    and public.can_read_entry(entry.id)
  group by tag.id, tag.slug, tag.name, tag.type, tag.semantic_key
  order by count(*) desc, tag.normalized_name asc, tag.id asc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 51), 1), 51);
$$;

create or replace function public.get_typed_tag_entries(
  p_tag_slug text,
  p_tag_type text default null,
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
    and (
      p_tag_type is null
      or p_tag_type in ('normal', 'emotion', 'theme', 'character', 'event')
        and tag.type = p_tag_type
    )
    and public.can_read_entry(entry.id)
  order by entry.updated_at desc, entry.id desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 51), 1), 51);
$$;

create or replace function public.get_visible_tag_summary_v11(
  p_tag_slug text,
  p_tag_type text default null
)
returns table (
  slug text,
  name text,
  tag_type text,
  semantic_key text,
  entry_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    tag.slug,
    tag.name::text,
    tag.type,
    tag.semantic_key,
    count(*)::bigint
  from public.tags tag
  join public.entry_tags entry_tag on entry_tag.tag_id = tag.id
  join public.map_entries entry on entry.id = entry_tag.entry_id
  where tag.slug = p_tag_slug
    and (
      p_tag_type is null
      or p_tag_type in ('normal', 'emotion', 'theme', 'character', 'event')
        and tag.type = p_tag_type
    )
    and public.can_read_entry(entry.id)
  group by tag.id, tag.slug, tag.name, tag.type, tag.semantic_key;
$$;

create or replace function public.get_public_emotion_entries(
  p_emotion text,
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
  where tag.type = 'emotion'
    and tag.semantic_key = lower(pg_catalog.btrim(p_emotion))
    and entry.visibility = 'public'
    and public.can_read_entry(entry.id)
  order by entry.updated_at desc, entry.id desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 51), 1), 51);
$$;

create or replace function public.get_public_emotion_summary(p_emotion text)
returns table (
  slug text,
  name text,
  tag_type text,
  semantic_key text,
  entry_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    tag.slug,
    tag.name::text,
    tag.type,
    tag.semantic_key,
    count(*)::bigint
  from public.tags tag
  join public.entry_tags entry_tag on entry_tag.tag_id = tag.id
  join public.map_entries entry on entry.id = entry_tag.entry_id
  where tag.type = 'emotion'
    and tag.semantic_key = lower(pg_catalog.btrim(p_emotion))
    and entry.visibility = 'public'
    and public.can_read_entry(entry.id)
  group by tag.id, tag.slug, tag.name, tag.type, tag.semantic_key;
$$;

alter table public.tags enable row level security;
alter table public.entry_tags enable row level security;

revoke all on function public.get_visible_tags(text, integer, integer) from public;
revoke all on function public.get_typed_tag_entries(text, text, integer, integer) from public;
revoke all on function public.get_visible_tag_summary_v11(text, text) from public;
revoke all on function public.get_public_emotion_entries(text, integer, integer) from public;
revoke all on function public.get_public_emotion_summary(text) from public;

grant execute on function public.get_visible_tags(text, integer, integer)
to anon, authenticated;
grant execute on function public.get_typed_tag_entries(text, text, integer, integer)
to anon, authenticated;
grant execute on function public.get_visible_tag_summary_v11(text, text)
to anon, authenticated;
grant execute on function public.get_public_emotion_entries(text, integer, integer)
to anon, authenticated;
grant execute on function public.get_public_emotion_summary(text)
to anon, authenticated;

comment on function public.get_public_emotion_entries(text, integer, integer) is
  'Returns public entries only; authenticated private/group visibility never expands this public emotion page.';
comment on function public.get_visible_tags(text, integer, integer) is
  'Lists tag counts only across entries currently readable by the caller.';

notify pgrst, 'reload schema';
