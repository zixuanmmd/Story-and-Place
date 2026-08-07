-- Story-and-Place v1.2: public Explore discovery.
--
-- Explore is intentionally a public-only surface. This query never expands
-- to private/group entries for authenticated users and never includes a
-- future time capsule, including when its creator is the caller.

do $$
begin
  if to_regclass('public.map_entries') is null
    or to_regclass('public.tags') is null
    or to_regclass('public.entry_tags') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null
    or to_regprocedure('public.normalize_tag_name(text)') is null
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
      message = 'public Explore requires all migrations through 202608050003';
  end if;
end;
$$;

create index if not exists map_entries_public_explore_idx
  on public.map_entries(created_at desc, id desc)
  where visibility = 'public';

create or replace function public.get_public_explore_entries(
  p_category text default 'all',
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 21
)
returns setof public.map_entries
language sql
stable
security invoker
set search_path = ''
as $$
  select entry.*
  from public.map_entries entry
  where p_category in (
      'all',
      'literature',
      'city-memory',
      'travel',
      'science-fiction',
      'fictional-world'
    )
    and entry.visibility = 'public'
    and (entry.unlock_at is null or entry.unlock_at <= now())
    and public.can_read_entry(entry.id)
    and (
      p_cursor_created_at is null
      or (
        p_cursor_id is not null
        and (
          entry.created_at < p_cursor_created_at
          or (
            entry.created_at = p_cursor_created_at
            and entry.id < p_cursor_id
          )
        )
      )
    )
    and (
      p_category = 'all'
      or exists (
        select 1
        from public.entry_tags entry_tag
        join public.tags tag on tag.id = entry_tag.tag_id
        where entry_tag.entry_id = entry.id
          and (
            p_category = 'literature'
              and tag.normalized_name = any(array[
                public.normalize_tag_name('文学'),
                public.normalize_tag_name('文学地图'),
                public.normalize_tag_name('小说'),
                public.normalize_tag_name('诗歌'),
                public.normalize_tag_name('作品')
              ])
            or p_category = 'city-memory'
              and tag.normalized_name = any(array[
                public.normalize_tag_name('城市记忆'),
                public.normalize_tag_name('城市'),
                public.normalize_tag_name('老街'),
                public.normalize_tag_name('故乡'),
                public.normalize_tag_name('记忆')
              ])
            or p_category = 'travel'
              and tag.normalized_name = any(array[
                public.normalize_tag_name('旅行'),
                public.normalize_tag_name('旅途'),
                public.normalize_tag_name('游记')
              ])
            or p_category = 'science-fiction'
              and tag.normalized_name = any(array[
                public.normalize_tag_name('科幻'),
                public.normalize_tag_name('sci-fi'),
                public.normalize_tag_name('scifi'),
                public.normalize_tag_name('science fiction')
              ])
            or p_category = 'fictional-world'
              and tag.normalized_name = any(array[
                public.normalize_tag_name('虚构世界'),
                public.normalize_tag_name('世界观'),
                public.normalize_tag_name('虚构'),
                public.normalize_tag_name('架空')
              ])
          )
      )
    )
  order by entry.created_at desc, entry.id desc
  limit least(greatest(coalesce(p_limit, 21), 1), 21);
$$;

revoke all on function public.get_public_explore_entries(
  text, timestamptz, uuid, integer
) from public;
grant execute on function public.get_public_explore_entries(
  text, timestamptz, uuid, integer
) to anon, authenticated;

comment on function public.get_public_explore_entries(
  text, timestamptz, uuid, integer
) is
  'Keyset-paginates unlocked public stories for controlled Explore tag lenses; never returns private or group entries.';

notify pgrst, 'reload schema';
