-- 故事情感地图：初始数据模型、触发器、索引与 RLS 策略
-- 可直接粘贴到 Supabase SQL Editor 执行，或通过 Supabase CLI migration up 执行。

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_not_blank check (char_length(btrim(display_name)) between 1 and 80),
  constraint profiles_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 2048),
  constraint profiles_bio_length check (bio is null or char_length(bio) <= 1000)
);

create table public.map_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title varchar(100) not null,
  content text not null,
  place_name text,
  latitude double precision not null,
  longitude double precision not null,
  occurred_at timestamptz,
  occurred_date date,
  occurred_year integer,
  time_precision text not null,
  time_label text not null,
  visibility text not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint map_entries_title_not_blank check (char_length(btrim(title)) between 1 and 100),
  constraint map_entries_content_not_blank check (char_length(btrim(content)) between 1 and 5000),
  constraint map_entries_place_name_length check (place_name is null or char_length(place_name) <= 200),
  constraint map_entries_latitude_range check (latitude between -90 and 90),
  constraint map_entries_longitude_range check (longitude between -180 and 180),
  constraint map_entries_visibility_values check (visibility in ('public', 'private')),
  constraint map_entries_time_precision_values check (
    time_precision in ('exact', 'date', 'month', 'year', 'approximate')
  ),
  constraint map_entries_time_label_not_blank check (char_length(btrim(time_label)) between 1 and 120),
  constraint map_entries_occurred_year_range check (
    occurred_year is null or occurred_year between 1 and 9999
  ),
  constraint map_entries_time_value_consistency check (
    (time_precision = 'exact' and occurred_at is not null and occurred_date is not null and occurred_year is not null)
    or (time_precision = 'date' and occurred_at is null and occurred_date is not null and occurred_year is not null)
    or (
      time_precision = 'month'
      and occurred_at is null
      and occurred_date is not null
      and occurred_year is not null
      and extract(day from occurred_date) = 1
    )
    or (time_precision = 'year' and occurred_at is null and occurred_date is null and occurred_year is not null)
    or (time_precision = 'approximate' and occurred_at is null and occurred_date is null)
  )
);

create index map_entries_user_id_idx on public.map_entries(user_id);
create index map_entries_visibility_idx on public.map_entries(visibility);
create index map_entries_occurred_at_idx on public.map_entries(occurred_at);
create index map_entries_occurred_date_idx on public.map_entries(occurred_date);
create index map_entries_occurred_year_idx on public.map_entries(occurred_year);
create index map_entries_created_at_idx on public.map_entries(created_at desc);
create index map_entries_coordinates_idx on public.map_entries(latitude, longitude);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger map_entries_set_updated_at
before update on public.map_entries
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
begin
  requested_name := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));

  insert into public.profiles (id, display_name)
  values (
    new.id,
    case
      when char_length(requested_name) between 1 and 80 then requested_name
      else '地图旅人'
    end
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.map_entries enable row level security;

-- profiles 只含公开资料，不存储邮箱；所有访客均可读取。
create policy "profiles_are_publicly_readable"
on public.profiles
for select
to anon, authenticated
using (true);

-- 正常注册由安全触发器建档；此策略允许登录用户补建自己的缺失资料。
create policy "users_can_insert_own_profile"
on public.profiles
for insert
to authenticated
with check (id = (select auth.uid()));

create policy "users_can_update_own_profile"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- 访客与用户都只能看到公开记录；作者还可看到自己的私密记录。
create policy "entries_public_or_owned_select"
on public.map_entries
for select
to anon, authenticated
using (visibility = 'public' or user_id = (select auth.uid()));

create policy "entries_owner_insert"
on public.map_entries
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "entries_owner_update"
on public.map_entries
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "entries_owner_delete"
on public.map_entries
for delete
to authenticated
using (user_id = (select auth.uid()));

grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select on public.map_entries to anon, authenticated;
grant insert, update, delete on public.map_entries to authenticated;
