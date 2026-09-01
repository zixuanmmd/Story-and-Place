-- Story-and-Place v1.4: privacy-bounded product analytics.
-- Product events contain an allowlisted event name and low-sensitivity scalar
-- dimensions only. Story text, titles, search terms, coordinates, email and
-- authentication material are deliberately outside this schema.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.map_entries') is null
    or to_regclass('public.story_routes') is null
    or to_regclass('public.user_experience_preferences') is null
    or to_regprocedure('private.assert_app_admin()') is null
  then
    raise exception using
      errcode = '55000',
      message = 'product analytics requires all v1.4 governance prerequisites';
  end if;
end;
$$;

create table if not exists public.product_events (
  id uuid primary key,
  event_name text not null,
  user_id uuid references public.profiles(id) on delete cascade,
  anonymous_session_id uuid not null,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint product_events_event_name_values check (event_name in (
    'session_started',
    'signup_started',
    'signup_completed',
    'onboarding_started',
    'onboarding_completed',
    'onboarding_skipped',
    'story_create_started',
    'story_created',
    'story_published',
    'draft_created',
    'draft_resumed',
    'route_created',
    'search_used',
    'search_result_opened',
    'explore_opened',
    'public_story_opened',
    'public_profile_opened',
    'story_shared',
    'invitation_sent',
    'invitation_accepted',
    'export_started',
    'export_completed'
  )),
  constraint product_events_properties_object check (
    jsonb_typeof(properties) = 'object'
  ),
  constraint product_events_properties_size check (
    pg_column_size(properties) <= 2048
  ),
  constraint product_events_server_time check (occurred_at = created_at)
);

create index if not exists product_events_name_time_idx
  on public.product_events(event_name, occurred_at desc, id desc);
create index if not exists product_events_user_time_idx
  on public.product_events(user_id, occurred_at desc, id desc)
  where user_id is not null;
create index if not exists product_events_session_time_idx
  on public.product_events(anonymous_session_id, occurred_at desc, id desc);
create index if not exists product_events_session_name_time_idx
  on public.product_events(anonymous_session_id, event_name, occurred_at desc);
create index if not exists product_events_authenticated_session_started_idx
  on public.product_events(user_id, occurred_at desc)
  where event_name = 'session_started' and user_id is not null;
create index if not exists profiles_product_analytics_created_idx
  on public.profiles(created_at desc, id);
create index if not exists map_entries_product_analytics_owner_created_idx
  on public.map_entries(user_id, created_at desc);
create index if not exists story_routes_product_analytics_created_idx
  on public.story_routes(created_at desc, created_by);

alter table public.product_events enable row level security;

-- Deliberate deny policy: browser roles never receive raw event-table access.
-- Tracking and aggregate reads only happen through the two bounded RPCs below.
drop policy if exists "product_events_no_direct_browser_reads"
  on public.product_events;
create policy "product_events_no_direct_browser_reads"
on public.product_events for select to anon, authenticated
using (false);

revoke all on table public.product_events from public, anon, authenticated;

