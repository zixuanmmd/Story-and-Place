-- Story-and-Place v1.2: private onboarding preferences.
-- Preferences are deliberately separated from public.profiles so future
-- additions do not become publicly readable by default.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.map_entries') is null
    or to_regprocedure('public.set_updated_at()') is null
  then
    raise exception using
      errcode = '55000',
      message = 'launch onboarding requires all existing Story-and-Place migrations';
  end if;
end;
$$;

create table if not exists public.user_experience_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  onboarding_status text not null default 'pending',
  interests text[] not null default '{}'::text[],
  first_story_id uuid references public.map_entries(id) on delete set null,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_experience_onboarding_status_values check (
    onboarding_status in ('pending', 'completed', 'skipped')
  ),
  constraint user_experience_interests_values check (
    cardinality(interests) <= 4
    and interests <@ array[
      'life', 'travel', 'literature-city', 'fictional-world'
    ]::text[]
  ),
  constraint user_experience_finished_state check (
    (onboarding_status = 'pending' and finished_at is null)
    or (onboarding_status in ('completed', 'skipped') and finished_at is not null)
  ),
  constraint user_experience_first_story_state check (
    first_story_id is null or onboarding_status = 'completed'
  )
);

create index if not exists user_experience_status_idx
  on public.user_experience_preferences(onboarding_status, updated_at desc);

drop trigger if exists user_experience_preferences_set_updated_at
  on public.user_experience_preferences;
create trigger user_experience_preferences_set_updated_at
before update on public.user_experience_preferences
for each row execute function public.set_updated_at();

create or replace function public.set_onboarding_preferences(
  p_interests text[] default '{}'::text[],
  p_action text default 'save'
)
returns public.user_experience_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  cleaned_interests text[];
  target_status text;
  result public.user_experience_preferences%rowtype;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_action not in ('save', 'skip') then
    raise exception using errcode = '22023', message = 'invalid onboarding action';
  end if;

  select coalesce(array_agg(item order by item), '{}'::text[])
  into cleaned_interests
  from (
    select distinct btrim(raw_item) as item
    from unnest(coalesce(p_interests, '{}'::text[])) raw_item
    where btrim(raw_item) in (
      'life', 'travel', 'literature-city', 'fictional-world'
    )
  ) valid_items;

  if cardinality(cleaned_interests) <> cardinality(coalesce(p_interests, '{}'::text[]))
    or cardinality(cleaned_interests) > 4
  then
    raise exception using errcode = '22023', message = 'invalid onboarding interests';
  end if;

  target_status := case when p_action = 'skip' then 'skipped' else 'pending' end;

  insert into public.user_experience_preferences (
    user_id, onboarding_status, interests, finished_at
  ) values (
    actor,
    target_status,
    cleaned_interests,
    case when target_status = 'skipped' then now() else null end
  )
  on conflict (user_id) do update
  set interests = excluded.interests,
      onboarding_status = case
        when public.user_experience_preferences.onboarding_status = 'completed'
          then 'completed'
        else excluded.onboarding_status
      end,
      finished_at = case
        when public.user_experience_preferences.onboarding_status = 'completed'
          then public.user_experience_preferences.finished_at
        else excluded.finished_at
      end
  returning * into result;

  return result;
end;
$$;

create or replace function public.complete_onboarding(
  p_entry_id uuid
)
returns public.user_experience_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  result public.user_experience_preferences%rowtype;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if not exists (
    select 1
    from public.map_entries entry
    where entry.id = p_entry_id
      and entry.user_id = actor
  ) then
    raise exception using errcode = '42501', message = 'owned story required';
  end if;

  insert into public.user_experience_preferences (
    user_id, onboarding_status, interests, first_story_id, finished_at
  ) values (
    actor, 'completed', '{}'::text[], p_entry_id, now()
  )
  on conflict (user_id) do update
  set onboarding_status = 'completed',
      first_story_id = coalesce(
        public.user_experience_preferences.first_story_id,
        excluded.first_story_id
      ),
      finished_at = coalesce(
        public.user_experience_preferences.finished_at,
        excluded.finished_at
      )
  returning * into result;

  return result;
end;
$$;

alter table public.user_experience_preferences enable row level security;

create policy "users_read_own_experience_preferences"
on public.user_experience_preferences for select to authenticated
using (user_id = (select auth.uid()));

grant select on public.user_experience_preferences to authenticated;

revoke all on function public.set_onboarding_preferences(text[], text) from public;
revoke all on function public.complete_onboarding(uuid) from public;
grant execute on function public.set_onboarding_preferences(text[], text)
  to authenticated;
grant execute on function public.complete_onboarding(uuid)
  to authenticated;

comment on table public.user_experience_preferences is
  'Private launch-experience preferences. Never expose through public profiles.';
comment on function public.complete_onboarding(uuid) is
  'Completes onboarding only when the supplied first story belongs to auth.uid().';

notify pgrst, 'reload schema';

