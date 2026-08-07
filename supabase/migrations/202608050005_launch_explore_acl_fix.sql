-- Fix public Explore invoker execution without exposing the internal tag
-- normalization helper to browser roles. The controlled vocabulary below is
-- already stored in normalized form.

do $$
begin
  if to_regprocedure(
    'public.get_public_explore_entries(text,timestamp with time zone,uuid,integer)'
  ) is null then
    raise exception using
      errcode = '55000',
      message = 'Explore ACL fix requires migration 202608050004';
  end if;
end;
$$;

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
                '文学', '文学地图', '小说', '诗歌', '作品'
              ])
            or p_category = 'city-memory'
              and tag.normalized_name = any(array[
                '城市记忆', '城市', '老街', '故乡', '记忆'
              ])
            or p_category = 'travel'
              and tag.normalized_name = any(array[
                '旅行', '旅途', '游记'
              ])
            or p_category = 'science-fiction'
              and tag.normalized_name = any(array[
                '科幻', 'sci-fi', 'scifi', 'science fiction'
              ])
            or p_category = 'fictional-world'
              and tag.normalized_name = any(array[
                '虚构世界', '世界观', '虚构', '架空'
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
  'Keyset-paginates unlocked public stories without requiring browser roles to execute internal normalization helpers.';

notify pgrst, 'reload schema';