create or replace function public.track_product_event(
  p_event_id uuid,
  p_anonymous_session_id uuid,
  p_event_name text,
  p_properties jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  safe_properties jsonb := coalesce(p_properties, '{}'::jsonb);
begin
  if p_event_id is null or p_anonymous_session_id is null then
    raise exception using errcode = '22023', message = 'invalid analytics identity';
  end if;

  if p_event_name is null or p_event_name not in (
    'session_started',
    'signup_started',
    'signup_completed',
    'onboarding_started',
    'onboarding_completed',
    'onboarding_skipped',
    'story_create_started',
    'story_created',
    'story_published',
    'draft_created',
    'draft_resumed',
    'route_created',
    'search_used',
    'search_result_opened',
    'explore_opened',
    'public_story_opened',
    'public_profile_opened',
    'story_shared',
    'invitation_sent',
    'invitation_accepted',
    'export_started',
    'export_completed'
  ) then
    raise exception using errcode = '22023', message = 'invalid analytics event';
  end if;

  if jsonb_typeof(safe_properties) <> 'object' then
    raise exception using errcode = '22023', message = 'unsafe analytics properties';
  end if;

  if (select count(*) from jsonb_object_keys(safe_properties)) > 10
    or pg_column_size(safe_properties) > 2048
    or exists (
      select 1
      from jsonb_object_keys(safe_properties) as property_key
      where property_key not in (
        'source', 'format', 'result_type', 'content_type',
        'invitation_type', 'visibility', 'outcome',
        'result_count_bucket', 'story_ordinal'
      )
    )
    or exists (
      select 1
      from jsonb_each(safe_properties) as property
      where jsonb_typeof(property.value) not in ('string', 'number', 'boolean', 'null')
        or (
          jsonb_typeof(property.value) = 'string'
          and char_length(property.value #>> '{}') > 80
        )
    )
    or (
      safe_properties ? 'source'
      and safe_properties ->> 'source' not in (
        'auth-provider', 'register-form', 'welcome', 'first-story',
        'entry-autosave', 'map-draft-url', 'map', 'onboarding',
        'route-builder', 'route-detail', 'global-search', 'search-map',
        'search-list', 'explore-page', 'entry-share', 'public-profile',
        'settings', 'entry-participants', 'entry-invitations',
        'group-members', 'group-invitations'
      )
    )
    or (
      safe_properties ? 'format'
      and safe_properties ->> 'format' not in ('json', 'csv', 'geojson')
    )
    or (
      safe_properties ? 'result_type'
      and safe_properties ->> 'result_type' not in ('entry', 'profile', 'route', 'tag', 'emotion')
    )
    or (
      safe_properties ? 'content_type'
      and safe_properties ->> 'content_type' not in ('entry', 'route', 'draft')
    )
    or (
      safe_properties ? 'invitation_type'
      and safe_properties ->> 'invitation_type' not in ('entry', 'group')
    )
    or (
      safe_properties ? 'visibility'
      and safe_properties ->> 'visibility' not in ('public', 'private', 'group')
    )
    or (
      safe_properties ? 'outcome'
      and safe_properties ->> 'outcome' not in ('success', 'failed', 'completed', 'skipped')
    )
    or (
      safe_properties ? 'result_count_bucket'
      and safe_properties ->> 'result_count_bucket' not in (
        'zero', 'one_to_five', 'six_to_twenty', 'over_twenty'
      )
    )
    or (
      safe_properties ? 'story_ordinal'
      and not case
        when jsonb_typeof(safe_properties -> 'story_ordinal') = 'number'
          and (safe_properties ->> 'story_ordinal') ~ '^[0-9]{1,4}$'
        then (safe_properties ->> 'story_ordinal')::integer between 1 and 1000
        else false
      end
    )
  then
    raise exception using errcode = '22023', message = 'unsafe analytics properties';
  end if;

  -- Serialize the per-session rate check so concurrent direct RPC requests
  -- cannot bypass it. This is defense in depth, not the platform edge limit.
  perform pg_advisory_xact_lock(hashtextextended(p_anonymous_session_id::text, 0));
  if (
    select count(*)
    from public.product_events event
    where event.anonymous_session_id = p_anonymous_session_id
      and event.occurred_at >= now() - interval '10 minutes'
  ) >= 120 then
    raise exception using errcode = 'P0001', message = 'analytics rate limit exceeded';
  end if;

  insert into public.product_events (
    id, event_name, user_id, anonymous_session_id,
    properties, occurred_at, created_at
  ) values (
    p_event_id, p_event_name, actor, p_anonymous_session_id,
    safe_properties, now(), now()
  )
  on conflict (id) do nothing;
end;
$$;

create or replace function public.admin_get_product_analytics(
  p_start_at timestamptz default now() - interval '30 days',
  p_end_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  range_start timestamptz := coalesce(p_start_at, now() - interval '30 days');
  range_end timestamptz := coalesce(p_end_at, now());
  signup_count integer;
  tracked_active integer;
  onboarding_count integer;
  first_story_count integer;
  second_story_count integer;
  returned_within_seven integer;
  story_count integer;
  story_creator_count integer;
  route_creator_count integer;
  search_visitors integer;
  explore_visitors integer;
  explore_story_visitors integer;
  explore_profile_visitors integer;
  explore_signup_visitors integer;
  retention_day integer;
  eligible_count integer;
  retained_count integer;
  retention jsonb := '{}'::jsonb;
  daily jsonb;
begin
  perform private.assert_app_admin();

  if range_start >= range_end
    or range_end - range_start > interval '366 days'
    or range_end > now() + interval '5 minutes'
  then
    raise exception using errcode = '22023', message = 'invalid analytics range';
  end if;

  select count(*)::integer into signup_count
  from public.profiles profile
  where profile.created_at >= range_start and profile.created_at < range_end;

  select count(distinct event.user_id)::integer into tracked_active
  from public.product_events event
  where event.user_id is not null
    and event.occurred_at >= range_start and event.occurred_at < range_end;

  select count(*)::integer into onboarding_count
  from public.profiles profile
  join public.user_experience_preferences preference on preference.user_id = profile.id
  where profile.created_at >= range_start and profile.created_at < range_end
    and preference.onboarding_status = 'completed'
    and preference.finished_at < range_end;

  select count(*)::integer into first_story_count
  from public.profiles profile
  where profile.created_at >= range_start and profile.created_at < range_end
    and exists (
      select 1 from public.map_entries entry
      where entry.user_id = profile.id and entry.created_at < range_end
    );

  select count(*)::integer into second_story_count
  from public.profiles profile
  where profile.created_at >= range_start and profile.created_at < range_end
    and (
      select count(*) from public.map_entries entry
      where entry.user_id = profile.id and entry.created_at < range_end
    ) >= 2;

  select count(*)::integer into returned_within_seven
  from public.profiles profile
  where profile.created_at >= range_start and profile.created_at < range_end
    and exists (
      select 1 from public.product_events event
      where event.user_id = profile.id
        and event.event_name = 'session_started'
        and event.occurred_at >= profile.created_at + interval '1 day'
        and event.occurred_at < profile.created_at + interval '8 days'
    );

  select count(*)::integer, count(distinct entry.user_id)::integer
  into story_count, story_creator_count
  from public.map_entries entry
  where entry.created_at >= range_start and entry.created_at < range_end;

  select count(distinct route.created_by)::integer into route_creator_count
  from public.story_routes route
  where route.created_at >= range_start and route.created_at < range_end;

  select count(distinct coalesce(event.user_id::text, event.anonymous_session_id::text))::integer
  into search_visitors
  from public.product_events event
  where event.event_name = 'search_used'
    and event.occurred_at >= range_start and event.occurred_at < range_end;

  select count(distinct event.anonymous_session_id)::integer
  into explore_visitors
  from public.product_events event
  where event.event_name = 'explore_opened'
    and event.occurred_at >= range_start and event.occurred_at < range_end;

  select count(distinct viewed.anonymous_session_id)::integer
  into explore_story_visitors
  from public.product_events viewed
  where viewed.event_name = 'public_story_opened'
    and viewed.occurred_at >= range_start and viewed.occurred_at < range_end
    and exists (
      select 1 from public.product_events opened
      where opened.anonymous_session_id = viewed.anonymous_session_id
        and opened.event_name = 'explore_opened'
        and opened.occurred_at >= range_start
        and opened.occurred_at <= viewed.occurred_at
    );

  select count(distinct viewed.anonymous_session_id)::integer
  into explore_profile_visitors
  from public.product_events viewed
  where viewed.event_name = 'public_profile_opened'
    and viewed.occurred_at >= range_start and viewed.occurred_at < range_end
    and exists (
      select 1 from public.product_events opened
      where opened.anonymous_session_id = viewed.anonymous_session_id
        and opened.event_name = 'explore_opened'
        and opened.occurred_at >= range_start
        and opened.occurred_at <= viewed.occurred_at
    );

  select count(distinct signup.anonymous_session_id)::integer
  into explore_signup_visitors
  from public.product_events signup
  where signup.event_name = 'signup_completed'
    and signup.occurred_at >= range_start and signup.occurred_at < range_end
    and exists (
      select 1 from public.product_events opened
      where opened.anonymous_session_id = signup.anonymous_session_id
        and opened.event_name = 'explore_opened'
        and opened.occurred_at <= signup.occurred_at
        and opened.occurred_at >= range_start
    );

  foreach retention_day in array array[1, 7, 30]
  loop
    select count(*)::integer into eligible_count
    from public.profiles profile
    where profile.created_at >= range_start
      and profile.created_at < least(range_end, now() - make_interval(days => retention_day));

    select count(*)::integer into retained_count
    from public.profiles profile
    where profile.created_at >= range_start
      and profile.created_at < least(range_end, now() - make_interval(days => retention_day))
      and exists (
        select 1 from public.product_events event
        where event.user_id = profile.id
          and event.event_name = 'session_started'
          and event.occurred_at >= profile.created_at + make_interval(days => retention_day)
          and event.occurred_at < profile.created_at + make_interval(days => retention_day + 1)
      );

    retention := retention || jsonb_build_object(
      'd' || retention_day::text,
      jsonb_build_object(
        'eligible', eligible_count,
        'retained', retained_count,
        'rate', case when eligible_count = 0 then 0
          else round(retained_count::numeric * 100 / eligible_count, 2) end
      )
    );
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'day', day_bucket::date,
    'signups', (
      select count(*) from public.profiles profile
      where profile.created_at >= day_bucket
        and profile.created_at < day_bucket + interval '1 day'
    ),
    'active_users', (
      select count(distinct event.user_id) from public.product_events event
      where event.user_id is not null
        and event.occurred_at >= day_bucket
        and event.occurred_at < day_bucket + interval '1 day'
    ),
    'stories', (
      select count(*) from public.map_entries entry
      where entry.created_at >= day_bucket
        and entry.created_at < day_bucket + interval '1 day'
    )
  ) order by day_bucket), '[]'::jsonb)
  into daily
  from generate_series(
    date_trunc('day', range_start),
    date_trunc('day', range_end - interval '1 microsecond'),
    interval '1 day'
  ) as day_bucket;

  return jsonb_build_object(
    'range', jsonb_build_object('start_at', range_start, 'end_at', range_end),
    'acquisition', jsonb_build_object(
      'signups', signup_count,
      'tracked_active_users', tracked_active
    ),
    'activation', jsonb_build_object(
      'cohort_users', signup_count,
      'onboarding_completed', onboarding_count,
      'onboarding_rate', case when signup_count = 0 then 0 else round(onboarding_count::numeric * 100 / signup_count, 2) end,
      'first_story_created', first_story_count,
      'first_story_rate', case when signup_count = 0 then 0 else round(first_story_count::numeric * 100 / signup_count, 2) end,
      'second_story_created', second_story_count,
      'second_story_rate', case when signup_count = 0 then 0 else round(second_story_count::numeric * 100 / signup_count, 2) end
    ),
    'engagement', jsonb_build_object(
      'stories_created', story_count,
      'story_creators', story_creator_count,
      'stories_per_creator', case when story_creator_count = 0 then 0 else round(story_count::numeric / story_creator_count, 2) end,
      'route_creators', route_creator_count,
      'route_adoption_rate', case when tracked_active = 0 then 0 else round(route_creator_count::numeric * 100 / tracked_active, 2) end,
      'search_visitors', search_visitors,
      'explore_visitors', explore_visitors
    ),
    'activation_funnel', jsonb_build_object(
      'signup_completed', signup_count,
      'onboarding_completed', onboarding_count,
      'first_story_created', first_story_count,
      'second_story_created', second_story_count,
      'returned_within_7d', returned_within_seven
    ),
    'explore_funnel', jsonb_build_object(
      'explore_opened', explore_visitors,
      'public_story_opened', explore_story_visitors,
      'public_profile_opened', explore_profile_visitors,
      'signup_completed', explore_signup_visitors
    ),
    'retention', retention,
    'daily', daily
  );
end;
$$;

revoke all on function public.track_product_event(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.admin_get_product_analytics(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.track_product_event(uuid, uuid, text, jsonb)
  to anon, authenticated;
grant execute on function public.admin_get_product_analytics(timestamptz, timestamptz)
  to authenticated;

comment on table public.product_events is
  'Privacy-bounded product events. Raw content, queries, coordinates, emails and auth material are forbidden.';
comment on function public.track_product_event(uuid, uuid, text, jsonb) is
  'Records one idempotent allowlisted event. The authenticated user is always derived from auth.uid().';
comment on function public.admin_get_product_analytics(timestamptz, timestamptz) is
  'Returns aggregate product funnels and retention to an authenticated app admin.';

notify pgrst, 'reload schema';
