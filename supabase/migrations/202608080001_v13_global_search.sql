-- Story-and-Place v1.3: permission-safe global search.
--
-- Search deliberately excludes locked time capsules for every role. Entry,
-- tag, emotion, profile and route rows are assembled inside the database so
-- suggestions, result counts and pagination cannot be derived from content
-- the current caller is not allowed to read.

do $$
begin
  if to_regclass('public.map_entries') is null
    or to_regclass('public.profiles') is null
    or to_regclass('public.tags') is null
    or to_regclass('public.entry_tags') is null
    or to_regclass('public.story_routes') is null
    or to_regclass('public.story_route_items') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null
    or to_regprocedure('public.can_view_story_route(uuid)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'v1.3 global search requires all migrations through 202608070001';
  end if;
end;
$$;

create extension if not exists pg_trgm with schema extensions;

create index if not exists map_entries_global_search_trgm_idx
  on public.map_entries using gin (
    (
      title || ' ' || content || ' ' || coalesce(place_name, '') || ' ' || time_label
    ) extensions.gin_trgm_ops
  );

create index if not exists profiles_global_search_trgm_idx
  on public.profiles using gin (
    (username || ' ' || display_name || ' ' || coalesce(bio, '')) extensions.gin_trgm_ops
  );

create index if not exists story_routes_global_search_trgm_idx
  on public.story_routes using gin (
    (title || ' ' || description) extensions.gin_trgm_ops
  );

create index if not exists tags_global_search_trgm_idx
  on public.tags using gin (
    (name || ' ' || normalized_name || ' ' || coalesce(semantic_key, '')) extensions.gin_trgm_ops
  );

create or replace function public.search_story_and_place(
  p_query text default null,
  p_start_year integer default null,
  p_end_year integer default null,
  p_place text default null,
  p_tag text default null,
  p_emotion text default null,
  p_author_id uuid default null,
  p_content_types text[] default null,
  p_offset integer default 0,
  p_limit integer default 21
)
returns table (
  result_type text,
  result_id uuid,
  title text,
  subtitle text,
  excerpt text,
  href text,
  occurred_year integer,
  time_label text,
  latitude double precision,
  longitude double precision,
  visibility text,
  place_category_slug text,
  author_id uuid,
  author_name text,
  author_avatar_url text,
  tag_type text,
  tag_slug text,
  share_slug text,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with input as (
    select
      nullif(pg_catalog.btrim(coalesce(p_query, '')), '') as query,
      nullif(pg_catalog.btrim(coalesce(p_place, '')), '') as place,
      nullif(public.normalize_tag_name(p_tag), '') as tag,
      nullif(public.normalize_tag_name(p_emotion), '') as emotion,
      case
        when p_content_types is null or cardinality(p_content_types) = 0
          then array['entry', 'profile', 'route', 'tag', 'emotion']::text[]
        else p_content_types
      end as content_types,
      greatest(coalesce(p_offset, 0), 0) as result_offset,
      least(greatest(coalesce(p_limit, 21), 1), 51) as result_limit
  ),
  validated as (
    select *
    from input
    where (query is null or char_length(query) between 2 and 100)
      and (place is null or char_length(place) between 1 and 100)
      and (tag is null or char_length(tag) between 1 and 40)
      and (emotion is null or char_length(emotion) between 1 and 40)
      and (p_start_year is null or p_start_year between 1 and 9999)
      and (p_end_year is null or p_end_year between 1 and 9999)
      and (p_start_year is null or p_end_year is null or p_start_year <= p_end_year)
      and content_types <@ array['entry', 'profile', 'route', 'tag', 'emotion']::text[]
  ),
  visible_entries as (
    select entry.*
    from public.map_entries entry
    cross join validated criteria
    where 'entry' = any(criteria.content_types)
      and (entry.unlock_at is null or entry.unlock_at <= now())
      and public.can_read_entry(entry.id)
      and (p_start_year is null or entry.occurred_year >= p_start_year)
      and (p_end_year is null or entry.occurred_year <= p_end_year)
      and (
        criteria.place is null
        or coalesce(entry.place_name, '') ilike
          '%' || replace(replace(replace(criteria.place, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%'
          escape '\\'
      )
      and (p_author_id is null or entry.user_id = p_author_id)
      and (
        criteria.tag is null
        or exists (
          select 1
          from public.entry_tags entry_tag
          join public.tags tag on tag.id = entry_tag.tag_id
          where entry_tag.entry_id = entry.id
            and tag.normalized_name = criteria.tag
        )
      )
      and (
        criteria.emotion is null
        or exists (
          select 1
          from public.entry_tags entry_tag
          join public.tags emotion on emotion.id = entry_tag.tag_id
          where entry_tag.entry_id = entry.id
            and emotion.type = 'emotion'
            and (
              emotion.normalized_name = criteria.emotion
              or lower(coalesce(emotion.semantic_key, '')) = criteria.emotion
              or emotion.slug = criteria.emotion
            )
        )
      )
      and (
        criteria.query is null
        or entry.title ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\\'
        or entry.content ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\\'
        or coalesce(entry.place_name, '') ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\\'
        or entry.time_label ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\\'
        or exists (
          select 1
          from public.entry_tags entry_tag
          join public.tags tag on tag.id = entry_tag.tag_id
          where entry_tag.entry_id = entry.id
            and (
              tag.name ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\\'
              or coalesce(tag.semantic_key, '') ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\\'
            )
        )
      )
  ),
  entry_results as (
    select
      'entry'::text as result_type,
      entry.id as result_id,
      entry.title::text as title,
      coalesce(entry.place_name, '未命名地点')::text as subtitle,
      left(entry.content, 280)::text as excerpt,
      ('/entries/' || entry.id::text)::text as href,
      entry.occurred_year,
      entry.time_label::text,
      entry.latitude,
      entry.longitude,
      entry.visibility::text,
      entry.place_category_slug::text,
      entry.user_id as author_id,
      profile.display_name::text as author_name,
      profile.avatar_url::text as author_avatar_url,
      null::text as tag_type,
      null::text as tag_slug,
      null::text as share_slug,
      entry.created_at,
      case
        when criteria.query is not null and lower(entry.title) = lower(criteria.query) then 100
        when criteria.query is not null and entry.title ilike criteria.query || '%' then 80
        when criteria.query is not null and entry.title ilike '%' || criteria.query || '%' then 60
        when criteria.query is not null and coalesce(entry.place_name, '') ilike '%' || criteria.query || '%' then 50
        else 30
      end as relevance
    from visible_entries entry
    join public.profiles profile on profile.id = entry.user_id
    cross join validated criteria
  ),
  visible_routes as (
    select route.*
    from public.story_routes route
    cross join validated criteria
    where 'route' = any(criteria.content_types)
      and (criteria.query is not null or p_author_id is not null)
      and p_start_year is null
      and p_end_year is null
      and criteria.place is null
      and criteria.tag is null
      and criteria.emotion is null
      and (p_author_id is null or route.created_by = p_author_id)
      and public.can_view_story_route(route.id)
      and not exists (
        select 1
        from public.story_route_items item
        join public.map_entries entry on entry.id = item.entry_id
        where item.route_id = route.id
          and entry.unlock_at > now()
      )
      and (
        criteria.query is null
        or route.title ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\\'
        or route.description ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\\'
      )
  ),
  route_results as (
    select
      'route'::text,
      route.id,
      route.title::text,
      (route.node_count::text || ' 个地点节点')::text,
      left(route.description, 280)::text,
      ('/routes/' || route.share_slug)::text,
      null::integer,
      null::text,
      null::double precision,
      null::double precision,
      route.visibility::text,
      null::text,
      route.created_by,
      profile.display_name::text,
      profile.avatar_url::text,
      null::text,
      null::text,
      route.share_slug::text,
      route.created_at,
      case
        when criteria.query is not null and lower(route.title) = lower(criteria.query) then 95
        else 45
      end
    from visible_routes route
    join public.profiles profile on profile.id = route.created_by
    cross join validated criteria
  ),
  profile_results as (
    select
      'profile'::text,
      profile.id,
      profile.display_name::text,
      ('@' || profile.username)::text,
      left(coalesce(profile.bio, ''), 280)::text,
      ('/users/' || profile.username)::text,
      null::integer,
      null::text,
      null::double precision,
      null::double precision,
      null::text,
      null::text,
      profile.id,
      profile.display_name::text,
      profile.avatar_url::text,
      null::text,
      null::text,
      null::text,
      profile.created_at,
      case
        when lower(profile.username) = lower(criteria.query)
          or lower(profile.display_name) = lower(criteria.query) then 90
        else 40
      end
    from public.profiles profile
    cross join validated criteria
    where 'profile' = any(criteria.content_types)
      and criteria.query is not null
      and p_start_year is null
      and p_end_year is null
      and criteria.place is null
      and criteria.tag is null
      and criteria.emotion is null
      and (p_author_id is null or profile.id = p_author_id)
      and (
        profile.username ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\\'
        or profile.display_name ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\\'
      )
  ),
  tag_results as (
    select
      case when tag.type = 'emotion' then 'emotion' else 'tag' end::text,
      tag.id,
      ('#' || tag.name)::text,
      (count(distinct entry.id)::text || ' 个可见故事')::text,
      ''::text,
      case
        when tag.type = 'emotion' and tag.semantic_key is not null
          then ('/emotions/' || tag.semantic_key)::text
        else ('/tags/' || tag.slug)::text
      end,
      null::integer,
      null::text,
      null::double precision,
      null::double precision,
      null::text,
      null::text,
      null::uuid,
      null::text,
      null::text,
      tag.type::text,
      tag.slug::text,
      null::text,
      tag.created_at,
      case when lower(tag.name) = lower(criteria.query) then 85 else 35 end
    from public.tags tag
    join public.entry_tags entry_tag on entry_tag.tag_id = tag.id
    join public.map_entries entry on entry.id = entry_tag.entry_id
    cross join validated criteria
    where (case when tag.type = 'emotion' then 'emotion' else 'tag' end) = any(criteria.content_types)
      and criteria.query is not null
      and p_start_year is null
      and p_end_year is null
      and criteria.place is null
      and criteria.tag is null
      and criteria.emotion is null
      and p_author_id is null
      and (entry.unlock_at is null or entry.unlock_at <= now())
      and public.can_read_entry(entry.id)
      and (
        tag.name ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\\'
        or coalesce(tag.semantic_key, '') ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\\'
      )
    group by tag.id, tag.name, tag.type, tag.semantic_key, tag.slug, tag.created_at, criteria.query
  ),
  combined as (
    select * from entry_results
    union all select * from route_results
    union all select * from profile_results
    union all select * from tag_results
  ),
  numbered as (
    select combined.*, count(*) over () as total_count
    from combined
  )
  select
    numbered.result_type,
    numbered.result_id,
    numbered.title,
    numbered.subtitle,
    numbered.excerpt,
    numbered.href,
    numbered.occurred_year,
    numbered.time_label,
    numbered.latitude,
    numbered.longitude,
    numbered.visibility,
    numbered.place_category_slug,
    numbered.author_id,
    numbered.author_name,
    numbered.author_avatar_url,
    numbered.tag_type,
    numbered.tag_slug,
    numbered.share_slug,
    numbered.created_at,
    numbered.total_count
  from numbered
  order by numbered.relevance desc, numbered.created_at desc, numbered.result_id desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 21), 1), 51);
$$;

revoke all on function public.search_story_and_place(
  text, integer, integer, text, text, text, uuid, text[], integer, integer
) from public;

grant execute on function public.search_story_and_place(
  text, integer, integer, text, text, text, uuid, text[], integer, integer
) to anon, authenticated;

comment on function public.search_story_and_place(
  text, integer, integer, text, text, text, uuid, text[], integer, integer
) is
  'Permission-safe global search. Locked time capsules are always excluded, and every entry/route/tag aggregate is filtered through canonical access helpers.';

notify pgrst, 'reload schema';
