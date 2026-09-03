-- 故事情感地图：当前代码对应的完整 Supabase 重建 Query
-- 生成来源：supabase/migrations 中按版本排序的全部 migration。
--
-- 危险操作：
--   1. 删除 public schema 中的全部应用表、函数、策略和测试数据。
--   2. 保留 auth.users 登录账户。
--   3. 重建完成后，从 auth.users 补建 public.profiles。
--
-- 仅用于确认可以丢弃当前 public schema 数据的测试环境。
-- 整个重建位于一个事务中；任何一步失败都会整体回滚。

begin;

drop schema if exists public cascade;
create schema public authorization postgres;

comment on schema public is 'standard public schema';

grant usage on schema public
to postgres, anon, authenticated, service_role;
grant all on schema public
to postgres, service_role;

alter default privileges for role postgres in schema public
grant all on tables to postgres, service_role;
alter default privileges for role postgres in schema public
grant all on sequences to postgres, service_role;
alter default privileges for role postgres in schema public
grant all on functions to postgres, service_role;

-- ============================================================
-- MIGRATION: 202607220001_initial_schema.sql
-- ============================================================
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

-- ============================================================
-- MIGRATION: 202607220002_privacy_time_integrity.sql
-- ============================================================
-- 隐私、当地时间与客户端写权限加固（增量 migration）
-- 旧版精确时间不做时区猜测；occurred_local 仅用于本次 migration 后明确保存的当地时间。

alter table public.map_entries
  add column if not exists occurred_local timestamp without time zone,
  add column if not exists occurred_timezone text;

alter table public.map_entries
  add constraint map_entries_occurred_timezone_length
  check (occurred_timezone is null or char_length(occurred_timezone) between 1 and 100)
  not valid;

alter table public.map_entries
  validate constraint map_entries_occurred_timezone_length;

alter table public.map_entries
  drop constraint if exists map_entries_time_value_consistency;

alter table public.map_entries
  add constraint map_entries_time_value_consistency check (
    (
      time_precision = 'exact'
      and occurred_date is not null
      and occurred_year is not null
      and (
        (
          occurred_local is not null
          and occurred_date = occurred_local::date
          and occurred_year = extract(year from occurred_local)::integer
          and occurred_at is null
        )
        or (
          occurred_local is null
          and occurred_timezone is null
          and occurred_at is not null
        )
      )
    )
    or (
      time_precision = 'date'
      and occurred_at is null
      and occurred_local is null
      and occurred_timezone is null
      and occurred_date is not null
      and occurred_year = extract(year from occurred_date)::integer
    )
    or (
      time_precision = 'month'
      and occurred_at is null
      and occurred_local is null
      and occurred_timezone is null
      and occurred_date is not null
      and occurred_year = extract(year from occurred_date)::integer
      and extract(day from occurred_date) = 1
    )
    or (
      time_precision = 'year'
      and occurred_at is null
      and occurred_local is null
      and occurred_timezone is null
      and occurred_date is null
      and occurred_year is not null
    )
    or (
      time_precision = 'approximate'
      and occurred_at is null
      and occurred_local is null
      and occurred_timezone is null
      and occurred_date is null
    )
  ) not valid;

alter table public.map_entries
  validate constraint map_entries_time_value_consistency;

create or replace function public.normalize_map_entry_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.time_precision = 'exact' then
    if new.occurred_local is not null then
      new.occurred_date := new.occurred_local::date;
      new.occurred_year := extract(year from new.occurred_local)::integer;
      new.occurred_at := null;
      if new.occurred_timezone is not null and not exists (
        select 1 from pg_catalog.pg_timezone_names
        where name = new.occurred_timezone
      ) then
        raise exception using errcode = '22023', message = 'invalid IANA time zone';
      end if;
    elsif new.occurred_at is null then
      raise exception using errcode = '23514', message = 'exact time requires occurred_local or legacy occurred_at';
    end if;
  elsif new.time_precision = 'date' then
    new.occurred_at := null;
    new.occurred_local := null;
    new.occurred_timezone := null;
    new.occurred_year := extract(year from new.occurred_date)::integer;
  elsif new.time_precision = 'month' then
    new.occurred_at := null;
    new.occurred_local := null;
    new.occurred_timezone := null;
    new.occurred_date := date_trunc('month', new.occurred_date)::date;
    new.occurred_year := extract(year from new.occurred_date)::integer;
  elsif new.time_precision = 'year' then
    new.occurred_at := null;
    new.occurred_local := null;
    new.occurred_timezone := null;
    new.occurred_date := null;
  elsif new.time_precision = 'approximate' then
    new.occurred_at := null;
    new.occurred_local := null;
    new.occurred_timezone := null;
    new.occurred_date := null;
  end if;
  return new;
end;
$$;

drop trigger if exists map_entries_normalize_time on public.map_entries;
create trigger map_entries_normalize_time
before insert or update on public.map_entries
for each row execute function public.normalize_map_entry_time();

create or replace function public.protect_map_entry_immutable_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at
    or new.updated_at is distinct from old.updated_at then
    raise exception using errcode = '42501', message = 'database-maintained fields are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists map_entries_protect_immutable_fields on public.map_entries;
create trigger map_entries_protect_immutable_fields
before update on public.map_entries
for each row execute function public.protect_map_entry_immutable_fields();

-- 客户端只能写业务字段；主键、作者和审计时间由数据库控制。
revoke insert, update on public.map_entries from authenticated;
grant insert (
  user_id, title, content, place_name, latitude, longitude,
  occurred_local, occurred_timezone, occurred_date, occurred_year,
  time_precision, time_label, visibility
) on public.map_entries to authenticated;
grant update (
  title, content, place_name, latitude, longitude,
  occurred_local, occurred_timezone, occurred_date, occurred_year,
  time_precision, time_label, visibility
) on public.map_entries to authenticated;

revoke insert, update on public.profiles from authenticated;
grant insert (id, display_name, avatar_url, bio) on public.profiles to authenticated;
grant update (display_name, avatar_url, bio) on public.profiles to authenticated;

comment on table public.profiles is
  'Public profile data only. Never add email, billing, moderation, or other private account fields; use a separate RLS-protected table.';
comment on column public.map_entries.occurred_local is
  'User-entered event local wall-clock time; never reinterpret using the viewer timezone.';
comment on column public.map_entries.occurred_timezone is
  'Optional explicit IANA timezone. Null means unknown; legacy rows are not guessed.';

-- ============================================================
-- MIGRATION: 202607230001_groups_social_categories.sql
-- ============================================================
-- 故事情感地图：群组、基础社交、地点分类与信息流
-- 增量 migration；不修改既有 migration，不猜测或改写旧记录的时间语义。

create table public.place_categories (
  slug text primary key,
  label text not null,
  icon_key text not null,
  sort_order integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint place_categories_slug_format check (slug ~ '^[a-z][a-z0-9-]{1,31}$'),
  constraint place_categories_label_length check (char_length(btrim(label)) between 1 and 40),
  constraint place_categories_icon_key_format check (icon_key ~ '^[a-z][a-z0-9-]{1,31}$'),
  constraint place_categories_sort_order_nonnegative check (sort_order >= 0)
);

insert into public.place_categories (slug, label, icon_key, sort_order) values
  ('home', '家与住所', 'home', 10),
  ('school', '学校与教育', 'school', 20),
  ('work', '工作场所', 'work', 30),
  ('food', '餐饮', 'food', 40),
  ('transport', '交通地点', 'transport', 50),
  ('street', '城市街道', 'street', 60),
  ('nature', '公园与自然', 'nature', 70),
  ('landmark', '文化与地标', 'landmark', 80),
  ('medical', '医疗', 'medical', 90),
  ('travel', '旅行住宿', 'travel', 100),
  ('memorial', '纪念地点', 'memorial', 110),
  ('other', '其他', 'other', 120);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name varchar(80) not null,
  description text not null default '',
  avatar_url text,
  visibility text not null default 'private',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint groups_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 48),
  constraint groups_name_not_blank check (char_length(btrim(name)) between 1 and 80),
  constraint groups_description_length check (char_length(description) <= 2000),
  constraint groups_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 2048),
  constraint groups_visibility_values check (visibility in ('public', 'private')),
  constraint groups_archive_consistency check (
    (archived_at is null and archived_by is null)
    or (archived_at is not null and archived_by is not null)
  )
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id),
  constraint group_members_role_values check (role in ('owner', 'admin', 'member')),
  constraint group_members_status_values check (status in ('active', 'left', 'removed')),
  constraint group_members_joined_consistency check (
    (status = 'active' and joined_at is not null)
    or status <> 'active'
  )
);

create unique index group_members_one_active_owner_idx
on public.group_members(group_id)
where role = 'owner' and status = 'active';

create table public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  constraint group_invitations_status_values check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  constraint group_invitations_not_self check (inviter_id <> invitee_id),
  constraint group_invitations_response_consistency check (
    (status = 'pending' and responded_at is null)
    or (status <> 'pending' and responded_at is not null)
  )
);

create unique index group_invitations_one_pending_idx
on public.group_invitations(group_id, invitee_id)
where status = 'pending';

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_not_self check (follower_id <> following_id)
);

create table public.entry_likes (
  entry_id uuid not null references public.map_entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, user_id)
);

create table public.entry_comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.map_entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content varchar(1000) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  moderated_at timestamptz,
  moderated_by uuid references public.profiles(id) on delete set null,
  constraint entry_comments_content_valid check (
    deleted_at is not null or char_length(btrim(content)) between 1 and 1000
  ),
  constraint entry_comments_moderation_consistency check (
    (moderated_at is null and moderated_by is null)
    or (moderated_at is not null and moderated_by is not null)
  )
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  description text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_notes text,
  constraint reports_target_type_values check (target_type in ('entry', 'comment', 'user', 'group')),
  constraint reports_reason_values check (reason in ('spam', 'harassment', 'hate', 'privacy', 'misinformation', 'other')),
  constraint reports_description_length check (char_length(description) <= 1000),
  constraint reports_status_values check (status in ('pending', 'reviewing', 'resolved', 'dismissed'))
);

alter table public.map_entries
  add column group_id uuid references public.groups(id) on delete restrict,
  add column place_category_slug text references public.place_categories(slug) on update cascade default 'other',
  add column allow_comments boolean not null default true;

update public.map_entries
set place_category_slug = 'other'
where place_category_slug is null;

alter table public.map_entries
  alter column place_category_slug set not null;

alter table public.map_entries
  drop constraint if exists map_entries_visibility_values;

alter table public.map_entries
  add constraint map_entries_visibility_values
  check (visibility in ('public', 'private', 'group'));

alter table public.map_entries
  add constraint map_entries_group_visibility_consistency
  check (
    (visibility = 'group' and group_id is not null)
    or (visibility <> 'group' and group_id is null)
  );

create index group_members_group_status_idx on public.group_members(group_id, status);
create index group_members_user_status_idx on public.group_members(user_id, status);
create index group_invitations_invitee_status_idx on public.group_invitations(invitee_id, status);
create index group_invitations_group_status_idx on public.group_invitations(group_id, status);
create index groups_visibility_created_at_idx on public.groups(visibility, created_at desc);
create index groups_created_by_idx on public.groups(created_by);
create index map_entries_group_created_at_idx on public.map_entries(group_id, created_at desc);
create index map_entries_place_category_idx on public.map_entries(place_category_slug);
create index follows_follower_created_at_idx on public.follows(follower_id, created_at desc);
create index follows_following_created_at_idx on public.follows(following_id, created_at desc);
create index entry_likes_entry_idx on public.entry_likes(entry_id);
create index entry_comments_entry_created_at_idx on public.entry_comments(entry_id, created_at desc);
create index reports_reporter_created_at_idx on public.reports(reporter_id, created_at desc);
create index reports_target_idx on public.reports(target_type, target_id);

create trigger groups_set_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

create trigger group_members_set_updated_at
before update on public.group_members
for each row execute function public.set_updated_at();

create trigger entry_comments_set_updated_at
before update on public.entry_comments
for each row execute function public.set_updated_at();

create or replace function public.is_active_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = (select auth.uid())
      and status = 'active'
  );
$$;

create or replace function public.is_group_admin(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = (select auth.uid())
      and status = 'active'
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = (select auth.uid())
      and status = 'active'
      and role = 'owner'
  );
$$;

create or replace function public.can_view_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and (
        g.visibility = 'public'
        or exists (
          select 1 from public.group_members gm
          where gm.group_id = g.id
            and gm.user_id = (select auth.uid())
            and gm.status = 'active'
        )
        or exists (
          select 1 from public.group_invitations gi
          where gi.group_id = g.id
            and gi.invitee_id = (select auth.uid())
            and gi.status = 'pending'
            and gi.expires_at > now()
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
    from public.map_entries e
    where e.id = p_entry_id
      and (
        e.visibility = 'public'
        or (e.visibility = 'private' and e.user_id = (select auth.uid()))
        or (
          e.visibility = 'group'
          and exists (
            select 1 from public.group_members gm
            where gm.group_id = e.group_id
              and gm.user_id = (select auth.uid())
              and gm.status = 'active'
          )
        )
      )
  );
$$;

create or replace function public.can_interact_entry(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.map_entries e
    where e.id = p_entry_id
      and (
        e.visibility = 'public'
        or (
          e.visibility = 'group'
          and exists (
            select 1 from public.group_members gm
            where gm.group_id = e.group_id
              and gm.user_id = (select auth.uid())
              and gm.status = 'active'
          )
        )
      )
  );
$$;

create or replace function public.can_report_target(p_target_type text, p_target_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return false; end if;
  if p_target_type = 'entry' then
    return exists (
      select 1 from public.map_entries
      where id = p_target_id
        and visibility in ('public', 'group')
        and public.can_read_entry(id)
    );
  elsif p_target_type = 'comment' then
    return exists (
      select 1 from public.entry_comments c
      where c.id = p_target_id and public.can_read_entry(c.entry_id)
    );
  elsif p_target_type = 'user' then
    return exists (select 1 from public.profiles where id = p_target_id);
  elsif p_target_type = 'group' then
    return public.can_view_group(p_target_id);
  end if;
  return false;
end;
$$;

revoke all on function public.is_active_group_member(uuid) from public;
revoke all on function public.is_group_admin(uuid) from public;
revoke all on function public.is_group_owner(uuid) from public;
revoke all on function public.can_view_group(uuid) from public;
revoke all on function public.can_read_entry(uuid) from public;
revoke all on function public.can_interact_entry(uuid) from public;
revoke all on function public.can_report_target(text, uuid) from public;
grant execute on function public.is_active_group_member(uuid) to anon, authenticated;
grant execute on function public.is_group_admin(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;
grant execute on function public.can_view_group(uuid) to anon, authenticated;
grant execute on function public.can_read_entry(uuid) to anon, authenticated;
grant execute on function public.can_interact_entry(uuid) to authenticated;
grant execute on function public.can_report_target(text, uuid) to authenticated;

create or replace function public.add_group_owner_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.group_members (group_id, user_id, role, status, joined_at)
  values (new.id, new.created_by, 'owner', 'active', now());
  return new;
end;
$$;

create trigger groups_add_owner
after insert on public.groups
for each row execute function public.add_group_owner_after_insert();

create or replace function public.protect_group_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.updated_at is distinct from old.updated_at then
    raise exception using errcode = '42501', message = 'database-maintained group fields are immutable';
  end if;
  if not public.is_group_owner(old.id)
    and (
      new.slug is distinct from old.slug
      or new.visibility is distinct from old.visibility
    ) then
    raise exception using errcode = '42501', message = 'only the owner can change group identity or visibility';
  end if;
  if old.archived_at is not null then
    raise exception using errcode = '55000', message = 'archived groups are read-only';
  end if;
  if new.archived_at is distinct from old.archived_at then
    if not public.is_group_owner(old.id) then
      raise exception using errcode = '42501', message = 'only the owner can archive a group';
    end if;
    if new.archived_at is null then
      raise exception using errcode = '55000', message = 'groups cannot be unarchived by clients';
    end if;
    new.archived_by := (select auth.uid());
  elsif new.archived_by is distinct from old.archived_by then
    raise exception using errcode = '42501', message = 'archived_by is database-maintained';
  end if;
  return new;
end;
$$;

create trigger groups_protect_fields
before update on public.groups
for each row execute function public.protect_group_fields();

create or replace function public.validate_group_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visibility = 'group' then
    if new.group_id is null then
      raise exception using errcode = '23514', message = 'group visibility requires group_id';
    end if;
    if not exists (
      select 1 from public.groups
      where id = new.group_id and archived_at is null
    ) then
      raise exception using errcode = '55000', message = 'group is unavailable or archived';
    end if;
    if not public.is_active_group_member(new.group_id) then
      raise exception using errcode = '42501', message = 'active group membership required';
    end if;
  elsif new.group_id is not null then
    raise exception using errcode = '23514', message = 'non-group entries cannot have group_id';
  end if;
  return new;
end;
$$;

create trigger map_entries_validate_group
before insert or update of visibility, group_id on public.map_entries
for each row execute function public.validate_group_entry();

create or replace function public.join_public_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if not exists (
    select 1 from public.groups
    where id = p_group_id and visibility = 'public' and archived_at is null
  ) then
    raise exception using errcode = '42501', message = 'public active group required';
  end if;
  insert into public.group_members (group_id, user_id, role, status, joined_at)
  values (p_group_id, (select auth.uid()), 'member', 'active', now())
  on conflict (group_id, user_id) do update
    set role = 'member', status = 'active', joined_at = now(), updated_at = now();
end;
$$;

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare current_role text;
begin
  select role into current_role
  from public.group_members
  where group_id = p_group_id
    and user_id = (select auth.uid())
    and status = 'active';
  if current_role is null then
    raise exception using errcode = 'P0002', message = 'active membership not found';
  end if;
  if current_role = 'owner' then
    raise exception using errcode = '42501', message = 'owner must transfer ownership before leaving';
  end if;
  update public.group_members
  set status = 'left', updated_at = now()
  where group_id = p_group_id and user_id = (select auth.uid());
end;
$$;

create or replace function public.invite_group_member(p_group_id uuid, p_invitee_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare invitation_id uuid;
begin
  if not public.is_group_admin(p_group_id) then
    raise exception using errcode = '42501', message = 'group administrator required';
  end if;
  if not exists (select 1 from public.groups where id = p_group_id and archived_at is null) then
    raise exception using errcode = '55000', message = 'group is archived';
  end if;
  if p_invitee_id = (select auth.uid()) then
    raise exception using errcode = '23514', message = 'cannot invite yourself';
  end if;
  if not exists (select 1 from public.profiles where id = p_invitee_id) then
    raise exception using errcode = 'P0002', message = 'invitee not found';
  end if;
  if exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_invitee_id and status = 'active'
  ) then
    raise exception using errcode = '23505', message = 'user is already a member';
  end if;
  update public.group_invitations
  set status = 'cancelled', responded_at = now()
  where group_id = p_group_id and invitee_id = p_invitee_id and status = 'pending';
  insert into public.group_invitations (group_id, inviter_id, invitee_id)
  values (p_group_id, (select auth.uid()), p_invitee_id)
  returning id into invitation_id;
  return invitation_id;
end;
$$;

create or replace function public.respond_group_invitation(p_invitation_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare invitation public.group_invitations;
begin
  select * into invitation
  from public.group_invitations
  where id = p_invitation_id and invitee_id = (select auth.uid())
  for update;
  if invitation.id is null then
    raise exception using errcode = 'P0002', message = 'invitation not found';
  end if;
  if invitation.status <> 'pending' then
    raise exception using errcode = '55000', message = 'invitation already handled';
  end if;
  if invitation.expires_at <= now() then
    update public.group_invitations
    set status = 'expired', responded_at = now()
    where id = invitation.id;
    raise exception using errcode = '55000', message = 'invitation expired';
  end if;
  if p_accept then
    if exists (select 1 from public.groups where id = invitation.group_id and archived_at is not null) then
      raise exception using errcode = '55000', message = 'group is archived';
    end if;
    insert into public.group_members (group_id, user_id, role, status, joined_at)
    values (invitation.group_id, invitation.invitee_id, 'member', 'active', now())
    on conflict (group_id, user_id) do update
      set role = 'member', status = 'active', joined_at = now(), updated_at = now();
    update public.group_invitations
    set status = 'accepted', responded_at = now()
    where id = invitation.id;
  else
    update public.group_invitations
    set status = 'declined', responded_at = now()
    where id = invitation.id;
  end if;
end;
$$;

create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_role text;
declare target_role text;
begin
  select role into actor_role from public.group_members
  where group_id = p_group_id and user_id = (select auth.uid()) and status = 'active';
  select role into target_role from public.group_members
  where group_id = p_group_id and user_id = p_user_id and status = 'active';
  if actor_role not in ('owner', 'admin') or target_role is null then
    raise exception using errcode = '42501', message = 'insufficient group permission';
  end if;
  if exists (select 1 from public.groups where id = p_group_id and archived_at is not null) then
    raise exception using errcode = '55000', message = 'group is archived';
  end if;
  if target_role = 'owner' or (actor_role = 'admin' and target_role <> 'member') then
    raise exception using errcode = '42501', message = 'cannot remove this member';
  end if;
  update public.group_members
  set status = 'removed', updated_at = now()
  where group_id = p_group_id and user_id = p_user_id;
end;
$$;

create or replace function public.change_group_member_role(
  p_group_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.groups where id = p_group_id for update;
  if not public.is_group_owner(p_group_id) then
    raise exception using errcode = '42501', message = 'group owner required';
  end if;
  if exists (select 1 from public.groups where id = p_group_id and archived_at is not null) then
    raise exception using errcode = '55000', message = 'group is archived';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception using errcode = '23514', message = 'invalid role';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception using errcode = '42501', message = 'owner role requires transfer';
  end if;
  update public.group_members
  set role = p_role, updated_at = now()
  where group_id = p_group_id and user_id = p_user_id and status = 'active';
  if not found then
    raise exception using errcode = 'P0002', message = 'active member not found';
  end if;
end;
$$;

create or replace function public.transfer_group_ownership(p_group_id uuid, p_new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.groups where id = p_group_id for update;
  if not public.is_group_owner(p_group_id) then
    raise exception using errcode = '42501', message = 'group owner required';
  end if;
  if exists (select 1 from public.groups where id = p_group_id and archived_at is not null) then
    raise exception using errcode = '55000', message = 'group is archived';
  end if;
  if p_new_owner_id = (select auth.uid()) then return; end if;
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_new_owner_id and status = 'active'
  ) then
    raise exception using errcode = 'P0002', message = 'new owner must be an active member';
  end if;
  update public.group_members
  set role = 'admin', updated_at = now()
  where group_id = p_group_id and user_id = (select auth.uid()) and role = 'owner';
  update public.group_members
  set role = 'owner', updated_at = now()
  where group_id = p_group_id and user_id = p_new_owner_id;
end;
$$;

create or replace function public.soft_delete_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.entry_comments
  set content = '', deleted_at = now(), updated_at = now()
  where id = p_comment_id
    and user_id = (select auth.uid())
    and deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'comment not found or not owned';
  end if;
end;
$$;

create or replace function public.moderate_group_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target_group_id uuid;
begin
  select e.group_id into target_group_id
  from public.entry_comments c
  join public.map_entries e on e.id = c.entry_id
  where c.id = p_comment_id and e.visibility = 'group';
  if target_group_id is null or not public.is_group_admin(target_group_id) then
    raise exception using errcode = '42501', message = 'group administrator required';
  end if;
  update public.entry_comments
  set content = '', deleted_at = coalesce(deleted_at, now()),
      moderated_at = now(), moderated_by = (select auth.uid()), updated_at = now()
  where id = p_comment_id;
end;
$$;

create or replace function public.prevent_report_spam()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.reports
    where reporter_id = new.reporter_id
      and target_type = new.target_type
      and target_id = new.target_id
      and created_at > now() - interval '1 hour'
  ) then
    raise exception using errcode = '23505', message = 'duplicate report in cooldown';
  end if;
  return new;
end;
$$;

create trigger reports_prevent_spam
before insert on public.reports
for each row execute function public.prevent_report_spam();

create or replace function public.get_social_feed(
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  user_id uuid,
  title text,
  content text,
  place_name text,
  latitude double precision,
  longitude double precision,
  time_label text,
  visibility text,
  group_id uuid,
  place_category_slug text,
  allow_comments boolean,
  created_at timestamptz,
  updated_at timestamptz,
  author_display_name text,
  author_avatar_url text,
  group_name text,
  group_slug text,
  like_count bigint,
  comment_count bigint,
  user_liked boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id, e.user_id, e.title::text, e.content, e.place_name,
    e.latitude, e.longitude, e.time_label, e.visibility, e.group_id,
    e.place_category_slug, e.allow_comments, e.created_at, e.updated_at,
    p.display_name, p.avatar_url, g.name::text, g.slug,
    (select count(*) from public.entry_likes l where l.entry_id = e.id),
    (select count(*) from public.entry_comments c where c.entry_id = e.id and c.deleted_at is null),
    exists (
      select 1 from public.entry_likes mine
      where mine.entry_id = e.id and mine.user_id = (select auth.uid())
    )
  from public.map_entries e
  join public.profiles p on p.id = e.user_id
  left join public.groups g on g.id = e.group_id
  where (select auth.uid()) is not null
    and (
      (
        e.user_id = (select auth.uid())
        and e.visibility in ('public', 'private')
      )
      or (
        e.visibility = 'public'
        and exists (
          select 1 from public.follows f
          where f.follower_id = (select auth.uid()) and f.following_id = e.user_id
        )
      )
      or (
        e.visibility = 'group'
        and exists (
          select 1 from public.group_members gm
          where gm.group_id = e.group_id
            and gm.user_id = (select auth.uid())
            and gm.status = 'active'
        )
      )
    )
    and (
      p_cursor_created_at is null
      or (e.created_at, e.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by e.created_at desc, e.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke all on function public.join_public_group(uuid) from public;
revoke all on function public.leave_group(uuid) from public;
revoke all on function public.invite_group_member(uuid, uuid) from public;
revoke all on function public.respond_group_invitation(uuid, boolean) from public;
revoke all on function public.remove_group_member(uuid, uuid) from public;
revoke all on function public.change_group_member_role(uuid, uuid, text) from public;
revoke all on function public.transfer_group_ownership(uuid, uuid) from public;
revoke all on function public.soft_delete_comment(uuid) from public;
revoke all on function public.moderate_group_comment(uuid) from public;
revoke all on function public.get_social_feed(timestamptz, uuid, integer) from public;
grant execute on function public.join_public_group(uuid) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.invite_group_member(uuid, uuid) to authenticated;
grant execute on function public.respond_group_invitation(uuid, boolean) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.change_group_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated;
grant execute on function public.soft_delete_comment(uuid) to authenticated;
grant execute on function public.moderate_group_comment(uuid) to authenticated;
grant execute on function public.get_social_feed(timestamptz, uuid, integer) to authenticated;

alter table public.place_categories enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invitations enable row level security;
alter table public.follows enable row level security;
alter table public.entry_likes enable row level security;
alter table public.entry_comments enable row level security;
alter table public.reports enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_members'
  ) then
    alter publication supabase_realtime add table public.group_members;
  end if;
end;
$$;

create policy "categories_public_read"
on public.place_categories for select to anon, authenticated
using (is_active);

create policy "groups_visible_to_public_members_or_invitees"
on public.groups for select to anon, authenticated
using (public.can_view_group(id));

create policy "authenticated_users_create_groups"
on public.groups for insert to authenticated
with check (created_by = (select auth.uid()) and archived_at is null and archived_by is null);

create policy "group_admins_update_groups"
on public.groups for update to authenticated
using (public.is_group_admin(id))
with check (public.is_group_admin(id));

create policy "group_members_visible_when_group_visible"
on public.group_members for select to anon, authenticated
using (
  public.is_active_group_member(group_id)
  or exists (
    select 1 from public.groups g
    where g.id = group_id and g.visibility = 'public'
  )
);

create policy "invitations_visible_to_invitee_or_admin"
on public.group_invitations for select to authenticated
using (
  invitee_id = (select auth.uid())
  or public.is_group_admin(group_id)
);

create policy "follows_are_public"
on public.follows for select to anon, authenticated
using (true);

create policy "users_create_own_follows"
on public.follows for insert to authenticated
with check (follower_id = (select auth.uid()) and follower_id <> following_id);

create policy "users_delete_own_follows"
on public.follows for delete to authenticated
using (follower_id = (select auth.uid()));

drop policy if exists "entries_public_or_owned_select" on public.map_entries;
drop policy if exists "entries_owner_insert" on public.map_entries;
drop policy if exists "entries_owner_update" on public.map_entries;

create policy "entries_visible_by_visibility_model"
on public.map_entries for select to anon, authenticated
using (
  visibility = 'public'
  or (visibility = 'private' and user_id = (select auth.uid()))
  or (visibility = 'group' and public.is_active_group_member(group_id))
);

create policy "entries_owner_insert_with_group_membership"
on public.map_entries for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (
    visibility <> 'group'
    or public.is_active_group_member(group_id)
  )
);

create policy "entries_owner_update_with_group_membership"
on public.map_entries for update to authenticated
using (
  user_id = (select auth.uid())
  and (
    visibility <> 'group'
    or public.is_active_group_member(group_id)
  )
)
with check (
  user_id = (select auth.uid())
  and (
    visibility <> 'group'
    or public.is_active_group_member(group_id)
  )
);

create policy "likes_visible_with_entry"
on public.entry_likes for select to anon, authenticated
using (public.can_read_entry(entry_id));

create policy "users_like_interactable_entries"
on public.entry_likes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.can_interact_entry(entry_id)
);

create policy "users_remove_own_likes"
on public.entry_likes for delete to authenticated
using (user_id = (select auth.uid()) and public.can_read_entry(entry_id));

create policy "comments_visible_with_entry"
on public.entry_comments for select to anon, authenticated
using (public.can_read_entry(entry_id));

create policy "users_comment_on_interactable_entries"
on public.entry_comments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.can_interact_entry(entry_id)
  and exists (
    select 1 from public.map_entries e
    where e.id = entry_id and e.allow_comments
  )
);

create policy "users_edit_own_live_comments"
on public.entry_comments for update to authenticated
using (user_id = (select auth.uid()) and deleted_at is null)
with check (user_id = (select auth.uid()) and deleted_at is null);

create policy "reporters_read_only_their_reports"
on public.reports for select to authenticated
using (reporter_id = (select auth.uid()));

create policy "users_create_valid_reports"
on public.reports for insert to authenticated
with check (
  reporter_id = (select auth.uid())
  and public.can_report_target(target_type, target_id)
  and status = 'pending'
  and reviewed_at is null
  and reviewed_by is null
);

grant select on public.place_categories to anon, authenticated;
grant select on public.groups to anon, authenticated;
grant insert (
  slug, name, description, avatar_url, visibility, created_by
) on public.groups to authenticated;
grant update (
  slug, name, description, avatar_url, visibility, archived_at
) on public.groups to authenticated;
grant select on public.group_members to anon, authenticated;
grant select on public.group_invitations to authenticated;
grant select on public.follows to anon, authenticated;
grant insert (follower_id, following_id) on public.follows to authenticated;
grant delete on public.follows to authenticated;
grant select on public.entry_likes to anon, authenticated;
grant insert (entry_id, user_id) on public.entry_likes to authenticated;
grant delete on public.entry_likes to authenticated;
grant select on public.entry_comments to anon, authenticated;
grant insert (entry_id, user_id, content) on public.entry_comments to authenticated;
grant update (content) on public.entry_comments to authenticated;
grant select on public.reports to authenticated;
grant insert (
  reporter_id, target_type, target_id, reason, description
) on public.reports to authenticated;

revoke update on public.map_entries from authenticated;
grant update (
  title, content, place_name, latitude, longitude,
  occurred_local, occurred_timezone, occurred_date, occurred_year,
  time_precision, time_label, visibility, group_id,
  place_category_slug, allow_comments
) on public.map_entries to authenticated;

revoke insert on public.map_entries from authenticated;
grant insert (
  user_id, title, content, place_name, latitude, longitude,
  occurred_local, occurred_timezone, occurred_date, occurred_year,
  time_precision, time_label, visibility, group_id,
  place_category_slug, allow_comments
) on public.map_entries to authenticated;

comment on table public.groups is 'Public/private narrative groups. Archived groups are retained read-only.';
comment on table public.group_members is 'Membership mutations are allowed only through restricted RPC functions.';
comment on table public.reports is 'User-submitted moderation queue; ordinary users can read only their own reports.';

-- ============================================================
-- MIGRATION: 202607240001_unique_display_names_and_schema_refresh.sql
-- ============================================================
-- 故事情感地图：昵称唯一性、注册触发器升级与 PostgREST schema 刷新
-- 必须在 202607230001_groups_social_categories.sql 之后执行。
-- 不删除用户；历史重复昵称保留最早账户的原昵称，后续账户增加稳定后缀。

do $$
begin
  if to_regclass('public.groups') is null
    or to_regclass('public.group_members') is null
    or to_regclass('public.group_invitations') is null then
    raise exception using
      errcode = '42P01',
      message = 'apply 202607230001_groups_social_categories.sql before this migration';
  end if;
end;
$$;

create or replace function public.format_display_name(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(btrim(coalesce(value, '')), '[[:space:]]+', ' ', 'g');
$$;

create or replace function public.normalize_display_name(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(public.format_display_name(value));
$$;

-- 先统一存储格式：去除首尾空白，并把连续空白折叠为一个普通空格。
update public.profiles
set display_name = public.format_display_name(display_name)
where display_name is distinct from public.format_display_name(display_name);

-- 同一规范化昵称中，按 created_at、id 保留最早账户；其他账户追加
-- “-序号-UUID前6位”。循环只处理极端情况下与已有昵称再次碰撞的情况。
do $$
declare
  duplicate_profile record;
  suffix text;
  candidate text;
  attempt integer;
begin
  for duplicate_profile in
    select
      id,
      display_name,
      row_number() over (
        partition by public.normalize_display_name(display_name)
        order by created_at asc, id asc
      ) as duplicate_rank
    from public.profiles
  loop
    if duplicate_profile.duplicate_rank > 1 then
      attempt := 0;
      loop
        suffix :=
          '-' || duplicate_profile.duplicate_rank::text ||
          '-' || left(replace(duplicate_profile.id::text, '-', ''), 6) ||
          case when attempt = 0 then '' else '-' || attempt::text end;
        candidate :=
          left(
            duplicate_profile.display_name,
            greatest(1, 80 - char_length(suffix))
          ) || suffix;

        exit when not exists (
          select 1
          from public.profiles existing
          where existing.id <> duplicate_profile.id
            and public.normalize_display_name(existing.display_name) =
                public.normalize_display_name(candidate)
        );
        attempt := attempt + 1;
      end loop;

      update public.profiles
      set display_name = candidate
      where id = duplicate_profile.id;
    end if;
  end loop;
end;
$$;

create unique index profiles_display_name_normalized_uidx
on public.profiles (public.normalize_display_name(display_name));

alter table public.profiles
  add constraint profiles_display_name_canonical
  check (
    display_name = public.format_display_name(display_name)
    and char_length(display_name) between 1 and 80
  );

create or replace function public.normalize_profile_display_name_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.display_name := public.format_display_name(new.display_name);
  if char_length(new.display_name) not between 1 and 80 then
    raise exception using
      errcode = '23514',
      message = 'display name must contain 1 to 80 characters';
  end if;
  return new;
end;
$$;

create trigger profiles_normalize_display_name
before insert or update of display_name on public.profiles
for each row execute function public.normalize_profile_display_name_before_write();

-- 替换既有注册触发器所调用的函数。邮箱仍只存在于 auth.users，
-- public.profiles 只写入 auth user id 和显示名。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
begin
  requested_name :=
    public.format_display_name(new.raw_user_meta_data ->> 'display_name');

  if char_length(requested_name) not between 1 and 80 then
    requested_name := '地图旅人-' || new.id::text;
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, requested_name);

  return new;
end;
$$;

create or replace function public.is_display_name_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    char_length(public.format_display_name(candidate)) between 1 and 80
    and not exists (
      select 1
      from public.profiles profile
      where public.normalize_display_name(profile.display_name) =
            public.normalize_display_name(candidate)
        and (
          (select auth.uid()) is null
          or profile.id <> (select auth.uid())
        )
    );
$$;

revoke all on function public.format_display_name(text) from public;
revoke all on function public.normalize_display_name(text) from public;
revoke all on function public.is_display_name_available(text) from public;
grant execute on function public.format_display_name(text) to anon, authenticated;
grant execute on function public.normalize_display_name(text) to anon, authenticated;
grant execute on function public.is_display_name_available(text)
to anon, authenticated;

comment on function public.normalize_display_name(text) is
  'Unique display-name comparison: trim, collapse whitespace, and lowercase.';
comment on function public.is_display_name_available(text) is
  'Returns only availability. Authenticated users may retain their own current display name.';

-- 让 PostgREST 在 migration 后重新读取新增函数、索引和既有群组对象。
notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 202607250001_timelines_story_routes.sql
-- ============================================================
-- Story timelines and shareable story routes.
-- Requires the social/group migration because route visibility reuses its
-- membership and entry-read permission helpers.

do $$
begin
  if to_regclass('public.groups') is null
    or to_regclass('public.group_members') is null
    or to_regclass('public.map_entries') is null
    or to_regprocedure('public.is_active_group_member(uuid)') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'story routes require migration 202607230001_groups_social_categories.sql';
  end if;
end;
$$;

create table public.story_routes (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete restrict,
  title varchar(100) not null,
  description varchar(2000) not null default '',
  visibility text not null default 'private',
  share_slug text not null unique
    default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
  published_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  featured_at timestamptz,
  featured_by uuid references public.profiles(id) on delete set null,
  privacy_downgraded_at timestamptz,
  node_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint story_routes_title_not_blank check (char_length(btrim(title)) between 1 and 100),
  constraint story_routes_description_length check (char_length(description) <= 2000),
  constraint story_routes_visibility_values check (visibility in ('public', 'private', 'group')),
  constraint story_routes_group_visibility_consistency check (
    (visibility = 'group' and group_id is not null)
    or (visibility <> 'group' and group_id is null)
  ),
  constraint story_routes_node_count_range check (node_count between 0 and 200),
  constraint story_routes_archive_actor_consistency check (
    (archived_at is null and archived_by is null)
    or (archived_at is not null and archived_by is not null)
  ),
  constraint story_routes_feature_actor_consistency check (
    (featured_at is null and featured_by is null)
    or (featured_at is not null and featured_by is not null)
  )
);

create table public.story_route_items (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.story_routes(id) on delete cascade,
  entry_id uuid not null references public.map_entries(id) on delete cascade,
  position integer not null,
  note varchar(500) not null default '',
  created_at timestamptz not null default now(),
  constraint story_route_items_position_range check (position between 1 and 200),
  constraint story_route_items_note_length check (char_length(note) <= 500),
  constraint story_route_items_route_entry_unique unique (route_id, entry_id),
  constraint story_route_items_route_position_unique unique (route_id, position)
);

create index story_routes_creator_updated_idx
  on public.story_routes(created_by, updated_at desc, id desc);
create index story_routes_group_published_idx
  on public.story_routes(group_id, published_at desc, id desc)
  where visibility = 'group' and archived_at is null;
create index story_routes_public_published_idx
  on public.story_routes(published_at desc, id desc)
  where visibility = 'public' and archived_at is null and published_at is not null;
create index story_route_items_route_position_idx
  on public.story_route_items(route_id, position);
create index story_route_items_entry_idx
  on public.story_route_items(entry_id);

create index if not exists map_entries_owner_timeline_idx
  on public.map_entries(user_id, occurred_year, occurred_date, created_at desc, id desc);
create index if not exists map_entries_group_timeline_idx
  on public.map_entries(group_id, occurred_year, occurred_date, created_at desc, id desc)
  where visibility = 'group';

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
  select e.*
  from public.map_entries e
  cross join lateral (
    select coalesce(
      e.occurred_year,
      case
        when e.time_precision = 'approximate' then
          (
            regexp_match(
              e.time_label,
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
        and e.user_id = p_target_id
      )
      or (
        p_scope = 'user'
        and e.user_id = p_target_id
        and e.visibility = 'public'
      )
      or (
        p_scope = 'group'
        and e.group_id = p_target_id
        and e.visibility = 'group'
      )
    )
    and (p_visibility is null or e.visibility = p_visibility)
    and (
      p_category_slugs is null
      or e.place_category_slug = any(p_category_slugs)
    )
    and (p_author_id is null or e.user_id = p_author_id)
    and (
      nullif(btrim(coalesce(p_keyword, '')), '') is null
      or position(
        lower(btrim(p_keyword))
        in lower(concat_ws(' ', e.title, e.content, e.place_name, e.time_label))
      ) > 0
    )
    and (p_include_undated or timeline.event_year is not null)
    and (p_start_year is null or timeline.event_year >= p_start_year)
    and (p_end_year is null or timeline.event_year <= p_end_year)
  order by
    (timeline.event_year is null) asc,
    case when p_order = 'asc' then timeline.event_year end asc,
    case when p_order <> 'asc' then timeline.event_year end desc,
    case when p_order = 'asc' then coalesce(e.occurred_local, e.occurred_date::timestamp) end asc nulls last,
    case when p_order <> 'asc' then coalesce(e.occurred_local, e.occurred_date::timestamp) end desc nulls last,
    case when p_order = 'asc' then e.created_at end asc,
    case when p_order <> 'asc' then e.created_at end desc,
    e.id asc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 51), 1), 51);
$$;

create trigger story_routes_set_updated_at
before update on public.story_routes
for each row execute function public.set_updated_at();

create or replace function public.can_view_story_route(p_route_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.story_routes r
    where r.id = p_route_id
      and (
        (
          r.visibility = 'private'
          and r.created_by = (select auth.uid())
        )
        or (
          r.visibility = 'public'
          and (
            r.created_by = (select auth.uid())
            or (
              r.published_at is not null
              and r.archived_at is null
            )
          )
        )
        or (
          r.visibility = 'group'
          and public.is_active_group_member(r.group_id)
          and (
            r.created_by = (select auth.uid())
            or r.published_at is not null
          )
        )
      )
  );
$$;

create or replace function public.can_read_story_route_item(
  p_route_id uuid,
  p_entry_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_view_story_route(p_route_id)
    and public.can_read_entry(p_entry_id);
$$;

create or replace function public.save_story_route(
  p_route_id uuid,
  p_title text,
  p_description text,
  p_visibility text,
  p_group_id uuid,
  p_publish boolean,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target_route_id uuid := p_route_id;
  item_count integer;
  valid_count integer;
  existing public.story_routes%rowtype;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 100 then
    raise exception using errcode = '23514', message = 'invalid route title';
  end if;
  if char_length(coalesce(p_description, '')) > 2000 then
    raise exception using errcode = '23514', message = 'route description too long';
  end if;
  if p_visibility not in ('public', 'private', 'group') then
    raise exception using errcode = '23514', message = 'invalid route visibility';
  end if;
  if (p_visibility = 'group') <> (p_group_id is not null) then
    raise exception using errcode = '23514', message = 'route group does not match visibility';
  end if;
  if p_visibility = 'group' and (
    not public.is_active_group_member(p_group_id)
    or exists (
      select 1 from public.groups
      where id = p_group_id and archived_at is not null
    )
  ) then
    raise exception using errcode = '42501', message = 'active group membership required';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'route items must be an array';
  end if;

  select count(*) into item_count
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb));
  if item_count < 1 or item_count > 200 then
    raise exception using errcode = '23514', message = 'route must contain between 1 and 200 items';
  end if;
  if p_publish and item_count < 2 then
    raise exception using errcode = '23514', message = 'published route requires at least two items';
  end if;

  if (
    select count(distinct (item->>'entry_id'))
    from jsonb_array_elements(p_items) item
  ) <> item_count or (
    select count(distinct (item->>'position')::integer)
    from jsonb_array_elements(p_items) item
    where (item->>'position') ~ '^[0-9]+$'
  ) <> item_count then
    raise exception using errcode = '23505', message = 'route items must be unique';
  end if;

  select count(*) into valid_count
  from jsonb_array_elements(p_items) item
  join public.map_entries e on e.id = (item->>'entry_id')::uuid
  where (item->>'position')::integer between 1 and 200
    and char_length(coalesce(item->>'note', '')) <= 500
    and (
      e.user_id = actor
      or (
        e.visibility = 'group'
        and public.is_active_group_member(e.group_id)
        and (p_visibility <> 'group' or e.group_id = p_group_id)
      )
    )
    and (
      (p_visibility = 'public' and e.visibility = 'public')
      or (p_visibility = 'private' and public.can_read_entry(e.id))
      or (
        p_visibility = 'group'
        and (
          (e.visibility = 'group' and e.group_id = p_group_id)
          or e.visibility = 'public'
        )
        and public.can_read_entry(e.id)
      )
    );
  if valid_count <> item_count then
    raise exception using errcode = '42501', message = 'one or more route items are not eligible';
  end if;

  if target_route_id is null then
    insert into public.story_routes (
      created_by, title, description, visibility, group_id, published_at, node_count
    ) values (
      actor, btrim(p_title), coalesce(p_description, ''), p_visibility, p_group_id,
      case when p_publish then now() else null end, item_count
    )
    returning id into target_route_id;
  else
    select * into existing
    from public.story_routes
    where id = target_route_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'route not found';
    end if;
    if existing.created_by <> actor or existing.archived_at is not null then
      raise exception using errcode = '42501', message = 'route cannot be edited';
    end if;
    if existing.visibility = 'group'
      and not public.is_active_group_member(existing.group_id)
    then
      raise exception using errcode = '42501', message = 'active group membership required';
    end if;
    update public.story_routes
    set title = btrim(p_title),
        description = coalesce(p_description, ''),
        visibility = p_visibility,
        group_id = p_group_id,
        published_at = case
          when p_publish then coalesce(existing.published_at, now())
          else null
        end,
        node_count = item_count,
        privacy_downgraded_at = null
    where id = target_route_id;
    delete from public.story_route_items where route_id = target_route_id;
  end if;

  insert into public.story_route_items (route_id, entry_id, position, note)
  select
    target_route_id,
    (item->>'entry_id')::uuid,
    (item->>'position')::integer,
    coalesce(item->>'note', '')
  from jsonb_array_elements(p_items) item;

  -- Deleting old nodes fires the safety trigger. Restore the intended publish
  -- state and derived count only after the replacement set is complete.
  update public.story_routes
  set node_count = item_count,
      published_at = case
        when p_publish then coalesce(published_at, now())
        else null
      end
  where id = target_route_id;

  return target_route_id;
end;
$$;

create or replace function public.archive_story_route(p_route_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  route_row public.story_routes%rowtype;
begin
  select * into route_row from public.story_routes where id = p_route_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'route not found';
  end if;
  if (
    route_row.created_by <> actor
    or (
      route_row.visibility = 'group'
      and not public.is_active_group_member(route_row.group_id)
    )
  ) and not (
    route_row.visibility = 'group' and public.is_group_admin(route_row.group_id)
  ) then
    raise exception using errcode = '42501', message = 'route cannot be archived';
  end if;
  update public.story_routes
  set archived_at = coalesce(archived_at, now()),
      archived_by = coalesce(archived_by, actor)
  where id = p_route_id;
end;
$$;

create or replace function public.feature_story_route(
  p_route_id uuid,
  p_featured boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  route_group uuid;
begin
  select r.group_id into route_group
  from public.story_routes r
  join public.groups g on g.id = r.group_id
  where r.id = p_route_id
    and r.visibility = 'group'
    and r.archived_at is null
    and g.archived_at is null;
  if route_group is null or not public.is_group_admin(route_group) then
    raise exception using errcode = '42501', message = 'group admin required';
  end if;
  update public.story_routes
  set featured_at = case when p_featured then now() else null end,
      featured_by = case when p_featured then actor else null end
  where id = p_route_id;
end;
$$;

create or replace function public.refresh_story_route_after_item_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining integer;
begin
  select count(*) into remaining
  from public.story_route_items
  where route_id = old.route_id;
  update public.story_routes
  set node_count = remaining,
      published_at = case when remaining < 2 then null else published_at end
  where id = old.route_id;
  return old;
end;
$$;

create trigger story_route_items_refresh_after_delete
after delete on public.story_route_items
for each row execute function public.refresh_story_route_after_item_delete();

create or replace function public.protect_public_story_routes_on_entry_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.visibility = 'public' and new.visibility <> 'public' then
    update public.story_routes r
    set visibility = 'private',
        group_id = null,
        privacy_downgraded_at = now()
    where r.visibility = 'public'
      and exists (
        select 1 from public.story_route_items i
        where i.route_id = r.id and i.entry_id = new.id
      );
  end if;
  return new;
end;
$$;

create trigger map_entries_protect_public_routes
after update of visibility, group_id on public.map_entries
for each row execute function public.protect_public_story_routes_on_entry_change();

alter table public.story_routes enable row level security;
alter table public.story_route_items enable row level security;

create policy "story_routes_visible_by_route_permission"
on public.story_routes for select to anon, authenticated
using (public.can_view_story_route(id));

create policy "story_route_items_visible_with_route_and_entry"
on public.story_route_items for select to anon, authenticated
using (public.can_read_story_route_item(route_id, entry_id));

grant select on public.story_routes to anon, authenticated;
grant select on public.story_route_items to anon, authenticated;

revoke all on function public.can_view_story_route(uuid) from public;
revoke all on function public.can_read_story_route_item(uuid, uuid) from public;
revoke all on function public.save_story_route(uuid, text, text, text, uuid, boolean, jsonb) from public;
revoke all on function public.archive_story_route(uuid) from public;
revoke all on function public.feature_story_route(uuid, boolean) from public;
revoke all on function public.refresh_story_route_after_item_delete() from public;
revoke all on function public.protect_public_story_routes_on_entry_change() from public;
revoke all on function public.get_timeline_entries(
  text, uuid, text, text, text[], uuid, text, integer, integer, boolean, integer, integer
) from public;

grant execute on function public.can_view_story_route(uuid) to anon, authenticated;
grant execute on function public.can_read_story_route_item(uuid, uuid) to anon, authenticated;
grant execute on function public.save_story_route(uuid, text, text, text, uuid, boolean, jsonb) to authenticated;
grant execute on function public.archive_story_route(uuid) to authenticated;
grant execute on function public.feature_story_route(uuid, boolean) to authenticated;
grant execute on function public.get_timeline_entries(
  text, uuid, text, text, text[], uuid, text, integer, integer, boolean, integer, integer
) to anon, authenticated;

comment on table public.story_routes is
  'Independent ordered story routes. Route nodes reference source entries and never copy entry content or coordinates.';
comment on column public.story_routes.privacy_downgraded_at is
  'Set when a public source entry becomes restricted and the route is automatically changed to private.';
comment on table public.story_route_items is
  'Ordered references to map_entries. Direct client writes are intentionally not granted.';

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 202607250002_group_membership_hardening.sql
-- ============================================================
-- Harden group ownership invariants and RPC execution privileges.
-- This migration is additive and intentionally leaves existing groups and stories intact.

-- Repair any previously orphaned group by restoring its original creator as owner.
-- This is deterministic, preserves all other memberships, and avoids deleting data.
insert into public.group_members (
  group_id,
  user_id,
  role,
  status,
  joined_at
)
select
  target.id,
  target.created_by,
  'owner',
  'active',
  target.created_at
from public.groups as target
where not exists (
  select 1
  from public.group_members as membership
  where membership.group_id = target.id
    and membership.role = 'owner'
    and membership.status = 'active'
)
on conflict (group_id, user_id) do update
set
  role = 'owner',
  status = 'active',
  joined_at = coalesce(public.group_members.joined_at, excluded.joined_at),
  updated_at = now();

create or replace function public.ensure_group_has_active_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_group_id uuid;
begin
  target_group_id := case when tg_op = 'DELETE' then old.group_id else new.group_id end;

  if exists (
    select 1
    from public.groups
    where id = target_group_id
  ) and not exists (
    select 1
    from public.group_members
    where group_id = target_group_id
      and role = 'owner'
      and status = 'active'
  ) then
    raise exception using
      errcode = '23514',
      message = 'group must retain at least one active owner';
  end if;

  return null;
end;
$$;

revoke all on function public.ensure_group_has_active_owner() from public, anon, authenticated;

drop trigger if exists group_members_require_active_owner on public.group_members;
create constraint trigger group_members_require_active_owner
after insert or update or delete on public.group_members
deferrable initially deferred
for each row execute function public.ensure_group_has_active_owner();

create or replace function public.join_public_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_role text;
  existing_status text;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if not exists (
    select 1
    from public.groups
    where id = p_group_id
      and visibility = 'public'
      and archived_at is null
  ) then
    raise exception using errcode = '42501', message = 'public active group required';
  end if;

  select role, status
  into existing_role, existing_status
  from public.group_members
  where group_id = p_group_id
    and user_id = (select auth.uid())
  for update;

  if found then
    -- Repeated joins are idempotent and must never demote an owner or admin.
    if existing_status = 'active' then
      return;
    end if;

    -- Removal by a moderator remains effective until an administrator invites
    -- the user again. A voluntary leave may be reversed by joining again.
    if existing_status = 'removed' then
      raise exception using
        errcode = '42501',
        message = 'removed membership requires a new invitation';
    end if;

    update public.group_members
    set
      role = case when existing_role = 'owner' then 'owner' else 'member' end,
      status = 'active',
      joined_at = now(),
      updated_at = now()
    where group_id = p_group_id
      and user_id = (select auth.uid());
    return;
  end if;

  insert into public.group_members (
    group_id,
    user_id,
    role,
    status,
    joined_at
  )
  values (
    p_group_id,
    (select auth.uid()),
    'member',
    'active',
    now()
  );
end;
$$;

-- Explicitly remove anonymous execution from authentication-only helpers and
-- mutation RPCs. The additional anon revoke also repairs remote ACL drift.
revoke execute on function public.is_group_admin(uuid) from public, anon;
revoke execute on function public.is_group_owner(uuid) from public, anon;
revoke execute on function public.can_interact_entry(uuid) from public, anon;
revoke execute on function public.can_report_target(text, uuid) from public, anon;
revoke execute on function public.join_public_group(uuid) from public, anon;
revoke execute on function public.leave_group(uuid) from public, anon;
revoke execute on function public.invite_group_member(uuid, uuid) from public, anon;
revoke execute on function public.respond_group_invitation(uuid, boolean) from public, anon;
revoke execute on function public.remove_group_member(uuid, uuid) from public, anon;
revoke execute on function public.change_group_member_role(uuid, uuid, text) from public, anon;
revoke execute on function public.transfer_group_ownership(uuid, uuid) from public, anon;
revoke execute on function public.soft_delete_comment(uuid) from public, anon;
revoke execute on function public.moderate_group_comment(uuid) from public, anon;
revoke execute on function public.get_social_feed(timestamptz, uuid, integer) from public, anon;

grant execute on function public.is_group_admin(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;
grant execute on function public.can_interact_entry(uuid) to authenticated;
grant execute on function public.can_report_target(text, uuid) to authenticated;
grant execute on function public.join_public_group(uuid) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.invite_group_member(uuid, uuid) to authenticated;
grant execute on function public.respond_group_invitation(uuid, boolean) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.change_group_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated;
grant execute on function public.soft_delete_comment(uuid) to authenticated;
grant execute on function public.moderate_group_comment(uuid) to authenticated;
grant execute on function public.get_social_feed(timestamptz, uuid, integer) to authenticated;

comment on function public.ensure_group_has_active_owner() is
  'Deferred ownership invariant: every retained group must have an active owner.';

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 202607250003_group_creator_select_policy.sql
-- ============================================================
-- Allow an authenticated group creator to read the row they just inserted.
--
-- The existing groups SELECT policy delegates to can_view_group(id). That
-- stable helper queries public.groups again and cannot reliably observe the
-- new row during INSERT ... RETURNING. PostgREST uses RETURNING when the
-- client chains .insert(...).select(...), so the insert can otherwise be
-- rolled back with SQLSTATE 42501 even though the INSERT policy passed.
--
-- This migration is intentionally limited to the missing RLS change. The
-- preceding timeline and group-hardening migrations already contain the
-- current project's new tables, fields, indexes, functions, and other RLS
-- changes.

do $$
begin
  if to_regclass('public.groups') is null then
    raise exception using
      errcode = '55000',
      message = 'group creator policy requires migration 202607230001_groups_social_categories.sql';
  end if;
end;
$$;

alter table public.groups enable row level security;

drop policy if exists "group_creators_can_read_own_groups"
on public.groups;

create policy "group_creators_can_read_own_groups"
on public.groups
as permissive
for select
to authenticated
using (
  created_by = (select auth.uid())
);

comment on policy "group_creators_can_read_own_groups"
on public.groups is
  'Lets a group creator read INSERT ... RETURNING directly without widening access to other groups.';

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 202607260001_entry_participants_tags.sql
-- ============================================================
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

-- ============================================================
-- MIGRATION: 202607300001_entry_rpc_group_membership.sql
-- ============================================================
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

-- ============================================================
-- MIGRATION: 202607300002_entry_rls_helper_execute.sql
-- ============================================================
-- Restore the minimum EXECUTE privileges required by RLS policy helpers.
-- The original collaboration migration revoked PUBLIC execution but omitted
-- grants for the API roles that evaluate the affected SELECT policies.

do $$
begin
  if to_regprocedure(
    'public.can_read_entry_edit_log(uuid,timestamp with time zone)'
  ) is null
    or to_regprocedure('public.can_read_tag(uuid)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'entry RLS helper grants require migration 202607260001_entry_participants_tags.sql';
  end if;
end;
$$;

revoke all on function public.can_read_entry_edit_log(uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.can_read_entry_edit_log(uuid, timestamptz)
to authenticated;

revoke all on function public.can_read_tag(uuid)
from public, anon, authenticated;
grant execute on function public.can_read_tag(uuid)
to anon, authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 202608040001_v11_schema_foundation.sql
-- ============================================================
-- Story-and-Place v1.1 schema foundation.
--
-- This migration is deliberately structural only. It does not enable the
-- Emotion Tags or Time Capsule product flows, replace permission helpers, or
-- grant clients access to newly added write columns. Later feature migrations
-- will activate each module together with its complete RLS/RPC/trigger rules.

do $$
begin
  if to_regclass('public.tags') is null
    or to_regclass('public.map_entries') is null
    or to_regclass('public.story_route_items') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null
    or to_regprocedure(
      'public.save_story_route(uuid,text,text,text,uuid,boolean,jsonb)'
    ) is null
  then
    raise exception using
      errcode = '55000',
      message = 'v1.1 foundation requires all migrations through 202607300002';
  end if;
end;
$$;

alter table public.tags
  add column type text not null default 'normal',
  add column semantic_key text;

alter table public.tags
  add constraint tags_type_values check (
    type in ('normal', 'emotion', 'theme', 'character', 'event')
  ),
  add constraint tags_semantic_key_format check (
    semantic_key is null
    or (
      char_length(semantic_key) between 2 and 48
      and semantic_key ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'
    )
  ),
  add constraint tags_type_semantic_key_consistency check (
    (type = 'normal' and semantic_key is null)
    or (type = 'emotion' and semantic_key is not null)
    or type in ('theme', 'character', 'event')
  );

create unique index tags_type_semantic_key_uidx
  on public.tags(type, semantic_key)
  where semantic_key is not null;

alter table public.map_entries
  add column unlock_at timestamptz;

create index map_entries_unlock_at_idx
  on public.map_entries(unlock_at, id)
  where unlock_at is not null;

alter table public.story_route_items
  add column relation_type text not null default 'normal',
  add constraint story_route_items_relation_type_values check (
    relation_type in (
      'normal', 'cause', 'memory', 'contrast', 'turning_point'
    )
  );

comment on column public.tags.type is
  'v1.1 tag classification. Existing and legacy-created tags remain normal.';
comment on column public.tags.semantic_key is
  'Optional stable ASCII semantic route key; required for emotion tags.';
comment on column public.map_entries.unlock_at is
  'Time Capsule unlock instant. Null retains the existing visibility model.';
comment on column public.story_route_items.relation_type is
  'Narrative relation from the previous route node; legacy nodes are normal.';

-- Column-level INSERT/UPDATE grants intentionally do not include unlock_at,
-- tags.type, tags.semantic_key, or story_route_items.relation_type. Existing
-- RPCs therefore continue to produce only legacy-compatible defaults until
-- the corresponding v1.1 feature migration is deployed.

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 202608040002_emotion_tags.sql
-- ============================================================
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

-- ============================================================
-- MIGRATION: 202608050001_time_capsules.sql
-- ============================================================
-- Story-and-Place v1.1: Time Capsules.
-- Future capsules are readable by their creator only. Group creators must
-- also retain active membership. At unlock_at the existing visibility model
-- becomes effective automatically on the next database query.

do $$
begin
  if to_regclass('public.map_entries') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null
    or to_regprocedure('public.can_interact_entry(uuid)') is null
    or to_regprocedure('public.can_collaborate_entry(uuid)') is null
    or to_regprocedure('public.can_edit_entry_field(uuid,text)') is null
    or to_regprocedure('public.can_read_entry_edit_log(uuid,timestamp with time zone)') is null
    or to_regprocedure('public.create_entry(jsonb,text[])') is null
    or to_regprocedure('public.update_entry(uuid,jsonb,text[])') is null
    or to_regprocedure('public.save_story_route(uuid,text,text,text,uuid,boolean,jsonb)') is null
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
      message = 'time capsules require all migrations through 202608040002';
  end if;
end;
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
        (
          entry.unlock_at > now()
          and entry.user_id = (select auth.uid())
          and (
            entry.visibility <> 'group'
            or public.is_active_group_member(entry.group_id)
          )
        )
        or (
          (entry.unlock_at is null or entry.unlock_at <= now())
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
        )
      )
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
        or (
          (entry.unlock_at is null or entry.unlock_at <= now())
          and exists (
            select 1
            from public.entry_participants participant
            where participant.entry_id = entry.id
              and participant.user_id = (select auth.uid())
              and participant.status = 'accepted'
          )
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
        or (
          (entry.unlock_at is null or entry.unlock_at <= now())
          and exists (
            select 1
            from public.entry_participants participant
            where participant.entry_id = entry.id
              and participant.user_id = (select auth.uid())
              and participant.status = 'accepted'
              and p_field = any(participant.editable_fields)
          )
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
        or (
          (entry.unlock_at is null or entry.unlock_at <= now())
          and exists (
            select 1
            from public.entry_participants participant
            where participant.entry_id = entry.id
              and participant.user_id = (select auth.uid())
              and participant.status = 'accepted'
              and participant.responded_at <= p_created_at
          )
        )
      )
  );
$$;

create or replace function public.can_interact_entry(p_entry_id uuid)
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
      and (entry.unlock_at is null or entry.unlock_at <= now())
      and public.can_read_entry(entry.id)
      and entry.visibility in ('public', 'group')
  );
$$;

create or replace function public.create_entry_v11(
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
  target_unlock_at timestamptz;
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
      'group_id', 'place_category_slug', 'allow_comments', 'unlock_at'
    )
  ) then
    raise exception using errcode = '22023', message = 'entry payload contains restricted fields';
  end if;

  target_unlock_at := (p_entry ->> 'unlock_at')::timestamptz;
  if target_unlock_at is not null and target_unlock_at <= now() then
    raise exception using errcode = '23514', message = 'unlock time must be in the future';
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
    allow_comments,
    unlock_at
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
    coalesce((p_entry ->> 'allow_comments')::boolean, true),
    target_unlock_at
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

create or replace function public.update_entry_v11(
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
  target_unlock_at timestamptz;
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
      'group_id', 'place_category_slug', 'allow_comments', 'unlock_at'
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
  if p_patch ? 'unlock_at' and existing.user_id <> actor then
    raise exception using errcode = '42501', message = 'only the entry owner can change unlock time';
  end if;

  target_unlock_at := case
    when p_patch ? 'unlock_at' then (p_patch ->> 'unlock_at')::timestamptz
    else existing.unlock_at
  end;
  if target_unlock_at is distinct from existing.unlock_at
    and target_unlock_at is not null
    and target_unlock_at <= now()
  then
    raise exception using errcode = '23514', message = 'unlock time must be in the future';
  end if;

  if p_patch ? 'unlock_at' and target_unlock_at is distinct from existing.unlock_at then
    update public.map_entries
    set unlock_at = target_unlock_at
    where id = p_entry_id
    returning * into updated_entry;
  end if;
  updated_entry := public.update_entry(
    p_entry_id,
    p_patch - 'unlock_at',
    p_tag_names
  );
  return updated_entry;
end;
$$;

create or replace function public.get_social_feed_v11(
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  user_id uuid,
  title text,
  content text,
  place_name text,
  latitude double precision,
  longitude double precision,
  time_label text,
  visibility text,
  group_id uuid,
  place_category_slug text,
  allow_comments boolean,
  unlock_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  author_display_name text,
  author_avatar_url text,
  group_name text,
  group_slug text,
  like_count bigint,
  comment_count bigint,
  user_liked boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    entry.id,
    entry.user_id,
    entry.title::text,
    entry.content,
    entry.place_name,
    entry.latitude,
    entry.longitude,
    entry.time_label,
    entry.visibility,
    entry.group_id,
    entry.place_category_slug,
    entry.allow_comments,
    entry.unlock_at,
    entry.created_at,
    entry.updated_at,
    profile.display_name,
    profile.avatar_url,
    target_group.name::text,
    target_group.slug,
    (select count(*) from public.entry_likes likes where likes.entry_id = entry.id),
    (
      select count(*)
      from public.entry_comments comment
      where comment.entry_id = entry.id and comment.deleted_at is null
    ),
    exists (
      select 1
      from public.entry_likes mine
      where mine.entry_id = entry.id
        and mine.user_id = (select auth.uid())
    )
  from public.map_entries entry
  join public.profiles profile on profile.id = entry.user_id
  left join public.groups target_group on target_group.id = entry.group_id
  where (select auth.uid()) is not null
    and public.can_read_entry(entry.id)
    and (
      (
        entry.user_id = (select auth.uid())
        and entry.visibility in ('public', 'private')
      )
      or (
        entry.visibility = 'public'
        and exists (
          select 1
          from public.follows follow
          where follow.follower_id = (select auth.uid())
            and follow.following_id = entry.user_id
        )
      )
      or (
        entry.visibility = 'group'
        and public.is_active_group_member(entry.group_id)
      )
    )
    and (
      p_cursor_created_at is null
      or (entry.created_at, entry.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by entry.created_at desc, entry.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

create or replace function public.get_timeline_entries_v11(
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
  p_capsule_state text default null,
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
    and (
      p_capsule_state is null
      or (p_capsule_state = 'current' and entry.unlock_at is null)
      or (
        p_capsule_state = 'past'
        and entry.unlock_at is not null
        and entry.unlock_at <= now()
      )
      or (p_capsule_state = 'future' and entry.unlock_at > now())
    )
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

create or replace function public.protect_routes_for_time_capsule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unlock_at > now()
    and (old.unlock_at is null or old.unlock_at <= now())
  then
    -- A route owned by somebody else must not retain a hidden node whose
    -- node_count would reveal that the newly locked entry still exists.
    delete from public.story_route_items item
    using public.story_routes route
    where item.route_id = route.id
      and item.entry_id = new.id
      and route.created_by <> new.user_id;

    update public.story_routes route
    set
      visibility = 'private',
      group_id = null,
      privacy_downgraded_at = now()
    where route.visibility <> 'private'
      and route.created_by = new.user_id
      and exists (
        select 1
        from public.story_route_items item
        where item.route_id = route.id
          and item.entry_id = new.id
      );
  end if;
  return new;
end;
$$;

drop trigger if exists map_entries_protect_routes_for_capsule
on public.map_entries;
create trigger map_entries_protect_routes_for_capsule
after update of unlock_at on public.map_entries
for each row execute function public.protect_routes_for_time_capsule();

create or replace function public.guard_capsule_story_route_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.map_entries entry
    join public.story_routes route on route.id = new.route_id
    where entry.id = new.entry_id
      and entry.unlock_at > now()
      and (
        route.visibility <> 'private'
        or route.created_by <> entry.user_id
      )
  ) then
    raise exception using
      errcode = '42501',
      message = 'locked capsule is only eligible for its owner private route';
  end if;
  return new;
end;
$$;

drop trigger if exists story_route_items_guard_capsule
on public.story_route_items;
create trigger story_route_items_guard_capsule
before insert or update on public.story_route_items
for each row execute function public.guard_capsule_story_route_item();

revoke all on function public.can_read_entry(uuid) from public;
revoke all on function public.can_collaborate_entry(uuid) from public;
revoke all on function public.can_edit_entry_field(uuid, text) from public;
revoke all on function public.can_read_entry_edit_log(uuid, timestamptz) from public;
revoke all on function public.can_interact_entry(uuid) from public;
revoke all on function public.create_entry_v11(jsonb, text[]) from public, anon;
revoke all on function public.update_entry_v11(uuid, jsonb, text[]) from public, anon;
revoke all on function public.get_social_feed_v11(timestamptz, uuid, integer)
from public, anon;
revoke all on function public.get_timeline_entries_v11(
  text, uuid, text, text, text[], uuid, text,
  integer, integer, boolean, text, integer, integer
) from public;
revoke all on function public.protect_routes_for_time_capsule() from public;
revoke all on function public.guard_capsule_story_route_item() from public;

grant execute on function public.can_read_entry(uuid) to anon, authenticated;
grant execute on function public.can_collaborate_entry(uuid) to authenticated;
grant execute on function public.can_edit_entry_field(uuid, text) to authenticated;
grant execute on function public.can_read_entry_edit_log(uuid, timestamptz)
to authenticated;
grant execute on function public.can_interact_entry(uuid) to authenticated;
grant execute on function public.create_entry_v11(jsonb, text[]) to authenticated;
grant execute on function public.update_entry_v11(uuid, jsonb, text[])
to authenticated;
grant execute on function public.get_social_feed_v11(timestamptz, uuid, integer)
to authenticated;
grant execute on function public.get_timeline_entries_v11(
  text, uuid, text, text, text[], uuid, text,
  integer, integer, boolean, text, integer, integer
) to anon, authenticated;

comment on function public.can_read_entry(uuid) is
  'Canonical entry read boundary. Future capsules require creator identity; group creators also require active membership.';
comment on function public.create_entry_v11(jsonb, text[]) is
  'Creates a legacy-compatible entry plus an optional future unlock instant.';
comment on function public.update_entry_v11(uuid, jsonb, text[]) is
  'Updates entries while reserving unlock_at changes for the creator.';

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 202608050002_life_paths.sql
-- ============================================================
-- Story-and-Place v1.1: public Life Paths.
--
-- Life Paths are derived from existing public, unlocked map entries. No story
-- content or coordinates are copied into a new table. Existing UUID profile
-- links remain valid while profiles gain a stable, public username.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.map_entries') is null
    or to_regclass('public.story_routes') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null
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
      message = 'life paths require all migrations through 202608050001';
  end if;
end;
$$;

alter table public.profiles
  add column if not exists username text;

-- Prefer a readable ASCII display name when it already resembles a handle.
-- Chinese or otherwise non-handle display names receive a deterministic
-- traveler-<uuid> value. Collision handling is deterministic and never
-- deletes or merges an existing profile.
with username_candidates as (
  select
    profile.id,
    case
      when lower(btrim(profile.display_name))
        ~ '^[a-z][a-z0-9]*(?:[ _-][a-z0-9]+)*$'
      then left(
        regexp_replace(
          lower(btrim(profile.display_name)),
          '[ _-]+',
          '-',
          'g'
        ),
        48
      )
      else 'traveler-' || replace(profile.id::text, '-', '')
    end as base_username
  from public.profiles profile
  where profile.username is null
), ranked_usernames as (
  select
    candidate.*,
    row_number() over (
      partition by candidate.base_username
      order by candidate.id
    ) as collision_rank
  from username_candidates candidate
)
update public.profiles profile
set username = case
  when ranked.collision_rank = 1 then ranked.base_username
  else left(ranked.base_username, 15) || '-' || replace(profile.id::text, '-', '')
end
from ranked_usernames ranked
where profile.id = ranked.id
  and profile.username is null;

alter table public.profiles
  alter column username set default (
    'traveler-' || replace(gen_random_uuid()::text, '-', '')
  ),
  alter column username set not null;

-- Keep registration compatible with the existing auth.users trigger while
-- making the generated handle deterministic for new accounts. Email remains
-- exclusively in auth.users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
begin
  requested_name :=
    public.format_display_name(new.raw_user_meta_data ->> 'display_name');

  if char_length(requested_name) not between 1 and 80 then
    requested_name := '地图旅人-' || new.id::text;
  end if;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    'traveler-' || replace(new.id::text, '-', ''),
    requested_name
  );

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_username_format'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_username_format check (
        char_length(username) between 3 and 48
        and username = lower(username)
        and username ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'
      );
  end if;
end;
$$;

create unique index if not exists profiles_username_uidx
  on public.profiles(username);

create index if not exists map_entries_public_life_path_idx
  on public.map_entries(
    user_id,
    unlock_at,
    occurred_year,
    occurred_date,
    created_at,
    id
  )
  where visibility = 'public';

create or replace function public.resolve_public_profile(
  p_identifier text
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    profile.id,
    profile.username,
    profile.display_name,
    profile.avatar_url,
    profile.bio,
    profile.created_at,
    profile.updated_at
  from public.profiles profile
  where char_length(btrim(coalesce(p_identifier, ''))) between 3 and 48
    and (
      profile.username = lower(btrim(p_identifier))
      or profile.id::text = lower(btrim(p_identifier))
    )
  limit 1;
$$;

create or replace function public.get_public_life_path_entries(
  p_profile_id uuid,
  p_offset integer default 0,
  p_limit integer default 201
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
      extract(year from entry.occurred_date)::integer,
      extract(year from entry.occurred_local)::integer,
      extract(year from entry.occurred_at)::integer
    ) as event_year
  ) event_time
  where entry.user_id = p_profile_id
    and entry.visibility = 'public'
    and (entry.unlock_at is null or entry.unlock_at <= now())
    and public.can_read_entry(entry.id)
  order by
    (event_time.event_year is null) asc,
    event_time.event_year asc,
    coalesce(entry.occurred_local, entry.occurred_date::timestamp) asc nulls last,
    entry.created_at asc,
    entry.id asc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 201), 1), 201);
$$;

create or replace function public.get_public_life_path_summary(
  p_profile_id uuid
)
returns table (
  public_story_count bigint,
  earliest_year integer,
  latest_year integer,
  distinct_place_count bigint,
  first_time_label text,
  last_time_label text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with visible_entries as (
    select
      entry.id,
      entry.time_label,
      entry.latitude,
      entry.longitude,
      entry.created_at,
      coalesce(
        entry.occurred_year,
        extract(year from entry.occurred_date)::integer,
        extract(year from entry.occurred_local)::integer,
        extract(year from entry.occurred_at)::integer
      ) as event_year,
      coalesce(entry.occurred_local, entry.occurred_date::timestamp) as local_time
    from public.map_entries entry
    where entry.user_id = p_profile_id
      and entry.visibility = 'public'
      and (entry.unlock_at is null or entry.unlock_at <= now())
      and public.can_read_entry(entry.id)
  )
  select
    count(*)::bigint,
    min(visible.event_year)::integer,
    max(visible.event_year)::integer,
    count(distinct (visible.latitude, visible.longitude))::bigint,
    (
      select first_entry.time_label
      from visible_entries first_entry
      order by
        (first_entry.event_year is null) asc,
        first_entry.event_year asc,
        first_entry.local_time asc nulls last,
        first_entry.created_at asc,
        first_entry.id asc
      limit 1
    ),
    (
      select last_entry.time_label
      from visible_entries last_entry
      order by
        (last_entry.event_year is null) asc,
        last_entry.event_year desc,
        last_entry.local_time desc nulls last,
        last_entry.created_at desc,
        last_entry.id desc
      limit 1
    )
  from visible_entries visible;
$$;

-- username is public profile metadata, but direct clients cannot change it.
-- Existing column-level INSERT/UPDATE grants intentionally remain unchanged.
revoke all on function public.resolve_public_profile(text) from public;
revoke all on function public.get_public_life_path_entries(uuid, integer, integer) from public;
revoke all on function public.get_public_life_path_summary(uuid) from public;
revoke all on function public.handle_new_user() from public;

grant execute on function public.resolve_public_profile(text)
  to anon, authenticated;
grant execute on function public.get_public_life_path_entries(uuid, integer, integer)
  to anon, authenticated;
grant execute on function public.get_public_life_path_summary(uuid)
  to anon, authenticated;

comment on column public.profiles.username is
  'Stable public profile handle. It is generated by the database and is not directly client-editable.';
comment on function public.get_public_life_path_entries(uuid, integer, integer) is
  'Chronological public Life Path entries. Private, group, and future capsule entries are always excluded.';
comment on function public.get_public_life_path_summary(uuid) is
  'Public Life Path aggregate. Counts and time bounds use only unlocked public entries.';

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 202608050003_launch_onboarding.sql
-- ============================================================
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

-- ============================================================
-- MIGRATION: 202608050004_launch_explore.sql
-- ============================================================
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

-- ============================================================
-- MIGRATION: 202608050005_launch_explore_acl_fix.sql
-- ============================================================
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

-- ============================================================
-- MIGRATION: 202608050006_launch_explore_keyword_lenses.sql
-- ============================================================
-- Expand Explore lenses to controlled tag-keyword matching so established
-- compound tags such as "成都科幻" and "文学空间" are discoverable.
-- Story body text is never scanned and the public/unlocked boundary is kept.

do $$
begin
  if to_regprocedure(
    'public.get_public_explore_entries(text,timestamp with time zone,uuid,integer)'
  ) is null then
    raise exception using
      errcode = '55000',
      message = 'Explore keyword lenses require migration 202608050005';
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
              and (
                tag.normalized_name like '%文学%'
                or tag.normalized_name = any(array['小说', '诗歌', '作品'])
              )
            or p_category = 'city-memory'
              and (
                tag.normalized_name like '%城市记忆%'
                or tag.normalized_name like '%故乡%'
                or tag.normalized_name = any(array['城市', '老街', '记忆'])
              )
            or p_category = 'travel'
              and (
                tag.normalized_name like '%旅行%'
                or tag.normalized_name like '%游记%'
                or tag.normalized_name = '旅途'
              )
            or p_category = 'science-fiction'
              and (
                tag.normalized_name like '%科幻%'
                or tag.normalized_name = any(array[
                  'sci-fi', 'scifi', 'science fiction'
                ])
              )
            or p_category = 'fictional-world'
              and (
                tag.normalized_name like '%虚构%'
                or tag.normalized_name like '%世界观%'
                or tag.normalized_name = '架空'
              )
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
  'Keyset-paginates unlocked public stories through controlled tag-keyword lenses; never scans private content or story body text.';

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 202608070001_launch_featured_entries.sql
-- ============================================================
-- v1.2 launch experience: operationally curated public stories.
-- The browser never receives write privileges for featured_at. Curators use a
-- trusted backend or the SQL Editor; ordinary authors cannot feature themselves.

do $$
begin
  if to_regclass('public.map_entries') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null then
    raise exception using
      errcode = '55000',
      message = 'Featured stories require the existing map entry permission model';
  end if;
end;
$$;

alter table public.map_entries
  add column if not exists featured_at timestamptz;

create index if not exists map_entries_public_featured_idx
  on public.map_entries(featured_at desc, created_at desc, id desc)
  where visibility = 'public' and featured_at is not null;

create or replace function public.maintain_map_entry_featured_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A story that is no longer public, or has become a future capsule, must
  -- leave discovery immediately even if an operator forgets to unfeature it.
  if new.visibility <> 'public'
    or (new.unlock_at is not null and new.unlock_at > now()) then
    new.featured_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists map_entries_maintain_featured_state
on public.map_entries;
create trigger map_entries_maintain_featured_state
before insert or update of visibility, unlock_at, featured_at
on public.map_entries
for each row execute function public.maintain_map_entry_featured_state();

-- Re-applying this migration to an existing test database also cleans any
-- accidentally stale state without deleting or rewriting story content.
update public.map_entries
set featured_at = null
where featured_at is not null
  and (
    visibility <> 'public'
    or (unlock_at is not null and unlock_at > now())
  );

create or replace function public.get_featured_public_entries(
  p_limit integer default 6
)
returns setof public.map_entries
language sql
stable
security invoker
set search_path = ''
as $$
  select entry.*
  from public.map_entries entry
  where entry.featured_at is not null
    and entry.visibility = 'public'
    and (entry.unlock_at is null or entry.unlock_at <= now())
    and public.can_read_entry(entry.id)
  order by entry.featured_at desc, entry.created_at desc, entry.id desc
  limit least(greatest(coalesce(p_limit, 6), 1), 12);
$$;

-- Existing column-level grants intentionally exclude the new field. These
-- explicit revokes make the invariant clear even if an older deployment had
-- broader table privileges.
revoke insert (featured_at) on public.map_entries from authenticated;
revoke update (featured_at) on public.map_entries from authenticated;

revoke all on function public.maintain_map_entry_featured_state()
from public, anon, authenticated;
revoke all on function public.get_featured_public_entries(integer)
from public;
grant execute on function public.get_featured_public_entries(integer)
to anon, authenticated;

comment on column public.map_entries.featured_at is
  'Trusted-operator curation timestamp. Ordinary browser clients have no insert or update privilege for this column.';
comment on function public.get_featured_public_entries(integer) is
  'Returns at most 12 curated stories, always restricted to unlocked public entries readable under current RLS.';

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 202608080001_v13_global_search.sql
-- ============================================================
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

-- ============================================================
-- MIGRATION: 202608080002_v13_entry_drafts.sql
-- ============================================================
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

-- ============================================================
-- MIGRATION: 202608080003_v13_data_portability_account_deletion.sql
-- ============================================================
-- Story-and-Place v1.3: user data export and account-deletion lifecycle.
--
-- Application data is processed only after a fresh account-deletion request.
-- The finalizer is intentionally executable by service_role only; the browser
-- can never select another user or invoke destructive cleanup directly.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.map_entries') is null
    or to_regclass('public.story_routes') is null
    or to_regclass('public.entry_participants') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'v1.3 data portability requires all migrations through 202608080002';
  end if;
end;
$$;

alter table public.profiles
  add column if not exists deleted_at timestamptz;

alter table public.reports
  alter column reporter_id drop not null;

alter table public.reports
  drop constraint if exists reports_reporter_id_fkey;

alter table public.reports
  add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references public.profiles(id) on delete set null;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  deletion_mode text not null,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  failure_code text,
  constraint account_deletion_requests_mode_values
    check (deletion_mode in ('delete_all', 'preserve_public')),
  constraint account_deletion_requests_status_values
    check (status in ('pending', 'processing', 'completed', 'failed')),
  constraint account_deletion_requests_failure_length
    check (failure_code is null or char_length(failure_code) <= 80)
);

create unique index if not exists account_deletion_requests_active_user_idx
  on public.account_deletion_requests(user_id)
  where status in ('pending', 'processing');

create index if not exists account_deletion_requests_status_requested_idx
  on public.account_deletion_requests(status, requested_at);

alter table public.account_deletion_requests enable row level security;

create policy "account_deletion_requests_owner_select"
on public.account_deletion_requests for select to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.account_deletion_requests
from public, anon, authenticated;
grant select on table public.account_deletion_requests to authenticated;
grant select, insert, update on table public.account_deletion_requests to service_role;

create or replace function public.get_account_deletion_impact()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then
      pg_catalog.jsonb_build_object('authenticated', false)
    else pg_catalog.jsonb_build_object(
      'authenticated', true,
      'public_entries', (
        select count(*) from public.map_entries entry
        where entry.user_id = (select auth.uid()) and entry.visibility = 'public'
      ),
      'private_entries', (
        select count(*) from public.map_entries entry
        where entry.user_id = (select auth.uid()) and entry.visibility = 'private'
      ),
      'group_entries', (
        select count(*) from public.map_entries entry
        where entry.user_id = (select auth.uid()) and entry.visibility = 'group'
      ),
      'public_routes', (
        select count(*) from public.story_routes route
        where route.created_by = (select auth.uid()) and route.visibility = 'public'
      ),
      'other_routes', (
        select count(*) from public.story_routes route
        where route.created_by = (select auth.uid()) and route.visibility <> 'public'
      ),
      'collaborations', (
        select count(*) from public.entry_participants participant
        where participant.user_id = (select auth.uid())
      ),
      'blocking_groups', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', membership.group_id,
            'slug', target.slug,
            'name', target.name,
            'role', membership.role
          ) order by target.name, target.id
        )
        from public.group_members membership
        join public.groups target on target.id = membership.group_id
        where membership.user_id = (select auth.uid())
          and membership.status = 'active'
          and membership.role in ('owner', 'admin')
      ), '[]'::jsonb)
    )
  end;
$$;

create or replace function public.begin_account_deletion(p_deletion_mode text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  request_id uuid;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_deletion_mode not in ('delete_all', 'preserve_public') then
    raise exception using errcode = '22023', message = 'invalid deletion mode';
  end if;
  if exists (
    select 1
    from public.group_members membership
    where membership.user_id = actor
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
  ) then
    raise exception using errcode = '55000', message = 'group responsibilities must be resolved';
  end if;
  if exists (
    select 1 from public.profiles profile
    where profile.id = actor and profile.deleted_at is not null
  ) then
    raise exception using errcode = '55000', message = 'account deletion already completed';
  end if;

  select request.id into request_id
  from public.account_deletion_requests request
  where request.user_id = actor and request.status in ('pending', 'processing')
  for update;
  if request_id is not null then
    return request_id;
  end if;

  insert into public.account_deletion_requests (user_id, deletion_mode)
  values (actor, p_deletion_mode)
  returning id into request_id;
  return request_id;
end;
$$;

create or replace function public.finalize_account_deletion(
  p_request_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.account_deletion_requests%rowtype;
  short_id text;
begin
  if p_request_id is null or p_user_id is null then
    raise exception using errcode = '22023', message = 'request and user are required';
  end if;

  select * into request
  from public.account_deletion_requests target
  where target.id = p_request_id and target.user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'deletion request not found';
  end if;
  if request.status = 'completed' then
    return;
  end if;
  if request.status not in ('pending', 'processing', 'failed') then
    raise exception using errcode = '55000', message = 'deletion request is not actionable';
  end if;
  if exists (
    select 1 from public.group_members membership
    where membership.user_id = p_user_id
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
  ) then
    raise exception using errcode = '55000', message = 'group responsibilities must be resolved';
  end if;

  update public.account_deletion_requests
  set status = 'processing', processing_started_at = coalesce(processing_started_at, now()),
      failure_code = null
  where id = request.id;

  delete from public.entry_drafts where user_id = p_user_id;
  delete from public.user_experience_preferences where user_id = p_user_id;

  delete from public.story_routes route
  where route.created_by = p_user_id
    and (request.deletion_mode = 'delete_all' or route.visibility <> 'public');

  delete from public.map_entries entry
  where entry.user_id = p_user_id
    and (request.deletion_mode = 'delete_all' or entry.visibility <> 'public');

  if request.deletion_mode = 'preserve_public' then
    update public.map_entries
    set featured_at = null
    where user_id = p_user_id and visibility = 'public';
    update public.story_routes
    set featured_at = null, featured_by = null
    where created_by = p_user_id and visibility = 'public';
  end if;

  delete from public.entry_participants where user_id = p_user_id;
  update public.entry_participants set invited_by = null where invited_by = p_user_id;
  update public.entry_edit_logs set editor_id = null where editor_id = p_user_id;
  update public.tags set created_by = null where created_by = p_user_id;
  update public.entry_tags set added_by = null where added_by = p_user_id;

  delete from public.entry_likes where user_id = p_user_id;
  delete from public.follows
  where follower_id = p_user_id or following_id = p_user_id;
  update public.entry_comments
  set content = '', deleted_at = coalesce(deleted_at, now()), updated_at = now()
  where user_id = p_user_id;
  update public.reports set reporter_id = null where reporter_id = p_user_id;

  delete from public.group_invitations
  where inviter_id = p_user_id or invitee_id = p_user_id;
  delete from public.group_members where user_id = p_user_id;

  short_id := left(replace(p_user_id::text, '-', ''), 8);
  update public.profiles
  set
    username = 'deleted-' || replace(p_user_id::text, '-', ''),
    display_name = '已注销用户-' || short_id,
    avatar_url = null,
    bio = null,
    deleted_at = coalesce(deleted_at, now()),
    updated_at = now()
  where id = p_user_id;

  update public.account_deletion_requests
  set status = 'completed', completed_at = now(), failure_code = null
  where id = request.id;
end;
$$;

create or replace function public.export_my_story_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then
      null
    else pg_catalog.jsonb_build_object(
      'schema_version', 1,
      'exported_at', now(),
      'profile', (
        select pg_catalog.jsonb_build_object(
          'id', profile.id,
          'username', profile.username,
          'display_name', profile.display_name,
          'avatar_url', profile.avatar_url,
          'bio', profile.bio,
          'created_at', profile.created_at
        )
        from public.profiles profile
        where profile.id = (select auth.uid()) and profile.deleted_at is null
      ),
      'owned_entries', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'ownership', 'owner',
            'id', entry.id,
            'title', entry.title,
            'content', entry.content,
            'place_name', entry.place_name,
            'latitude', entry.latitude,
            'longitude', entry.longitude,
            'occurred_at', entry.occurred_at,
            'occurred_local', entry.occurred_local,
            'occurred_timezone', entry.occurred_timezone,
            'occurred_date', entry.occurred_date,
            'occurred_year', entry.occurred_year,
            'time_precision', entry.time_precision,
            'time_label', entry.time_label,
            'visibility', entry.visibility,
            'group_id', entry.group_id,
            'place_category_slug', entry.place_category_slug,
            'unlock_at', entry.unlock_at,
            'created_at', entry.created_at,
            'updated_at', entry.updated_at,
            'tags', coalesce((
              select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'name', tag.name, 'slug', tag.slug,
                  'type', tag.type, 'semantic_key', tag.semantic_key
                ) order by tag.name, tag.id
              )
              from public.entry_tags link
              join public.tags tag on tag.id = link.tag_id
              where link.entry_id = entry.id
            ), '[]'::jsonb)
          ) order by entry.created_at, entry.id
        )
        from public.map_entries entry
        where entry.user_id = (select auth.uid())
      ), '[]'::jsonb),
      'participant_entries', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'ownership', 'participant',
            'id', entry.id,
            'title', entry.title,
            'content', entry.content,
            'place_name', entry.place_name,
            'latitude', entry.latitude,
            'longitude', entry.longitude,
            'occurred_at', entry.occurred_at,
            'occurred_local', entry.occurred_local,
            'occurred_timezone', entry.occurred_timezone,
            'occurred_date', entry.occurred_date,
            'occurred_year', entry.occurred_year,
            'time_precision', entry.time_precision,
            'time_label', entry.time_label,
            'visibility', entry.visibility,
            'group_id', entry.group_id,
            'place_category_slug', entry.place_category_slug,
            'unlock_at', entry.unlock_at,
            'created_at', entry.created_at,
            'updated_at', entry.updated_at,
            'tags', coalesce((
              select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'name', tag.name, 'slug', tag.slug,
                  'type', tag.type, 'semantic_key', tag.semantic_key
                ) order by tag.name, tag.id
              )
              from public.entry_tags link
              join public.tags tag on tag.id = link.tag_id
              where link.entry_id = entry.id
            ), '[]'::jsonb)
          ) order by entry.created_at, entry.id
        )
        from public.entry_participants participant
        join public.map_entries entry on entry.id = participant.entry_id
        where participant.user_id = (select auth.uid())
          and participant.status = 'accepted'
          and entry.user_id <> (select auth.uid())
          and public.can_read_entry(entry.id)
      ), '[]'::jsonb),
      'owned_routes', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', route.id,
            'share_slug', route.share_slug,
            'title', route.title,
            'description', route.description,
            'visibility', route.visibility,
            'group_id', route.group_id,
            'published_at', route.published_at,
            'archived_at', route.archived_at,
            'created_at', route.created_at,
            'updated_at', route.updated_at,
            'items', coalesce((
              select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'id', item.id,
                  'entry_id', item.entry_id,
                  'position', item.position,
                  'note', item.note,
                  'relation_type', item.relation_type,
                  'created_at', item.created_at
                ) order by item.position, item.id
              )
              from public.story_route_items item
              where item.route_id = route.id
            ), '[]'::jsonb)
          ) order by route.created_at, route.id
        )
        from public.story_routes route
        where route.created_by = (select auth.uid())
      ), '[]'::jsonb)
    )
  end;
$$;

revoke all on function public.get_account_deletion_impact() from public, anon;
revoke all on function public.begin_account_deletion(text) from public, anon;
revoke all on function public.export_my_story_data() from public, anon;
revoke all on function public.finalize_account_deletion(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.get_account_deletion_impact() to authenticated;
grant execute on function public.begin_account_deletion(text) to authenticated;
grant execute on function public.export_my_story_data() to authenticated;
grant execute on function public.finalize_account_deletion(uuid, uuid) to service_role;

comment on table public.account_deletion_requests is
  'Auditable, idempotent bridge between fresh user confirmation, Auth soft deletion and application-data cleanup.';
comment on function public.export_my_story_data() is
  'Returns only the caller-owned data and currently readable accepted collaborations; never returns auth metadata or email.';
comment on function public.finalize_account_deletion(uuid, uuid) is
  'Service-role-only transactional application-data deletion/anonymization after Auth identity deletion.';

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 202608110001_v13_global_search_escape_fix.sql
-- ============================================================
-- Story-and-Place v1.3 regression fix: PostgreSQL LIKE ESCAPE literals.
--
-- 202608080001 used a two-character backslash escape literal, which PostgreSQL
-- interprets as an invalid ESCAPE value under standard_conforming_strings and
-- rejects with SQLSTATE 22025. This version uses a single backslash character.
-- Recreate only the search RPC; the signature, permission filtering, grants
-- and result shape stay unchanged.

do $$
begin
  if to_regprocedure('public.search_story_and_place(text,integer,integer,text,text,text,uuid,text[],integer,integer)') is null then
    raise exception using
      errcode = '55000',
      message = 'v1.3 search escape fix requires migration 202608080001';
  end if;
end;
$$;

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
          escape '\'
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
        or entry.title ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\'
        or entry.content ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\'
        or coalesce(entry.place_name, '') ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\'
        or entry.time_label ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\'
        or exists (
          select 1
          from public.entry_tags entry_tag
          join public.tags tag on tag.id = entry_tag.tag_id
          where entry_tag.entry_id = entry.id
            and (
              tag.name ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\'
              or coalesce(tag.semantic_key, '') ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\'
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
        or route.title ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\'
        or route.description ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\'
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
        profile.username ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\'
        or profile.display_name ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\'
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
        tag.name ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\'
        or coalesce(tag.semantic_key, '') ilike '%' || replace(replace(replace(criteria.query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\'
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

-- ============================================================
-- MIGRATION: 202608110002_trigger_function_execute_hardening.sql
-- ============================================================
-- Story-and-Place regression hardening: trigger functions are internal only.
--
-- PostgreSQL trigger execution does not require API roles to hold EXECUTE on
-- the trigger function. Remove the default PUBLIC grant so these functions do
-- not appear as directly callable RPCs. This does not change trigger behavior,
-- RLS policies or existing data.

do $$
begin
  if to_regprocedure('public.add_group_owner_after_insert()') is not null then
    revoke execute on function public.add_group_owner_after_insert()
      from public, anon, authenticated;
  end if;

  if to_regprocedure('public.validate_entry_participant()') is not null then
    revoke execute on function public.validate_entry_participant()
      from public, anon, authenticated;
  end if;
end;
$$;

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 20260811111243_timeline_participant_acl_fix.sql
-- ============================================================
-- Timeline RPCs are SECURITY INVOKER and reference entry_participants while
-- evaluating the "mine" scope. PostgreSQL checks table privileges even when an
-- anonymous request ultimately selects only a public user timeline.
--
-- Anonymous callers receive SELECT at the table ACL layer, but the table has
-- RLS enabled and no anon SELECT policy, so direct anonymous queries still
-- return zero rows. This preserves participant-invitation privacy while making
-- the public timeline RPC usable.

grant select on table public.entry_participants to anon;

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 202608270001_v14_security_reliability.sql
-- ============================================================
-- Story-and-Place v1.4 Phase 1: persistent server-side rate limiting.
--
-- The browser cannot call this function. Server routes hash identifiers before
-- sending them to PostgreSQL, so raw IP addresses, e-mail addresses and access
-- tokens are never stored in the bucket table.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table if not exists private.rate_limit_buckets (
  scope text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null,
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash),
  constraint rate_limit_buckets_scope_length
    check (char_length(scope) between 1 and 80),
  constraint rate_limit_buckets_key_hash_format
    check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint rate_limit_buckets_request_count_positive
    check (request_count >= 1)
);

alter table private.rate_limit_buckets enable row level security;

revoke all on table private.rate_limit_buckets
from public, anon, authenticated;
grant select, insert, update, delete on table private.rate_limit_buckets
to service_role;

create or replace function public.consume_server_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  remaining integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_time timestamptz := clock_timestamp();
  bucket private.rate_limit_buckets%rowtype;
  window_duration interval;
begin
  if p_scope is null or char_length(p_scope) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'invalid rate limit scope';
  end if;
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid rate limit key';
  end if;
  if p_limit not between 1 and 10000 then
    raise exception using errcode = '22023', message = 'invalid rate limit size';
  end if;
  if p_window_seconds not between 1 and 86400 then
    raise exception using errcode = '22023', message = 'invalid rate limit window';
  end if;

  window_duration := pg_catalog.make_interval(secs => p_window_seconds);

  insert into private.rate_limit_buckets as existing (
    scope,
    key_hash,
    window_started_at,
    request_count,
    updated_at
  )
  values (p_scope, p_key_hash, current_time, 1, current_time)
  on conflict (scope, key_hash) do update
  set
    window_started_at = case
      when existing.window_started_at <= current_time - window_duration
        then current_time
      else existing.window_started_at
    end,
    request_count = case
      when existing.window_started_at <= current_time - window_duration
        then 1
      else existing.request_count + 1
    end,
    updated_at = current_time
  returning * into bucket;

  allowed := bucket.request_count <= p_limit;
  remaining := pg_catalog.greatest(p_limit - bucket.request_count, 0);
  retry_after_seconds := case
    when allowed then 0
    else pg_catalog.greatest(
      1,
      pg_catalog.ceil(
        extract(epoch from bucket.window_started_at + window_duration - current_time)
      )::integer
    )
  end;
  return next;
end;
$$;

revoke all on function public.consume_server_rate_limit(text, text, integer, integer)
from public, anon, authenticated;
grant execute on function public.consume_server_rate_limit(text, text, integer, integer)
to service_role;

comment on function public.consume_server_rate_limit(text, text, integer, integer)
is 'Atomically consumes a fixed-window bucket for trusted server routes; identifiers must be HMAC hashed before calling.';

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 202608280001_v14_notifications.sql
-- ============================================================
-- Story-and-Place v1.4 Phase 2: privacy-safe notifications, delivery
-- preferences, and an email outbox. This migration only queues email work;
-- it does not claim that an email provider has delivered a message.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.map_entries') is null
    or to_regclass('public.entry_participants') is null
    or to_regclass('public.entry_edit_logs') is null
    or to_regclass('public.groups') is null
    or to_regclass('public.group_members') is null
    or to_regclass('public.group_invitations') is null
    or to_regclass('public.story_routes') is null
  then
    raise exception using
      errcode = '55000',
      message = 'v1.4 notifications require all migrations through 202608270001';
  end if;
end;
$$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  category text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_values check (type in (
    'entry_invitation_received',
    'entry_invitation_accepted',
    'entry_invitation_declined',
    'entry_permissions_changed',
    'entry_participant_removed',
    'entry_collaborator_edited',
    'group_invitation_received',
    'group_invitation_accepted',
    'group_invitation_declined',
    'group_joined',
    'group_role_changed',
    'group_membership_changed',
    'group_archived',
    'story_route_updated',
    'story_featured',
    'story_restricted',
    'time_capsule_unlocked',
    'security_alert',
    'export_completed',
    'account_deletion_status',
    'product_update'
  )),
  constraint notifications_category_values check (category in (
    'collaboration', 'groups', 'time_capsules', 'security', 'product_updates'
  )),
  constraint notifications_entity_values check (
    entity_type is null or entity_type in (
      'entry', 'entry_participant', 'group', 'group_invitation',
      'story_route', 'account', 'export', 'system'
    )
  ),
  constraint notifications_entity_consistency check (
    (entity_type is null and entity_id is null)
    or (entity_type is not null and entity_id is not null)
  ),
  constraint notifications_payload_is_object check (jsonb_typeof(payload) = 'object'),
  constraint notifications_dedupe_key_length check (
    dedupe_key is null or char_length(dedupe_key) between 1 and 180
  )
);

create table public.notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  delivery_mode text not null default 'in_app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, category),
  constraint notification_preferences_category_values check (category in (
    'collaboration', 'groups', 'time_capsules', 'security', 'product_updates'
  )),
  constraint notification_preferences_delivery_values check (
    delivery_mode in ('in_app', 'email', 'off')
  ),
  constraint notification_preferences_security_required check (
    category <> 'security' or delivery_mode <> 'off'
  )
);

create table public.notification_email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null,
  category text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_email_outbox_type_values check (notification_type in (
    'entry_invitation_received',
    'entry_invitation_accepted',
    'entry_invitation_declined',
    'entry_permissions_changed',
    'entry_participant_removed',
    'entry_collaborator_edited',
    'group_invitation_received',
    'group_invitation_accepted',
    'group_invitation_declined',
    'group_joined',
    'group_role_changed',
    'group_membership_changed',
    'group_archived',
    'story_route_updated',
    'story_featured',
    'story_restricted',
    'time_capsule_unlocked',
    'security_alert',
    'export_completed',
    'account_deletion_status',
    'product_update'
  )),
  constraint notification_email_outbox_category_values check (category in (
    'collaboration', 'groups', 'time_capsules', 'security', 'product_updates'
  )),
  constraint notification_email_outbox_entity_consistency check (
    (entity_type is null and entity_id is null)
    or (entity_type is not null and entity_id is not null)
  ),
  constraint notification_email_outbox_payload_is_object check (
    jsonb_typeof(payload) = 'object'
  ),
  constraint notification_email_outbox_status_values check (
    status in ('pending', 'processing', 'sent', 'failed', 'cancelled')
  ),
  constraint notification_email_outbox_attempt_range check (
    attempt_count between 0 and 20
  ),
  constraint notification_email_outbox_error_code_length check (
    last_error_code is null or char_length(last_error_code) <= 80
  )
);

create unique index notifications_user_dedupe_idx
  on public.notifications(user_id, dedupe_key)
  where dedupe_key is not null;
create index notifications_user_created_idx
  on public.notifications(user_id, created_at desc, id desc);
create index notifications_user_unread_idx
  on public.notifications(user_id, created_at desc, id desc)
  where read_at is null;
create unique index notification_email_outbox_user_dedupe_idx
  on public.notification_email_outbox(user_id, dedupe_key)
  where dedupe_key is not null;
create index notification_email_outbox_pending_idx
  on public.notification_email_outbox(next_attempt_at, created_at, id)
  where status in ('pending', 'failed');

create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

create trigger notification_email_outbox_set_updated_at
before update on public.notification_email_outbox
for each row execute function public.set_updated_at();

create or replace function private.default_notification_delivery_mode(
  p_category text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_category = 'product_updates' then 'off'
    else 'in_app'
  end;
$$;

create or replace function private.enqueue_user_notification(
  p_user_id uuid,
  p_type text,
  p_category text,
  p_actor_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb,
  p_dedupe_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery text;
  queued_id uuid;
  safe_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if p_user_id is null then
    return null;
  end if;
  if jsonb_typeof(safe_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'notification payload must be an object';
  end if;

  select preference.delivery_mode
  into delivery
  from public.notification_preferences preference
  where preference.user_id = p_user_id
    and preference.category = p_category;

  delivery := coalesce(
    delivery,
    private.default_notification_delivery_mode(p_category)
  );

  if p_category = 'security' and delivery = 'off' then
    delivery := 'in_app';
  end if;
  if delivery = 'off' then
    return null;
  end if;

  if delivery = 'email' then
    insert into public.notification_email_outbox (
      user_id,
      notification_type,
      category,
      actor_id,
      entity_type,
      entity_id,
      payload,
      dedupe_key
    ) values (
      p_user_id,
      p_type,
      p_category,
      p_actor_id,
      p_entity_type,
      p_entity_id,
      safe_payload,
      p_dedupe_key
    )
    on conflict (user_id, dedupe_key) where dedupe_key is not null
    do nothing
    returning id into queued_id;
  else
    insert into public.notifications (
      user_id,
      type,
      category,
      actor_id,
      entity_type,
      entity_id,
      payload,
      dedupe_key
    ) values (
      p_user_id,
      p_type,
      p_category,
      p_actor_id,
      p_entity_type,
      p_entity_id,
      safe_payload,
      p_dedupe_key
    )
    on conflict (user_id, dedupe_key) where dedupe_key is not null
    do nothing
    returning id into queued_id;
  end if;

  return queued_id;
end;
$$;

create or replace function private.initialize_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_preferences (user_id, category, delivery_mode)
  values
    (new.id, 'collaboration', 'in_app'),
    (new.id, 'groups', 'in_app'),
    (new.id, 'time_capsules', 'in_app'),
    (new.id, 'security', 'in_app'),
    (new.id, 'product_updates', 'off')
  on conflict (user_id, category) do nothing;
  return new;
end;
$$;

create trigger profiles_initialize_notification_preferences
after insert on public.profiles
for each row execute function private.initialize_notification_preferences();

insert into public.notification_preferences (user_id, category, delivery_mode)
select profile.id, seed.category, seed.delivery_mode
from public.profiles profile
cross join (
  values
    ('collaboration', 'in_app'),
    ('groups', 'in_app'),
    ('time_capsules', 'in_app'),
    ('security', 'in_app'),
    ('product_updates', 'off')
) as seed(category, delivery_mode)
on conflict (user_id, category) do nothing;

create or replace function public.set_notification_preference(
  p_category text,
  p_delivery_mode text
)
returns public.notification_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  result public.notification_preferences%rowtype;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_category not in (
    'collaboration', 'groups', 'time_capsules', 'security', 'product_updates'
  ) then
    raise exception using errcode = '22023', message = 'invalid notification category';
  end if;
  if p_delivery_mode not in ('in_app', 'email', 'off') then
    raise exception using errcode = '22023', message = 'invalid notification delivery mode';
  end if;
  if p_category = 'security' and p_delivery_mode = 'off' then
    raise exception using errcode = '23514', message = 'security notifications cannot be disabled';
  end if;

  insert into public.notification_preferences (user_id, category, delivery_mode)
  values (actor, p_category, p_delivery_mode)
  on conflict (user_id, category) do update
    set delivery_mode = excluded.delivery_mode,
        updated_at = now()
  returning * into result;

  return result;
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and user_id = (select auth.uid());
  if not found then
    raise exception using errcode = 'P0002', message = 'notification not found';
  end if;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  update public.notifications
  set read_at = now()
  where user_id = (select auth.uid())
    and read_at is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.record_my_export_completed(
  p_format text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  normalized_format text := lower(btrim(coalesce(p_format, '')));
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if normalized_format not in ('json', 'csv', 'geojson') then
    raise exception using errcode = '22023', message = 'invalid export format';
  end if;
  perform private.enqueue_user_notification(
    actor,
    'export_completed',
    'security',
    null,
    'export',
    gen_random_uuid(),
    jsonb_build_object(
      'export_format', normalized_format,
      'target_path', '/settings'
    ),
    'export-completed:' || actor::text || ':' || normalized_format || ':' || date_trunc('minute', now())::text
  );
end;
$$;

create or replace function private.notify_entry_participant_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_row public.map_entries%rowtype;
  actor uuid := (select auth.uid());
begin
  select * into entry_row
  from public.map_entries
  where id = new.entry_id;

  if new.status = 'pending'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    perform private.enqueue_user_notification(
      new.user_id,
      'entry_invitation_received',
      'collaboration',
      new.invited_by,
      'entry_participant',
      new.entry_id,
      jsonb_strip_nulls(jsonb_build_object(
        'entry_title', entry_row.title,
        'time_label', entry_row.time_label,
        'place_name', entry_row.place_name,
        'editable_fields', new.editable_fields,
        'target_path', '/entry-invitations'
      )),
      'entry-invite:' || new.entry_id::text || ':' || new.user_id::text || ':' || extract(epoch from new.updated_at)::text
    );
  end if;

  if tg_op = 'UPDATE'
    and new.status in ('accepted', 'declined')
    and old.status is distinct from new.status
  then
    perform private.enqueue_user_notification(
      entry_row.user_id,
      case when new.status = 'accepted'
        then 'entry_invitation_accepted'
        else 'entry_invitation_declined'
      end,
      'collaboration',
      new.user_id,
      'entry',
      new.entry_id,
      jsonb_build_object(
        'entry_title', entry_row.title,
        'target_path', '/entries/' || new.entry_id::text
      ),
      'entry-invite-response:' || new.entry_id::text || ':' || new.user_id::text || ':' || new.status || ':' || extract(epoch from new.updated_at)::text
    );
  end if;

  if tg_op = 'UPDATE'
    and new.status = 'accepted'
    and old.status = 'accepted'
    and old.editable_fields is distinct from new.editable_fields
  then
    perform private.enqueue_user_notification(
      new.user_id,
      'entry_permissions_changed',
      'collaboration',
      coalesce(actor, entry_row.user_id),
      'entry',
      new.entry_id,
      jsonb_build_object(
        'entry_title', entry_row.title,
        'editable_fields', new.editable_fields,
        'target_path', '/entries/' || new.entry_id::text
      ),
      'entry-permissions:' || new.entry_id::text || ':' || new.user_id::text || ':' || extract(epoch from new.updated_at)::text
    );
  end if;

  if tg_op = 'UPDATE'
    and new.status = 'revoked'
    and old.status is distinct from new.status
  then
    perform private.enqueue_user_notification(
      new.user_id,
      'entry_participant_removed',
      'collaboration',
      coalesce(actor, entry_row.user_id),
      'entry_participant',
      new.entry_id,
      jsonb_build_object(
        'entry_title', entry_row.title,
        'target_path', '/entry-invitations'
      ),
      'entry-participant-removed:' || new.entry_id::text || ':' || new.user_id::text || ':' || extract(epoch from new.updated_at)::text
    );
  end if;

  return new;
end;
$$;

create trigger entry_participants_notify_change
after insert or update of status, editable_fields on public.entry_participants
for each row execute function private.notify_entry_participant_change();

create or replace function private.notify_entry_collaborator_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_row public.map_entries%rowtype;
begin
  select * into entry_row
  from public.map_entries
  where id = new.entry_id;

  if new.editor_id is not null and new.editor_id <> entry_row.user_id then
    perform private.enqueue_user_notification(
      entry_row.user_id,
      'entry_collaborator_edited',
      'collaboration',
      new.editor_id,
      'entry',
      new.entry_id,
      jsonb_build_object(
        'entry_title', entry_row.title,
        'changed_fields', new.changed_fields,
        'target_path', '/entries/' || new.entry_id::text
      ),
      'entry-edit-log:' || new.id::text
    );
  end if;
  return new;
end;
$$;

create trigger entry_edit_logs_notify_owner
after insert on public.entry_edit_logs
for each row execute function private.notify_entry_collaborator_edit();

create or replace function private.notify_group_invitation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_row public.groups%rowtype;
begin
  select * into group_row from public.groups where id = new.group_id;

  if new.status = 'pending' and tg_op = 'INSERT' then
    perform private.enqueue_user_notification(
      new.invitee_id,
      'group_invitation_received',
      'groups',
      new.inviter_id,
      'group_invitation',
      new.id,
      jsonb_build_object(
        'group_name', group_row.name,
        'group_slug', group_row.slug,
        'target_path', '/groups/invitations'
      ),
      'group-invite:' || new.id::text
    );
  end if;

  if tg_op = 'UPDATE'
    and new.status in ('accepted', 'declined')
    and old.status is distinct from new.status
  then
    perform private.enqueue_user_notification(
      new.inviter_id,
      case when new.status = 'accepted'
        then 'group_invitation_accepted'
        else 'group_invitation_declined'
      end,
      'groups',
      new.invitee_id,
      'group',
      new.group_id,
      jsonb_build_object(
        'group_name', group_row.name,
        'group_slug', group_row.slug,
        'target_path', '/groups/' || group_row.slug
      ),
      'group-invite-response:' || new.id::text || ':' || new.status
    );
  end if;
  return new;
end;
$$;

create trigger group_invitations_notify_change
after insert or update of status on public.group_invitations
for each row execute function private.notify_group_invitation_change();

create or replace function private.notify_group_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_row public.groups%rowtype;
  actor uuid := (select auth.uid());
begin
  select * into group_row from public.groups where id = new.group_id;

  if new.status = 'active'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    perform private.enqueue_user_notification(
      new.user_id,
      'group_joined',
      'groups',
      actor,
      'group',
      new.group_id,
      jsonb_build_object(
        'group_name', group_row.name,
        'group_slug', group_row.slug,
        'role', new.role,
        'target_path', '/groups/' || group_row.slug
      ),
      'group-joined:' || new.group_id::text || ':' || new.user_id::text || ':' || extract(epoch from new.updated_at)::text
    );
  end if;

  if tg_op = 'UPDATE'
    and new.status = 'active'
    and old.status = 'active'
    and old.role is distinct from new.role
  then
    perform private.enqueue_user_notification(
      new.user_id,
      'group_role_changed',
      'groups',
      actor,
      'group',
      new.group_id,
      jsonb_build_object(
        'group_name', group_row.name,
        'group_slug', group_row.slug,
        'role', new.role,
        'target_path', '/groups/' || group_row.slug || '/members'
      ),
      'group-role:' || new.group_id::text || ':' || new.user_id::text || ':' || extract(epoch from new.updated_at)::text
    );
  end if;

  if tg_op = 'UPDATE'
    and old.status = 'active'
    and new.status in ('left', 'removed')
  then
    perform private.enqueue_user_notification(
      new.user_id,
      'group_membership_changed',
      'groups',
      actor,
      'group',
      new.group_id,
      jsonb_build_object(
        'group_name', group_row.name,
        'membership_status', new.status,
        'target_path', '/groups'
      ),
      'group-membership:' || new.group_id::text || ':' || new.user_id::text || ':' || new.status || ':' || extract(epoch from new.updated_at)::text
    );
  end if;
  return new;
end;
$$;

create trigger group_members_notify_change
after insert or update of role, status on public.group_members
for each row execute function private.notify_group_membership_change();

create or replace function private.notify_group_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_row record;
begin
  if old.archived_at is null and new.archived_at is not null then
    for member_row in
      select member.user_id
      from public.group_members member
      where member.group_id = new.id and member.status = 'active'
    loop
      perform private.enqueue_user_notification(
        member_row.user_id,
        'group_archived',
        'groups',
        new.archived_by,
        'group',
        new.id,
        jsonb_build_object(
          'group_name', new.name,
          'group_slug', new.slug,
          'target_path', '/groups/' || new.slug
        ),
        'group-archived:' || new.id::text
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger groups_notify_archive
after update of archived_at on public.groups
for each row execute function private.notify_group_archive();

create or replace function private.notify_story_featured()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.featured_at is null and new.featured_at is not null then
    perform private.enqueue_user_notification(
      new.user_id,
      'story_featured',
      'collaboration',
      null,
      'entry',
      new.id,
      jsonb_build_object(
        'entry_title', new.title,
        'target_path', '/entries/' || new.id::text
      ),
      'story-featured:' || new.id::text || ':' || extract(epoch from new.featured_at)::text
    );
  end if;
  return new;
end;
$$;

create trigger map_entries_notify_featured
after update of featured_at on public.map_entries
for each row execute function private.notify_story_featured();

create or replace function private.notify_story_route_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is not null
    and actor <> new.created_by
    and to_jsonb(old) is distinct from to_jsonb(new)
  then
    perform private.enqueue_user_notification(
      new.created_by,
      'story_route_updated',
      'collaboration',
      actor,
      'story_route',
      new.id,
      jsonb_build_object(
        'route_title', new.title,
        'share_slug', new.share_slug,
        'target_path', '/routes/' || new.share_slug
      ),
      'story-route-updated:' || new.id::text || ':' || extract(epoch from new.updated_at)::text
    );
  end if;
  return new;
end;
$$;

create trigger story_routes_notify_external_change
after update on public.story_routes
for each row execute function private.notify_story_route_change();

create or replace function private.handle_account_deletion_notification_data()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and new.status = 'failed' then
    perform private.enqueue_user_notification(
      new.user_id,
      'account_deletion_status',
      'security',
      null,
      'account',
      new.id,
      jsonb_build_object(
        'deletion_status', 'failed',
        'target_path', '/settings'
      ),
      'account-deletion-failed:' || new.id::text || ':' || coalesce(new.failure_code, 'unknown')
    );
  elsif old.status is distinct from new.status and new.status = 'completed' then
    delete from public.notification_email_outbox where user_id = new.user_id;
    delete from public.notifications where user_id = new.user_id;
    delete from public.notification_preferences where user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger account_deletion_requests_handle_notification_data
after update of status on public.account_deletion_requests
for each row execute function private.handle_account_deletion_notification_data();

create or replace function private.sync_due_capsules_for_user(
  p_user_id uuid,
  p_limit integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_row record;
  queued integer := 0;
  queued_id uuid;
begin
  for entry_row in
    select entry.id, entry.title, entry.unlock_at
    from public.map_entries entry
    where entry.user_id = p_user_id
      and entry.unlock_at is not null
      and entry.unlock_at <= now()
      and not exists (
        select 1
        from public.notifications notification
        where notification.user_id = p_user_id
          and notification.dedupe_key = 'time-capsule-unlocked:' || entry.id::text
      )
      and not exists (
        select 1
        from public.notification_email_outbox outbox
        where outbox.user_id = p_user_id
          and outbox.dedupe_key = 'time-capsule-unlocked:' || entry.id::text
      )
    order by entry.unlock_at asc, entry.id asc
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
  loop
    queued_id := private.enqueue_user_notification(
      p_user_id,
      'time_capsule_unlocked',
      'time_capsules',
      null,
      'entry',
      entry_row.id,
      jsonb_build_object(
        'entry_title', entry_row.title,
        'unlock_at', entry_row.unlock_at,
        'target_path', '/entries/' || entry_row.id::text
      ),
      'time-capsule-unlocked:' || entry_row.id::text
    );
    if queued_id is not null then
      queued := queued + 1;
    end if;
  end loop;
  return queued;
end;
$$;

create or replace function public.sync_my_time_capsule_notifications(
  p_limit integer default 100
)
returns integer
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
  return private.sync_due_capsules_for_user(actor, p_limit);
end;
$$;

create or replace function public.sync_due_time_capsule_notifications(
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_row record;
  remaining integer := least(greatest(coalesce(p_limit, 500), 1), 2000);
  added integer := 0;
  owner_added integer;
begin
  for owner_row in
    select distinct entry.user_id
    from public.map_entries entry
    where entry.unlock_at is not null
      and entry.unlock_at <= now()
    order by entry.user_id
  loop
    exit when remaining <= 0;
    owner_added := private.sync_due_capsules_for_user(owner_row.user_id, remaining);
    added := added + owner_added;
    remaining := remaining - owner_added;
  end loop;
  return added;
end;
$$;

create or replace function public.claim_notification_email_outbox(
  p_limit integer default 25
)
returns setof public.notification_email_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select outbox.id
    from public.notification_email_outbox outbox
    where outbox.attempt_count < 20
      and (
        (
          outbox.status in ('pending', 'failed')
          and outbox.next_attempt_at <= now()
        ) or (
          outbox.status = 'processing'
          and outbox.processing_started_at < now() - interval '10 minutes'
        )
      )
    order by outbox.next_attempt_at asc, outbox.created_at asc, outbox.id asc
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  )
  update public.notification_email_outbox outbox
  set status = 'processing',
      attempt_count = least(outbox.attempt_count + 1, 20),
      processing_started_at = now(),
      last_error_code = null,
      updated_at = now()
  from candidates
  where outbox.id = candidates.id
  returning outbox.*;
end;
$$;

create or replace function public.finish_notification_email_outbox(
  p_outbox_id uuid,
  p_sent boolean,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_email_outbox
  set status = case when p_sent then 'sent' else 'failed' end,
      sent_at = case when p_sent then now() else null end,
      processing_started_at = null,
      last_error_code = case
        when p_sent then null
        else left(coalesce(nullif(btrim(p_error_code), ''), 'provider_failure'), 80)
      end,
      next_attempt_at = case
        when p_sent then next_attempt_at
        else now() + least(
          interval '6 hours',
          interval '1 minute' * power(2, least(attempt_count, 8))::double precision
        )
      end,
      updated_at = now()
  where id = p_outbox_id and status = 'processing';
  if not found then
    raise exception using errcode = 'P0002', message = 'processing outbox item not found';
  end if;
end;
$$;

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_email_outbox enable row level security;

create policy "users_read_own_notifications"
on public.notifications for select to authenticated
using (user_id = (select auth.uid()));

create policy "users_read_own_notification_preferences"
on public.notification_preferences for select to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.notifications from anon, authenticated;
revoke all on table public.notification_preferences from anon, authenticated;
revoke all on table public.notification_email_outbox from anon, authenticated;
grant select on table public.notifications to authenticated;
grant select on table public.notification_preferences to authenticated;

revoke all on function private.default_notification_delivery_mode(text) from public, anon, authenticated;
revoke all on function private.enqueue_user_notification(uuid, text, text, uuid, text, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function private.initialize_notification_preferences() from public, anon, authenticated;
revoke all on function private.notify_entry_participant_change() from public, anon, authenticated;
revoke all on function private.notify_entry_collaborator_edit() from public, anon, authenticated;
revoke all on function private.notify_group_invitation_change() from public, anon, authenticated;
revoke all on function private.notify_group_membership_change() from public, anon, authenticated;
revoke all on function private.notify_group_archive() from public, anon, authenticated;
revoke all on function private.notify_story_featured() from public, anon, authenticated;
revoke all on function private.notify_story_route_change() from public, anon, authenticated;
revoke all on function private.handle_account_deletion_notification_data() from public, anon, authenticated;
revoke all on function private.sync_due_capsules_for_user(uuid, integer) from public, anon, authenticated;

revoke all on function public.set_notification_preference(text, text) from public, anon, authenticated;
revoke all on function public.mark_notification_read(uuid) from public, anon, authenticated;
revoke all on function public.mark_all_notifications_read() from public, anon, authenticated;
revoke all on function public.record_my_export_completed(text) from public, anon, authenticated;
revoke all on function public.sync_my_time_capsule_notifications(integer) from public, anon, authenticated;
revoke all on function public.sync_due_time_capsule_notifications(integer) from public, anon, authenticated;
revoke all on function public.claim_notification_email_outbox(integer) from public, anon, authenticated;
revoke all on function public.finish_notification_email_outbox(uuid, boolean, text) from public, anon, authenticated;

grant execute on function public.set_notification_preference(text, text) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.record_my_export_completed(text) to authenticated;
grant execute on function public.sync_my_time_capsule_notifications(integer) to authenticated;
grant execute on function public.sync_due_time_capsule_notifications(integer) to service_role;
grant execute on function public.claim_notification_email_outbox(integer) to service_role;
grant execute on function public.finish_notification_email_outbox(uuid, boolean, text) to service_role;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

comment on table public.notifications is
  'Private in-app deliveries. Payloads contain safe summaries only, never story bodies, coordinates, emails, or auth tokens.';
comment on table public.notification_preferences is
  'Per-user delivery mode. Security notifications cannot be fully disabled.';
comment on table public.notification_email_outbox is
  'Server-only email queue. A pending row means queued, not delivered.';
comment on function public.sync_due_time_capsule_notifications(integer) is
  'Service-role hook for a future scheduler; no scheduler is installed by this migration.';

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 202608280002_v14_story_media.sql
-- ============================================================
-- Story-and-Place v1.4 Phase 3: private story media, quotas and cleanup.
--
-- Media is never public at the bucket level. Browser roles can only read a
-- ready asset when the current request can read its parent story. All writes
-- are reserved through owner-scoped RPCs and completed by trusted server code.

do $$
begin
  if to_regclass('public.map_entries') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null
    or to_regprocedure('public.set_updated_at()') is null
  then
    raise exception using
      errcode = '55000',
      message = 'v1.4 story media requires all migrations through 202608280001';
  end if;
end;
$$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'story-media',
  'story-media',
  false,
  6291456,
  array['image/webp']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.entry_media_assets (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.map_entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  thumbnail_path text not null unique,
  source_mime_type text not null,
  mime_type text not null default 'image/webp',
  width integer not null,
  height integer not null,
  size_bytes bigint not null,
  thumbnail_size_bytes bigint not null,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  status text not null default 'pending',
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entry_media_source_mime_values
    check (source_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint entry_media_mime_value check (mime_type = 'image/webp'),
  constraint entry_media_dimensions
    check (width between 1 and 20000 and height between 1 and 20000),
  constraint entry_media_size
    check (size_bytes between 1 and 6291456),
  constraint entry_media_thumbnail_size
    check (thumbnail_size_bytes between 1 and 2097152),
  constraint entry_media_sort_order check (sort_order between 0 and 9),
  constraint entry_media_status_values
    check (status in ('pending', 'ready', 'failed', 'deleting', 'deleted')),
  constraint entry_media_cover_ready
    check (not is_cover or status = 'ready'),
  constraint entry_media_storage_path_shape
    check (
      storage_path = user_id::text || '/' || entry_id::text || '/' || id::text || '.webp'
      and thumbnail_path = user_id::text || '/' || entry_id::text || '/' || id::text || '-thumb.webp'
    )
);

create index if not exists entry_media_assets_entry_status_sort_idx
  on public.entry_media_assets(entry_id, status, sort_order, created_at);
create index if not exists entry_media_assets_user_status_idx
  on public.entry_media_assets(user_id, status, created_at desc);
create unique index if not exists entry_media_assets_one_cover_idx
  on public.entry_media_assets(entry_id)
  where is_cover and status = 'ready';

create table if not exists public.media_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid unique,
  bucket_id text not null default 'story-media',
  object_paths text[] not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_cleanup_bucket check (bucket_id = 'story-media'),
  constraint media_cleanup_paths check (
    cardinality(object_paths) between 1 and 2
    and array_position(object_paths, null) is null
  ),
  constraint media_cleanup_status_values
    check (status in ('pending', 'processing', 'failed')),
  constraint media_cleanup_attempt_count check (attempt_count between 0 and 20)
);

create index if not exists media_cleanup_queue_claim_idx
  on public.media_cleanup_queue(status, next_attempt_at, created_at);

drop trigger if exists entry_media_assets_set_updated_at on public.entry_media_assets;
create trigger entry_media_assets_set_updated_at
before update on public.entry_media_assets
for each row execute function public.set_updated_at();

drop trigger if exists media_cleanup_queue_set_updated_at on public.media_cleanup_queue;
create trigger media_cleanup_queue_set_updated_at
before update on public.media_cleanup_queue
for each row execute function public.set_updated_at();

create or replace function private.story_media_quota_bytes()
returns bigint
language sql
immutable
security definer
set search_path = ''
as $$
  select 524288000::bigint;
$$;

create or replace function public.reserve_entry_media_asset(
  p_user_id uuid,
  p_entry_id uuid,
  p_source_mime_type text,
  p_size_bytes bigint,
  p_thumbnail_size_bytes bigint,
  p_width integer,
  p_height integer
)
returns public.entry_media_assets
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := p_user_id;
  asset_id uuid := gen_random_uuid();
  current_bytes bigint;
  reserved public.entry_media_assets%rowtype;
begin
  if actor is null then
    raise exception using errcode = '22023', message = 'media owner is required';
  end if;
  if p_source_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_size_bytes not between 1 and 6291456
    or p_thumbnail_size_bytes not between 1 and 2097152
    or p_width not between 1 and 20000
    or p_height not between 1 and 20000
  then
    raise exception using errcode = '22023', message = 'invalid media metadata';
  end if;

  if not exists (
    select 1
    from public.map_entries entry
    where entry.id = p_entry_id
      and entry.user_id = actor
      and (
        entry.visibility <> 'group'
        or exists (
          select 1
          from public.group_members membership
          where membership.group_id = entry.group_id
            and membership.user_id = actor
            and membership.status = 'active'
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'entry media owner required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor::text, 8142301)
  );

  select coalesce(sum(asset.size_bytes + asset.thumbnail_size_bytes), 0)::bigint
  into current_bytes
  from public.entry_media_assets asset
  where asset.user_id = actor
    and asset.status in ('pending', 'ready');

  if (
    select count(*)
    from public.entry_media_assets asset
    where asset.entry_id = p_entry_id
      and asset.status in ('pending', 'ready')
  ) >= 10 then
    raise exception using errcode = '23514', message = 'entry media limit reached';
  end if;
  if current_bytes + p_size_bytes + p_thumbnail_size_bytes
    > private.story_media_quota_bytes()
  then
    raise exception using errcode = '23514', message = 'story media quota reached';
  end if;

  insert into public.entry_media_assets (
    id,
    entry_id,
    user_id,
    storage_path,
    thumbnail_path,
    source_mime_type,
    width,
    height,
    size_bytes,
    thumbnail_size_bytes
  ) values (
    asset_id,
    p_entry_id,
    actor,
    actor::text || '/' || p_entry_id::text || '/' || asset_id::text || '.webp',
    actor::text || '/' || p_entry_id::text || '/' || asset_id::text || '-thumb.webp',
    p_source_mime_type,
    p_width,
    p_height,
    p_size_bytes,
    p_thumbnail_size_bytes
  ) returning * into reserved;

  return reserved;
end;
$$;

create or replace function public.mark_entry_media_asset_ready(p_asset_id uuid)
returns public.entry_media_assets
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.entry_media_assets%rowtype;
begin
  select * into target
  from public.entry_media_assets
  where id = p_asset_id
  for update;
  if not found or target.status <> 'pending' then
    raise exception using errcode = '55000', message = 'media asset is not pending';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target.entry_id::text, 8142302)
  );

  update public.entry_media_assets asset
  set
    status = 'ready',
    failure_code = null,
    sort_order = (
      select coalesce(max(existing.sort_order), -1) + 1
      from public.entry_media_assets existing
      where existing.entry_id = target.entry_id
        and existing.status = 'ready'
    ),
    is_cover = not exists (
      select 1
      from public.entry_media_assets existing
      where existing.entry_id = target.entry_id
        and existing.status = 'ready'
        and existing.is_cover
    )
  where asset.id = p_asset_id
  returning * into target;
  return target;
end;
$$;

create or replace function private.enqueue_media_cleanup(
  p_asset_id uuid,
  p_paths text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if cardinality(p_paths) not between 1 and 2
    or array_position(p_paths, null) is not null
  then
    raise exception using errcode = '22023', message = 'invalid cleanup paths';
  end if;

  insert into public.media_cleanup_queue (
    asset_id,
    object_paths,
    status,
    next_attempt_at,
    processing_started_at,
    last_error_code
  ) values (
    p_asset_id,
    p_paths,
    'pending',
    now(),
    null,
    null
  )
  on conflict (asset_id) do update
  set
    object_paths = excluded.object_paths,
    status = 'pending',
    next_attempt_at = now(),
    processing_started_at = null,
    last_error_code = null;
end;
$$;

create or replace function public.mark_entry_media_asset_failed(
  p_asset_id uuid,
  p_failure_code text default 'upload_failed'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.entry_media_assets%rowtype;
begin
  update public.entry_media_assets
  set
    status = 'failed',
    is_cover = false,
    failure_code = left(coalesce(p_failure_code, 'upload_failed'), 80)
  where id = p_asset_id
    and status in ('pending', 'failed')
  returning * into target;
  if found then
    perform private.enqueue_media_cleanup(
      target.id,
      array[target.storage_path, target.thumbnail_path]
    );
  end if;
end;
$$;

create or replace function public.begin_entry_media_asset_delete(p_asset_id uuid)
returns public.entry_media_assets
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.entry_media_assets%rowtype;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  update public.entry_media_assets asset
  set status = 'deleting', is_cover = false
  where asset.id = p_asset_id
    and asset.user_id = actor
    and asset.status = 'ready'
  returning * into target;
  if not found then
    raise exception using errcode = 'P0002', message = 'media asset not found';
  end if;

  if not exists (
    select 1 from public.entry_media_assets asset
    where asset.entry_id = target.entry_id
      and asset.status = 'ready'
      and asset.is_cover
  ) then
    update public.entry_media_assets asset
    set is_cover = true
    where asset.id = (
      select candidate.id
      from public.entry_media_assets candidate
      where candidate.entry_id = target.entry_id
        and candidate.status = 'ready'
      order by candidate.sort_order, candidate.created_at
      limit 1
    );
  end if;

  perform private.enqueue_media_cleanup(
    target.id,
    array[target.storage_path, target.thumbnail_path]
  );
  return target;
end;
$$;

create or replace function public.set_entry_media_cover(
  p_entry_id uuid,
  p_asset_id uuid
)
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
  if not exists (
    select 1
    from public.entry_media_assets asset
    where asset.id = p_asset_id
      and asset.entry_id = p_entry_id
      and asset.user_id = actor
      and asset.status = 'ready'
  ) then
    raise exception using errcode = 'P0002', message = 'media asset not found';
  end if;

  update public.entry_media_assets
  set is_cover = false
  where entry_id = p_entry_id
    and user_id = actor
    and status = 'ready';
  update public.entry_media_assets
  set is_cover = true
  where id = p_asset_id;
end;
$$;

create or replace function public.reorder_entry_media_assets(
  p_entry_id uuid,
  p_asset_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  ready_count integer;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if cardinality(p_asset_ids) not between 1 and 10
    or (select count(distinct value) from unnest(p_asset_ids) value)
      <> cardinality(p_asset_ids)
  then
    raise exception using errcode = '22023', message = 'invalid media order';
  end if;

  select count(*)::integer into ready_count
  from public.entry_media_assets asset
  where asset.entry_id = p_entry_id
    and asset.user_id = actor
    and asset.status = 'ready';
  if ready_count <> cardinality(p_asset_ids)
    or exists (
      select 1
      from unnest(p_asset_ids) value
      where not exists (
        select 1
        from public.entry_media_assets asset
        where asset.id = value
          and asset.entry_id = p_entry_id
          and asset.user_id = actor
          and asset.status = 'ready'
      )
    )
  then
    raise exception using errcode = '42501', message = 'media order is incomplete';
  end if;

  update public.entry_media_assets asset
  set sort_order = (ordering.position - 1)::integer
  from unnest(p_asset_ids) with ordinality ordering(asset_id, position)
  where asset.id = ordering.asset_id;
end;
$$;

create or replace function public.get_my_story_media_usage()
returns table (
  used_bytes bigint,
  quota_bytes bigint,
  file_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum(asset.size_bytes + asset.thumbnail_size_bytes), 0)::bigint,
    private.story_media_quota_bytes(),
    count(*)::integer
  from public.entry_media_assets asset
  where asset.user_id = (select auth.uid())
    and asset.status in ('pending', 'ready');
$$;

create or replace function private.queue_deleted_entry_media_asset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'deleted' then
    perform private.enqueue_media_cleanup(
      old.id,
      array[old.storage_path, old.thumbnail_path]
    );
  end if;
  return old;
end;
$$;

drop trigger if exists entry_media_assets_queue_delete on public.entry_media_assets;
create trigger entry_media_assets_queue_delete
before delete on public.entry_media_assets
for each row execute function private.queue_deleted_entry_media_asset();

create or replace function public.claim_story_media_cleanup(p_limit integer default 25)
returns setof public.media_cleanup_queue
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid cleanup limit';
  end if;

  insert into public.media_cleanup_queue (asset_id, object_paths)
  select
    asset.id,
    array[asset.storage_path, asset.thumbnail_path]
  from public.entry_media_assets asset
  where asset.status = 'failed'
    or (asset.status = 'pending' and asset.created_at < now() - interval '1 hour')
  on conflict (asset_id) do nothing;

  return query
  with candidates as (
    select queue.id
    from public.media_cleanup_queue queue
    where queue.next_attempt_at <= now()
      and queue.attempt_count < 20
      and (
        queue.status in ('pending', 'failed')
        or (
          queue.status = 'processing'
          and queue.processing_started_at < now() - interval '15 minutes'
        )
      )
    order by queue.created_at
    for update skip locked
    limit p_limit
  )
  update public.media_cleanup_queue queue
  set
    status = 'processing',
    processing_started_at = now(),
    attempt_count = queue.attempt_count + 1
  from candidates
  where queue.id = candidates.id
  returning queue.*;
end;
$$;

create or replace function public.finish_story_media_cleanup(
  p_queue_id uuid,
  p_succeeded boolean,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.media_cleanup_queue%rowtype;
begin
  select * into target
  from public.media_cleanup_queue
  where id = p_queue_id
  for update;
  if not found or target.status <> 'processing' then
    raise exception using errcode = 'P0002', message = 'cleanup item not found';
  end if;

  if p_succeeded then
    if target.asset_id is not null then
      update public.entry_media_assets
      set status = 'deleted', is_cover = false
      where id = target.asset_id;
      delete from public.entry_media_assets where id = target.asset_id;
    end if;
    delete from public.media_cleanup_queue where id = p_queue_id;
  else
    update public.media_cleanup_queue
    set
      status = 'failed',
      processing_started_at = null,
      last_error_code = left(coalesce(p_error_code, 'storage_remove_failed'), 80),
      next_attempt_at = now() + pg_catalog.make_interval(
        secs => least(3600, 30 * (2 ^ least(attempt_count, 7)))::integer
      )
    where id = p_queue_id;
  end if;
end;
$$;

create or replace function public.complete_entry_media_asset_delete(p_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.entry_media_assets
  set status = 'deleted', is_cover = false
  where id = p_asset_id
    and status in ('pending', 'failed', 'deleting');
  delete from public.entry_media_assets where id = p_asset_id;
  delete from public.media_cleanup_queue where asset_id = p_asset_id;
end;
$$;

alter table public.entry_media_assets enable row level security;
alter table public.media_cleanup_queue enable row level security;

drop policy if exists entry_media_assets_authorized_select on public.entry_media_assets;
create policy entry_media_assets_authorized_select
on public.entry_media_assets for select to anon, authenticated
using (
  status = 'ready'
  and public.can_read_entry(entry_id)
);

drop policy if exists story_media_objects_authorized_select on storage.objects;
create policy story_media_objects_authorized_select
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'story-media'
  and exists (
    select 1
    from public.entry_media_assets asset
    where asset.status = 'ready'
      and (asset.storage_path = name or asset.thumbnail_path = name)
      and public.can_read_entry(asset.entry_id)
  )
);

revoke all on table public.entry_media_assets from public, anon, authenticated;
grant select on table public.entry_media_assets to anon, authenticated;
revoke all on table public.media_cleanup_queue from public, anon, authenticated;
grant select, insert, update, delete on table public.media_cleanup_queue to service_role;

revoke all on function private.story_media_quota_bytes() from public, anon, authenticated;
revoke all on function private.enqueue_media_cleanup(uuid, text[]) from public, anon, authenticated;
revoke all on function private.queue_deleted_entry_media_asset() from public, anon, authenticated;

revoke all on function public.reserve_entry_media_asset(uuid, uuid, text, bigint, bigint, integer, integer)
from public, anon, authenticated;
revoke all on function public.mark_entry_media_asset_ready(uuid)
from public, anon, authenticated;
revoke all on function public.mark_entry_media_asset_failed(uuid, text)
from public, anon, authenticated;
revoke all on function public.begin_entry_media_asset_delete(uuid)
from public, anon, authenticated;
revoke all on function public.set_entry_media_cover(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.reorder_entry_media_assets(uuid, uuid[])
from public, anon, authenticated;
revoke all on function public.get_my_story_media_usage()
from public, anon, authenticated;
revoke all on function public.claim_story_media_cleanup(integer)
from public, anon, authenticated;
revoke all on function public.finish_story_media_cleanup(uuid, boolean, text)
from public, anon, authenticated;
revoke all on function public.complete_entry_media_asset_delete(uuid)
from public, anon, authenticated;

grant execute on function public.reserve_entry_media_asset(uuid, uuid, text, bigint, bigint, integer, integer)
to service_role;
grant execute on function public.begin_entry_media_asset_delete(uuid)
to authenticated;
grant execute on function public.set_entry_media_cover(uuid, uuid)
to authenticated;
grant execute on function public.reorder_entry_media_assets(uuid, uuid[])
to authenticated;
grant execute on function public.get_my_story_media_usage()
to authenticated;

grant execute on function public.mark_entry_media_asset_ready(uuid)
to service_role;
grant execute on function public.mark_entry_media_asset_failed(uuid, text)
to service_role;
grant execute on function public.claim_story_media_cleanup(integer)
to service_role;
grant execute on function public.finish_story_media_cleanup(uuid, boolean, text)
to service_role;
grant execute on function public.complete_entry_media_asset_delete(uuid)
to service_role;

comment on table public.entry_media_assets is
  'Private-bucket story images. Only ready assets whose parent entry passes can_read_entry are visible.';
comment on table public.media_cleanup_queue is
  'Service-only durable queue for removing Storage objects after failures, explicit deletes or cascading story/account deletion.';
comment on function public.get_my_story_media_usage() is
  'Returns the caller media usage and the temporary v1.4 500 MiB entitlement ceiling.';

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 20260828102358_v14_rate_limit_clock_fix.sql
-- ============================================================
-- Story-and-Place v1.4 Phase 1 follow-up: PostgreSQL 17 treats
-- `current_time` as the SQL CURRENT_TIME keyword inside the INSERT statement.
-- Keep the already-applied migration immutable and replace only the function
-- body with an unambiguous PL/pgSQL variable name.

create or replace function public.consume_server_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  remaining integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  bucket private.rate_limit_buckets%rowtype;
  window_duration interval;
begin
  if p_scope is null or char_length(p_scope) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'invalid rate limit scope';
  end if;
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid rate limit key';
  end if;
  if p_limit not between 1 and 10000 then
    raise exception using errcode = '22023', message = 'invalid rate limit size';
  end if;
  if p_window_seconds not between 1 and 86400 then
    raise exception using errcode = '22023', message = 'invalid rate limit window';
  end if;

  window_duration := pg_catalog.make_interval(secs => p_window_seconds);

  insert into private.rate_limit_buckets as existing (
    scope,
    key_hash,
    window_started_at,
    request_count,
    updated_at
  )
  values (p_scope, p_key_hash, v_now, 1, v_now)
  on conflict (scope, key_hash) do update
  set
    window_started_at = case
      when existing.window_started_at <= v_now - window_duration
        then v_now
      else existing.window_started_at
    end,
    request_count = case
      when existing.window_started_at <= v_now - window_duration
        then 1
      else existing.request_count + 1
    end,
    updated_at = v_now
  returning * into bucket;

  allowed := bucket.request_count <= p_limit;
  remaining := pg_catalog.greatest(p_limit - bucket.request_count, 0);
  retry_after_seconds := case
    when allowed then 0
    else pg_catalog.greatest(
      1,
      pg_catalog.ceil(
        extract(epoch from bucket.window_started_at + window_duration - v_now)
      )::integer
    )
  end;
  return next;
end;
$$;

revoke all on function public.consume_server_rate_limit(text, text, integer, integer)
from public, anon, authenticated;
grant execute on function public.consume_server_rate_limit(text, text, integer, integer)
to service_role;

comment on function public.consume_server_rate_limit(text, text, integer, integer)
is 'Atomically consumes a fixed-window bucket for trusted server routes; identifiers must be HMAC hashed before calling.';

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 20260828102558_v14_rate_limit_builtin_fix.sql
-- ============================================================
-- Story-and-Place v1.4 Phase 1 follow-up: GREATEST is SQL syntax rather than
-- a pg_catalog function, so schema-qualifying it fails on PostgreSQL 17.

create or replace function public.consume_server_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  remaining integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  bucket private.rate_limit_buckets%rowtype;
  window_duration interval;
begin
  if p_scope is null or char_length(p_scope) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'invalid rate limit scope';
  end if;
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid rate limit key';
  end if;
  if p_limit not between 1 and 10000 then
    raise exception using errcode = '22023', message = 'invalid rate limit size';
  end if;
  if p_window_seconds not between 1 and 86400 then
    raise exception using errcode = '22023', message = 'invalid rate limit window';
  end if;

  window_duration := pg_catalog.make_interval(secs => p_window_seconds);

  insert into private.rate_limit_buckets as existing (
    scope,
    key_hash,
    window_started_at,
    request_count,
    updated_at
  )
  values (p_scope, p_key_hash, v_now, 1, v_now)
  on conflict (scope, key_hash) do update
  set
    window_started_at = case
      when existing.window_started_at <= v_now - window_duration
        then v_now
      else existing.window_started_at
    end,
    request_count = case
      when existing.window_started_at <= v_now - window_duration
        then 1
      else existing.request_count + 1
    end,
    updated_at = v_now
  returning * into bucket;

  allowed := bucket.request_count <= p_limit;
  remaining := greatest(p_limit - bucket.request_count, 0);
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      pg_catalog.ceil(
        extract(epoch from bucket.window_started_at + window_duration - v_now)
      )::integer
    )
  end;
  return next;
end;
$$;

revoke all on function public.consume_server_rate_limit(text, text, integer, integer)
from public, anon, authenticated;
grant execute on function public.consume_server_rate_limit(text, text, integer, integer)
to service_role;

comment on function public.consume_server_rate_limit(text, text, integer, integer)
is 'Atomically consumes a fixed-window bucket for trusted server routes; identifiers must be HMAC hashed before calling.';

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 202608290001_v14_governance.sql
-- ============================================================
-- Story-and-Place v1.4 Phase 4: governance, moderation and account restriction.
-- This migration is additive. It never exposes private story bodies to admins.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.map_entries') is null
    or to_regclass('public.story_routes') is null
    or to_regclass('public.reports') is null
    or to_regprocedure('public.can_read_entry(uuid)') is null
    or to_regprocedure('public.can_view_story_route(uuid)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'governance requires all migrations through v1.4 story media';
  end if;
end;
$$;

create table if not exists public.app_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'admin',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint app_admins_role_values check (role in ('admin'))
);

create table if not exists public.account_moderation (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'active',
  reason text not null default '',
  restricted_at timestamptz,
  restricted_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint account_moderation_status_values check (status in ('active', 'restricted')),
  constraint account_moderation_reason_length check (char_length(reason) <= 500),
  constraint account_moderation_restricted_state check (
    (status = 'active' and restricted_at is null and restricted_by is null)
    or (status = 'restricted' and restricted_at is not null and restricted_by is not null)
  )
);

create table if not exists public.moderation_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid not null,
  report_id uuid references public.reports(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint moderation_audit_action_length check (char_length(action) between 1 and 80),
  constraint moderation_audit_target_values check (
    target_type in ('entry', 'route', 'user', 'report')
  ),
  constraint moderation_audit_metadata_object check (jsonb_typeof(metadata) = 'object')
);

alter table public.map_entries
  add column if not exists moderation_status text not null default 'active',
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null,
  add column if not exists moderation_reason text not null default '';

alter table public.story_routes
  add column if not exists moderation_status text not null default 'active',
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null,
  add column if not exists moderation_reason text not null default '';

alter table public.map_entries
  drop constraint if exists map_entries_moderation_status_values,
  add constraint map_entries_moderation_status_values
    check (moderation_status in ('active', 'restricted', 'removed')),
  drop constraint if exists map_entries_moderation_reason_length,
  add constraint map_entries_moderation_reason_length
    check (char_length(moderation_reason) <= 500),
  drop constraint if exists map_entries_moderation_state_consistent,
  add constraint map_entries_moderation_state_consistent check (
    (moderation_status = 'active' and moderated_at is null and moderated_by is null)
    or (moderation_status <> 'active' and moderated_at is not null and moderated_by is not null)
  );

alter table public.story_routes
  drop constraint if exists story_routes_moderation_status_values,
  add constraint story_routes_moderation_status_values
    check (moderation_status in ('active', 'restricted', 'removed')),
  drop constraint if exists story_routes_moderation_reason_length,
  add constraint story_routes_moderation_reason_length
    check (char_length(moderation_reason) <= 500),
  drop constraint if exists story_routes_moderation_state_consistent,
  add constraint story_routes_moderation_state_consistent check (
    (moderation_status = 'active' and moderated_at is null and moderated_by is null)
    or (moderation_status <> 'active' and moderated_at is not null and moderated_by is not null)
  );

alter table public.reports
  drop constraint if exists reports_target_type_values,
  add constraint reports_target_type_values
    check (target_type in ('entry', 'comment', 'user', 'group', 'route')),
  drop constraint if exists reports_reason_values,
  add constraint reports_reason_values check (
    reason in (
      'spam', 'harassment', 'hate', 'privacy', 'misinformation',
      'copyright', 'inappropriate', 'other'
    )
  );

create index if not exists account_moderation_restricted_idx
  on public.account_moderation(updated_at desc, user_id)
  where status = 'restricted';
create index if not exists moderation_audit_logs_created_idx
  on public.moderation_audit_logs(created_at desc, id desc);
create index if not exists reports_open_queue_idx
  on public.reports(created_at desc, id desc)
  where status in ('pending', 'reviewing');
create index if not exists map_entries_moderation_idx
  on public.map_entries(moderation_status, updated_at desc, id desc)
  where moderation_status <> 'active';
create index if not exists story_routes_moderation_idx
  on public.story_routes(moderation_status, updated_at desc, id desc)
  where moderation_status <> 'active';

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.app_admins administrator
    where administrator.user_id = (select auth.uid())
      and administrator.role = 'admin'
  );
$$;

create or replace function public.is_account_restricted(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select moderation.status = 'restricted'
    from public.account_moderation moderation
    where moderation.user_id = p_user_id
  ), false);
$$;

create or replace function private.assert_app_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare actor uuid := (select auth.uid());
begin
  if actor is null or not public.is_app_admin() then
    raise exception using errcode = '42501', message = 'application administrator required';
  end if;
  return actor;
end;
$$;

alter table public.app_admins enable row level security;
alter table public.account_moderation enable row level security;
alter table public.moderation_audit_logs enable row level security;

drop policy if exists app_admins_admin_read on public.app_admins;
create policy app_admins_admin_read
on public.app_admins for select to authenticated
using (public.is_app_admin());

drop policy if exists account_moderation_admin_read on public.account_moderation;
create policy account_moderation_admin_read
on public.account_moderation for select to authenticated
using (public.is_app_admin());

drop policy if exists moderation_audit_admin_read on public.moderation_audit_logs;
create policy moderation_audit_admin_read
on public.moderation_audit_logs for select to authenticated
using (public.is_app_admin());

-- Restricted profiles disappear from public discovery. The owner may still
-- open settings and an administrator may see public profile fields only.
drop policy if exists profiles_are_publicly_readable on public.profiles;
create policy profiles_are_publicly_readable
on public.profiles for select to anon, authenticated
using (
  not public.is_account_restricted(id)
  or id = (select auth.uid())
  or public.is_app_admin()
);

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
        (
          entry.user_id = (select auth.uid())
          and (
            entry.visibility <> 'group'
            or public.is_active_group_member(entry.group_id)
          )
        )
        or (
          entry.moderation_status = 'active'
          and not public.is_account_restricted(entry.user_id)
          and (entry.unlock_at is null or entry.unlock_at <= now())
          and (
            entry.visibility = 'public'
            or (
              entry.visibility = 'private'
              and exists (
                select 1 from public.entry_participants participant
                where participant.entry_id = entry.id
                  and participant.user_id = (select auth.uid())
                  and participant.status = 'accepted'
              )
            )
            or (
              entry.visibility = 'group'
              and public.is_active_group_member(entry.group_id)
            )
          )
        )
        or (
          public.is_app_admin()
          and entry.visibility = 'public'
          and (entry.unlock_at is null or entry.unlock_at <= now())
        )
      )
  );
$$;

create or replace function public.can_collaborate_entry(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and not public.is_account_restricted((select auth.uid()))
    and exists (
      select 1 from public.map_entries entry
      where entry.id = p_entry_id
        and entry.moderation_status = 'active'
        and not public.is_account_restricted(entry.user_id)
        and (entry.visibility <> 'group' or public.is_active_group_member(entry.group_id))
        and (
          entry.user_id = (select auth.uid())
          or (
            (entry.unlock_at is null or entry.unlock_at <= now())
            and exists (
              select 1 from public.entry_participants participant
              where participant.entry_id = entry.id
                and participant.user_id = (select auth.uid())
                and participant.status = 'accepted'
            )
          )
        )
    );
$$;

create or replace function public.can_edit_entry_field(p_entry_id uuid, p_field text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and not public.is_account_restricted((select auth.uid()))
    and exists (
      select 1 from public.map_entries entry
      where entry.id = p_entry_id
        and entry.moderation_status = 'active'
        and not public.is_account_restricted(entry.user_id)
        and (entry.visibility <> 'group' or public.is_active_group_member(entry.group_id))
        and (
          entry.user_id = (select auth.uid())
          or (
            (entry.unlock_at is null or entry.unlock_at <= now())
            and exists (
              select 1 from public.entry_participants participant
              where participant.entry_id = entry.id
                and participant.user_id = (select auth.uid())
                and participant.status = 'accepted'
                and p_field = any(participant.editable_fields)
            )
          )
        )
    );
$$;

create or replace function public.can_interact_entry(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and not public.is_account_restricted((select auth.uid()))
    and exists (
      select 1 from public.map_entries entry
      where entry.id = p_entry_id
        and entry.moderation_status = 'active'
        and not public.is_account_restricted(entry.user_id)
        and (entry.unlock_at is null or entry.unlock_at <= now())
        and entry.visibility in ('public', 'group')
        and public.can_read_entry(entry.id)
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
  select (select auth.uid()) is not null
    and public.can_read_entry(p_entry_id)
    and exists (
      select 1 from public.map_entries entry
      where entry.id = p_entry_id
        and (
          entry.user_id = (select auth.uid())
          or (
            entry.moderation_status = 'active'
            and not public.is_account_restricted(entry.user_id)
            and exists (
              select 1 from public.entry_participants participant
              where participant.entry_id = entry.id
                and participant.user_id = (select auth.uid())
                and participant.status = 'accepted'
                and participant.responded_at <= p_created_at
            )
          )
        )
    );
$$;

create or replace function public.can_view_story_route(p_route_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.story_routes route
    where route.id = p_route_id
      and (
        route.created_by = (select auth.uid())
        or (
          route.moderation_status = 'active'
          and not public.is_account_restricted(route.created_by)
          and route.published_at is not null
          and route.archived_at is null
          and (
            route.visibility = 'public'
            or (
              route.visibility = 'group'
              and public.is_active_group_member(route.group_id)
            )
          )
        )
        or (
          public.is_app_admin()
          and route.visibility = 'public'
          and route.published_at is not null
        )
      )
  );
$$;

create or replace function public.can_report_target(p_target_type text, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and not public.is_account_restricted((select auth.uid()))
    and case p_target_type
      when 'entry' then exists (
        select 1 from public.map_entries entry
        where entry.id = p_target_id
          and entry.visibility = 'public'
          and entry.moderation_status = 'active'
          and (entry.unlock_at is null or entry.unlock_at <= now())
          and public.can_read_entry(entry.id)
      )
      when 'comment' then exists (
        select 1 from public.entry_comments comment
        join public.map_entries entry on entry.id = comment.entry_id
        where comment.id = p_target_id
          and comment.deleted_at is null
          and entry.visibility in ('public', 'group')
          and public.can_read_entry(entry.id)
      )
      when 'user' then exists (
        select 1 from public.profiles profile
        where profile.id = p_target_id
          and profile.id <> (select auth.uid())
          and profile.deleted_at is null
          and not public.is_account_restricted(profile.id)
      )
      when 'group' then exists (
        select 1 from public.groups target_group
        where target_group.id = p_target_id
          and target_group.archived_at is null
          and (
            target_group.visibility = 'public'
            or public.is_active_group_member(target_group.id)
          )
      )
      when 'route' then exists (
        select 1 from public.story_routes route
        where route.id = p_target_id
          and route.visibility = 'public'
          and route.moderation_status = 'active'
          and route.published_at is not null
          and route.archived_at is null
          and public.can_view_story_route(route.id)
      )
      else false
    end;
$$;

-- Restriction is enforced at the database boundary for the main user-created
-- resources. Service-role maintenance has no auth.uid() and remains available.
create or replace function private.enforce_unrestricted_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := (select auth.uid());
begin
  if actor is not null and public.is_account_restricted(actor) then
    raise exception using errcode = '42501', message = 'account is restricted';
  end if;
  return null;
end;
$$;

do $$
declare relation_name text;
begin
  foreach relation_name in array array[
    'profiles', 'map_entries', 'story_routes', 'story_route_items',
    'groups', 'group_members', 'group_invitations', 'follows',
    'entry_likes', 'entry_comments', 'reports', 'entry_participants',
    'tags', 'entry_tags', 'entry_drafts'
  ] loop
    if to_regclass('public.' || relation_name) is not null then
      execute format('drop trigger if exists %I on public.%I',
        relation_name || '_reject_restricted_actor', relation_name);
      execute format(
        'create trigger %I before insert or update or delete on public.%I for each statement execute function private.enforce_unrestricted_actor()',
        relation_name || '_reject_restricted_actor', relation_name
      );
    end if;
  end loop;
end;
$$;

-- Media reservation is a service-role RPC, so it must validate the supplied
-- owner explicitly instead of relying on auth.uid().
create or replace function public.reserve_entry_media_asset(
  p_user_id uuid,
  p_entry_id uuid,
  p_source_mime_type text,
  p_size_bytes bigint,
  p_thumbnail_size_bytes bigint,
  p_width integer,
  p_height integer
)
returns public.entry_media_assets
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := p_user_id;
  asset_id uuid := gen_random_uuid();
  current_bytes bigint;
  reserved public.entry_media_assets%rowtype;
begin
  if actor is null or public.is_account_restricted(actor) then
    raise exception using errcode = '42501', message = 'media owner unavailable';
  end if;
  if p_source_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_size_bytes not between 1 and 6291456
    or p_thumbnail_size_bytes not between 1 and 2097152
    or p_width not between 1 and 20000
    or p_height not between 1 and 20000
  then
    raise exception using errcode = '22023', message = 'invalid media metadata';
  end if;
  if not exists (
    select 1 from public.map_entries entry
    where entry.id = p_entry_id
      and entry.user_id = actor
      and entry.moderation_status = 'active'
      and (
        entry.visibility <> 'group'
        or exists (
          select 1 from public.group_members membership
          where membership.group_id = entry.group_id
            and membership.user_id = actor
            and membership.status = 'active'
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'entry media owner required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text, 8142301));
  select coalesce(sum(asset.size_bytes + asset.thumbnail_size_bytes), 0)::bigint
  into current_bytes
  from public.entry_media_assets asset
  where asset.user_id = actor and asset.status in ('pending', 'ready');
  if (
    select count(*) from public.entry_media_assets asset
    where asset.entry_id = p_entry_id and asset.status in ('pending', 'ready')
  ) >= 10 then
    raise exception using errcode = '23514', message = 'entry media limit reached';
  end if;
  if current_bytes + p_size_bytes + p_thumbnail_size_bytes > private.story_media_quota_bytes() then
    raise exception using errcode = '23514', message = 'story media quota reached';
  end if;
  insert into public.entry_media_assets (
    id, entry_id, user_id, storage_path, thumbnail_path, source_mime_type,
    width, height, size_bytes, thumbnail_size_bytes
  ) values (
    asset_id, p_entry_id, actor,
    actor::text || '/' || p_entry_id::text || '/' || asset_id::text || '.webp',
    actor::text || '/' || p_entry_id::text || '/' || asset_id::text || '-thumb.webp',
    p_source_mime_type, p_width, p_height, p_size_bytes, p_thumbnail_size_bytes
  ) returning * into reserved;
  return reserved;
end;
$$;

create or replace function public.maintain_map_entry_featured_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visibility <> 'public'
    or new.moderation_status <> 'active'
    or (new.unlock_at is not null and new.unlock_at > now())
  then
    new.featured_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists map_entries_maintain_featured_state on public.map_entries;
create trigger map_entries_maintain_featured_state
before insert or update of visibility, unlock_at, featured_at, moderation_status
on public.map_entries
for each row execute function public.maintain_map_entry_featured_state();

revoke insert (moderation_status, moderated_at, moderated_by, moderation_reason)
on public.map_entries from authenticated;
revoke update (moderation_status, moderated_at, moderated_by, moderation_reason)
on public.map_entries from authenticated;
revoke insert (moderation_status, moderated_at, moderated_by, moderation_reason)
on public.story_routes from authenticated;
revoke update (moderation_status, moderated_at, moderated_by, moderation_reason)
on public.story_routes from authenticated;

revoke all on table public.app_admins from public, anon, authenticated;
revoke all on table public.account_moderation from public, anon, authenticated;
revoke all on table public.moderation_audit_logs from public, anon, authenticated;
grant select on public.app_admins to authenticated;
grant select on public.account_moderation to authenticated;
grant select on public.moderation_audit_logs to authenticated;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to anon, authenticated;
revoke all on function public.is_account_restricted(uuid) from public;
grant execute on function public.is_account_restricted(uuid) to anon, authenticated;
revoke all on function private.assert_app_admin() from public, anon, authenticated;
revoke all on function private.enforce_unrestricted_actor() from public, anon, authenticated;
revoke all on function public.can_read_entry(uuid) from public;
revoke all on function public.can_collaborate_entry(uuid) from public;
revoke all on function public.can_edit_entry_field(uuid, text) from public;
revoke all on function public.can_interact_entry(uuid) from public;
revoke all on function public.can_read_entry_edit_log(uuid, timestamptz) from public;
revoke all on function public.can_view_story_route(uuid) from public;
revoke all on function public.can_report_target(text, uuid) from public, anon;
grant execute on function public.can_read_entry(uuid) to anon, authenticated;
grant execute on function public.can_collaborate_entry(uuid) to authenticated;
grant execute on function public.can_edit_entry_field(uuid, text) to authenticated;
grant execute on function public.can_interact_entry(uuid) to authenticated;
grant execute on function public.can_read_entry_edit_log(uuid, timestamptz) to authenticated;
grant execute on function public.can_view_story_route(uuid) to anon, authenticated;
grant execute on function public.can_report_target(text, uuid) to authenticated;
revoke all on function public.maintain_map_entry_featured_state()
from public, anon, authenticated;
revoke all on function public.reserve_entry_media_asset(uuid, uuid, text, bigint, bigint, integer, integer)
from public, anon, authenticated;
grant execute on function public.reserve_entry_media_asset(uuid, uuid, text, bigint, bigint, integer, integer)
to service_role;

create or replace function public.admin_get_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.assert_app_admin();
  select jsonb_build_object(
    'total_users', (select count(*) from public.profiles where deleted_at is null),
    'recent_users_7d', (select count(*) from public.profiles where deleted_at is null and created_at >= now() - interval '7 days'),
    'active_users_30d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '30 days'),
    'restricted_users', (select count(*) from public.account_moderation where status = 'restricted'),
    'total_entries', (select count(*) from public.map_entries),
    'public_entries', (select count(*) from public.map_entries where visibility = 'public'),
    'private_entries', (select count(*) from public.map_entries where visibility = 'private'),
    'group_entries', (select count(*) from public.map_entries where visibility = 'group'),
    'moderated_entries', (select count(*) from public.map_entries where moderation_status <> 'active'),
    'story_routes', (select count(*) from public.story_routes),
    'groups', (select count(*) from public.groups),
    'pending_reports', (select count(*) from public.reports where status in ('pending', 'reviewing'))
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_list_users(
  p_query text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.assert_app_admin();
  with matched as (
    select
      profile.id,
      profile.username,
      profile.display_name,
      profile.avatar_url,
      profile.created_at,
      auth_user.last_sign_in_at,
      coalesce(moderation.status, 'active') as account_status,
      exists (select 1 from public.app_admins administrator where administrator.user_id = profile.id) as is_admin,
      (select count(*) from public.map_entries entry where entry.user_id = profile.id) as story_count,
      (select count(*) from public.story_routes route where route.created_by = profile.id) as route_count,
      (select count(*) from public.reports report where report.target_type = 'user' and report.target_id = profile.id) as report_count
    from public.profiles profile
    left join auth.users auth_user on auth_user.id = profile.id
    left join public.account_moderation moderation on moderation.user_id = profile.id
    where profile.deleted_at is null
      and (
        nullif(btrim(coalesce(p_query, '')), '') is null
        or profile.display_name ilike '%' || btrim(p_query) || '%'
        or profile.username ilike '%' || btrim(p_query) || '%'
      )
    order by profile.created_at desc, profile.id desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 25), 1), 50) + 1
  ), numbered as (
    select *, row_number() over () as row_number from matched
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(to_jsonb(numbered) - 'row_number') filter (
      where numbered.row_number <= least(greatest(coalesce(p_limit, 25), 1), 50)
    ), '[]'::jsonb),
    'has_more', coalesce(max(numbered.row_number), 0) > least(greatest(coalesce(p_limit, 25), 1), 50)
  ) into result
  from numbered;
  return coalesce(result, jsonb_build_object('items', '[]'::jsonb, 'has_more', false));
end;
$$;

create or replace function public.admin_list_reports(
  p_status text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.assert_app_admin();
  if p_status is not null and p_status not in ('pending', 'reviewing', 'resolved', 'dismissed') then
    raise exception using errcode = '22023', message = 'invalid report status';
  end if;
  with matched as (
    select
      report.id,
      report.target_type,
      report.target_id,
      report.reason,
      report.description,
      report.status,
      report.created_at,
      report.reviewed_at,
      report.review_notes,
      reporter.display_name as reporter_name,
      case report.target_type
        when 'entry' then coalesce((
          select case when entry.visibility = 'public' then entry.title else '受保护故事' end
          from public.map_entries entry where entry.id = report.target_id
        ), '已删除的故事')
        when 'route' then coalesce((
          select case when route.visibility = 'public' then route.title else '受保护路线' end
          from public.story_routes route where route.id = report.target_id
        ), '已删除的路线')
        when 'user' then coalesce((select profile.display_name from public.profiles profile where profile.id = report.target_id), '已删除的用户')
        when 'group' then coalesce((select case when target_group.visibility = 'public' then target_group.name else '私密群组' end from public.groups target_group where target_group.id = report.target_id), '已归档的群组')
        when 'comment' then '评论（正文不在审核列表展示）'
        else '未知对象'
      end as target_label,
      case report.target_type
        when 'entry' then '/entries/' || report.target_id::text
        when 'route' then coalesce((select '/routes/' || route.share_slug from public.story_routes route where route.id = report.target_id and route.visibility = 'public'), '')
        when 'user' then '/users/' || report.target_id::text
        else ''
      end as target_href
    from public.reports report
    left join public.profiles reporter on reporter.id = report.reporter_id
    where p_status is null or report.status = p_status
    order by report.created_at desc, report.id desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 25), 1), 50) + 1
  ), numbered as (
    select *, row_number() over () as row_number from matched
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(to_jsonb(numbered) - 'row_number') filter (
      where numbered.row_number <= least(greatest(coalesce(p_limit, 25), 1), 50)
    ), '[]'::jsonb),
    'has_more', coalesce(max(numbered.row_number), 0) > least(greatest(coalesce(p_limit, 25), 1), 50)
  ) into result
  from numbered;
  return coalesce(result, jsonb_build_object('items', '[]'::jsonb, 'has_more', false));
end;
$$;

create or replace function public.admin_list_public_content(
  p_kind text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.assert_app_admin();
  if p_kind is not null and p_kind not in ('entry', 'route') then
    raise exception using errcode = '22023', message = 'invalid content kind';
  end if;
  with all_content as (
    select
      'entry'::text as kind,
      entry.id,
      entry.title,
      author.display_name as author_name,
      entry.moderation_status,
      entry.featured_at is not null as featured,
      entry.created_at,
      '/entries/' || entry.id::text as href
    from public.map_entries entry
    left join public.profiles author on author.id = entry.user_id
    where entry.visibility = 'public'
      and (entry.unlock_at is null or entry.unlock_at <= now())
    union all
    select
      'route'::text,
      route.id,
      route.title,
      author.display_name,
      route.moderation_status,
      route.featured_at is not null,
      route.created_at,
      '/routes/' || route.share_slug
    from public.story_routes route
    left join public.profiles author on author.id = route.created_by
    where route.visibility = 'public' and route.published_at is not null
  ), matched as (
    select * from all_content
    where p_kind is null or kind = p_kind
    order by created_at desc, id desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 25), 1), 50) + 1
  ), numbered as (
    select *, row_number() over () as row_number from matched
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(to_jsonb(numbered) - 'row_number') filter (
      where numbered.row_number <= least(greatest(coalesce(p_limit, 25), 1), 50)
    ), '[]'::jsonb),
    'has_more', coalesce(max(numbered.row_number), 0) > least(greatest(coalesce(p_limit, 25), 1), 50)
  ) into result
  from numbered;
  return coalesce(result, jsonb_build_object('items', '[]'::jsonb, 'has_more', false));
end;
$$;

create or replace function public.admin_list_audit_logs(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.assert_app_admin();
  select coalesce(jsonb_agg(to_jsonb(log_row)), '[]'::jsonb)
  into result
  from (
    select log.id, log.action, log.target_type, log.target_id,
      log.report_id, log.metadata, log.created_at,
      administrator.display_name as admin_name
    from public.moderation_audit_logs log
    left join public.profiles administrator on administrator.id = log.admin_user_id
    order by log.created_at desc, log.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) log_row;
  return result;
end;
$$;

create or replace function public.admin_set_account_restriction(
  p_user_id uuid,
  p_restricted boolean,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := private.assert_app_admin();
begin
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id and deleted_at is null) then
    raise exception using errcode = 'P0002', message = 'account not found';
  end if;
  if p_user_id = actor or exists (select 1 from public.app_admins where user_id = p_user_id) then
    raise exception using errcode = '42501', message = 'administrator accounts cannot be restricted here';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) > 500 then
    raise exception using errcode = '22023', message = 'moderation reason is too long';
  end if;
  insert into public.account_moderation (
    user_id, status, reason, restricted_at, restricted_by, updated_at
  ) values (
    p_user_id,
    case when p_restricted then 'restricted' else 'active' end,
    case when p_restricted then btrim(coalesce(p_reason, '')) else '' end,
    case when p_restricted then now() else null end,
    case when p_restricted then actor else null end,
    now()
  ) on conflict (user_id) do update set
    status = excluded.status,
    reason = excluded.reason,
    restricted_at = excluded.restricted_at,
    restricted_by = excluded.restricted_by,
    updated_at = now();
  insert into public.moderation_audit_logs (admin_user_id, action, target_type, target_id, metadata)
  values (
    actor,
    case when p_restricted then 'account.restricted' else 'account.restored' end,
    'user', p_user_id,
    jsonb_build_object('reason', left(btrim(coalesce(p_reason, '')), 500))
  );
  perform private.enqueue_user_notification(
    p_user_id, 'security_alert', 'security', null, 'profile', p_user_id,
    jsonb_build_object(
      'message', case when p_restricted then '你的账号已被限制，请联系维护者了解详情。' else '你的账号限制已解除。' end,
      'target_path', '/settings'
    ),
    'account-moderation:' || p_user_id::text || ':' || case when p_restricted then 'restricted' else 'restored' end || ':' || extract(epoch from now())::bigint::text
  );
end;
$$;

create or replace function public.admin_moderate_entry(
  p_entry_id uuid,
  p_status text,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.assert_app_admin();
  owner_id uuid;
  entry_title text;
begin
  if p_status not in ('active', 'restricted', 'removed') or char_length(btrim(coalesce(p_reason, ''))) > 500 then
    raise exception using errcode = '22023', message = 'invalid moderation state';
  end if;
  select entry.user_id, entry.title into owner_id, entry_title
  from public.map_entries entry
  where entry.id = p_entry_id and entry.visibility = 'public'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'public entry not found';
  end if;
  update public.map_entries set
    moderation_status = p_status,
    moderation_reason = case when p_status = 'active' then '' else btrim(coalesce(p_reason, '')) end,
    moderated_at = case when p_status = 'active' then null else now() end,
    moderated_by = case when p_status = 'active' then null else actor end,
    featured_at = case when p_status = 'active' then featured_at else null end
  where id = p_entry_id;
  insert into public.moderation_audit_logs (admin_user_id, action, target_type, target_id, metadata)
  values (actor, 'entry.' || p_status, 'entry', p_entry_id,
    jsonb_build_object('reason', left(btrim(coalesce(p_reason, '')), 500)));
  perform private.enqueue_user_notification(
    owner_id, case when p_status = 'active' then 'security_alert' else 'story_restricted' end,
    'security', null, 'entry', p_entry_id,
    jsonb_build_object(
      'entry_title', entry_title,
      'message', case when p_status = 'active' then '你的故事已恢复展示。' else '你的公开故事已被限制展示。' end,
      'target_path', '/entries/' || p_entry_id::text
    ),
    'entry-moderation:' || p_entry_id::text || ':' || p_status || ':' || extract(epoch from now())::bigint::text
  );
end;
$$;

create or replace function public.admin_moderate_story_route(
  p_route_id uuid,
  p_status text,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.assert_app_admin();
  owner_id uuid;
  route_title text;
  route_slug text;
begin
  if p_status not in ('active', 'restricted', 'removed') or char_length(btrim(coalesce(p_reason, ''))) > 500 then
    raise exception using errcode = '22023', message = 'invalid moderation state';
  end if;
  select route.created_by, route.title, route.share_slug into owner_id, route_title, route_slug
  from public.story_routes route
  where route.id = p_route_id and route.visibility = 'public' and route.published_at is not null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'public route not found';
  end if;
  update public.story_routes set
    moderation_status = p_status,
    moderation_reason = case when p_status = 'active' then '' else btrim(coalesce(p_reason, '')) end,
    moderated_at = case when p_status = 'active' then null else now() end,
    moderated_by = case when p_status = 'active' then null else actor end,
    featured_at = case when p_status = 'active' then featured_at else null end,
    featured_by = case when p_status = 'active' then featured_by else null end
  where id = p_route_id;
  insert into public.moderation_audit_logs (admin_user_id, action, target_type, target_id, metadata)
  values (actor, 'route.' || p_status, 'route', p_route_id,
    jsonb_build_object('reason', left(btrim(coalesce(p_reason, '')), 500)));
  perform private.enqueue_user_notification(
    owner_id, case when p_status = 'active' then 'security_alert' else 'story_restricted' end,
    'security', null, 'story_route', p_route_id,
    jsonb_build_object(
      'route_title', route_title,
      'message', case when p_status = 'active' then '你的故事路线已恢复展示。' else '你的公开故事路线已被限制展示。' end,
      'target_path', '/routes/' || route_slug
    ),
    'route-moderation:' || p_route_id::text || ':' || p_status || ':' || extract(epoch from now())::bigint::text
  );
end;
$$;

create or replace function public.admin_set_entry_featured(p_entry_id uuid, p_featured boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.assert_app_admin();
  owner_id uuid;
  entry_title text;
begin
  select entry.user_id, entry.title into owner_id, entry_title
  from public.map_entries entry
  where entry.id = p_entry_id
    and entry.visibility = 'public'
    and entry.moderation_status = 'active'
    and not public.is_account_restricted(entry.user_id)
    and (entry.unlock_at is null or entry.unlock_at <= now());
  if not found then
    raise exception using errcode = 'P0002', message = 'eligible public entry not found';
  end if;
  update public.map_entries set featured_at = case when p_featured then now() else null end
  where id = p_entry_id;
  insert into public.moderation_audit_logs (admin_user_id, action, target_type, target_id, metadata)
  values (actor, case when p_featured then 'entry.featured' else 'entry.unfeatured' end,
    'entry', p_entry_id, '{}'::jsonb);
  if p_featured then
    perform private.enqueue_user_notification(
      owner_id, 'story_featured', 'product_updates', null, 'entry', p_entry_id,
      jsonb_build_object('entry_title', entry_title, 'target_path', '/entries/' || p_entry_id::text),
      'entry-featured:' || p_entry_id::text || ':' || extract(epoch from now())::bigint::text
    );
  end if;
end;
$$;

create or replace function public.admin_review_report(
  p_report_id uuid,
  p_status text,
  p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.assert_app_admin();
  report_target_type text;
  report_target_id uuid;
begin
  if p_status not in ('reviewing', 'resolved', 'dismissed')
    or char_length(btrim(coalesce(p_notes, ''))) > 2000
  then
    raise exception using errcode = '22023', message = 'invalid report review';
  end if;
  update public.reports set
    status = p_status,
    reviewed_at = case when p_status in ('resolved', 'dismissed') then now() else reviewed_at end,
    reviewed_by = actor,
    review_notes = btrim(coalesce(p_notes, ''))
  where id = p_report_id
  returning target_type, target_id into report_target_type, report_target_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'report not found';
  end if;
  insert into public.moderation_audit_logs (
    admin_user_id, action, target_type, target_id, report_id, metadata
  ) values (
    actor, 'report.' || p_status, 'report', p_report_id, p_report_id,
    jsonb_build_object(
      'reported_target_type', report_target_type,
      'reported_target_id', report_target_id,
      'notes', left(btrim(coalesce(p_notes, '')), 2000)
    )
  );
end;
$$;

revoke all on function public.admin_get_dashboard() from public, anon;
revoke all on function public.admin_list_users(text, integer, integer) from public, anon;
revoke all on function public.admin_list_reports(text, integer, integer) from public, anon;
revoke all on function public.admin_list_public_content(text, integer, integer) from public, anon;
revoke all on function public.admin_list_audit_logs(integer) from public, anon;
revoke all on function public.admin_set_account_restriction(uuid, boolean, text) from public, anon;
revoke all on function public.admin_moderate_entry(uuid, text, text) from public, anon;
revoke all on function public.admin_moderate_story_route(uuid, text, text) from public, anon;
revoke all on function public.admin_set_entry_featured(uuid, boolean) from public, anon;
revoke all on function public.admin_review_report(uuid, text, text) from public, anon;

grant execute on function public.admin_get_dashboard() to authenticated;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;
grant execute on function public.admin_list_reports(text, integer, integer) to authenticated;
grant execute on function public.admin_list_public_content(text, integer, integer) to authenticated;
grant execute on function public.admin_list_audit_logs(integer) to authenticated;
grant execute on function public.admin_set_account_restriction(uuid, boolean, text) to authenticated;
grant execute on function public.admin_moderate_entry(uuid, text, text) to authenticated;
grant execute on function public.admin_moderate_story_route(uuid, text, text) to authenticated;
grant execute on function public.admin_set_entry_featured(uuid, boolean) to authenticated;
grant execute on function public.admin_review_report(uuid, text, text) to authenticated;

comment on table public.app_admins is
  'Explicit application administrators. Bootstrap entries only from trusted SQL or service operations.';
comment on table public.account_moderation is
  'Private account restriction state; never place moderation fields on public profiles.';
comment on table public.moderation_audit_logs is
  'Append-only audit metadata. It intentionally excludes private story bodies and authentication secrets.';

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 202608290002_v14_product_analytics.sql
-- ============================================================
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

-- ============================================================
-- MIGRATION: 202608290003_v14_commercial_foundation.sql
-- ============================================================
-- v1.4 commercial foundation: public plan catalog, entitlement-driven limits,
-- private subscription state, exact usage reporting and database-enforced quotas.
--
-- This migration does not connect a payment provider and does not charge users.
-- Rollback note: remove the quota trigger/functions before dropping these tables.
-- Do not roll back after subscriptions exist without first preserving that state.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.map_entries') is null
    or to_regclass('public.story_routes') is null
    or to_regclass('public.entry_media_assets') is null
    or to_regprocedure('public.set_updated_at()') is null
    or to_regprocedure('public.is_account_restricted(uuid)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'commercial foundation requires the v1.4 media and governance migrations';
  end if;
end;
$$;

create table if not exists public.plans (
  code text primary key,
  name varchar(80) not null,
  description varchar(500) not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_code_format check (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint plans_name_not_blank check (char_length(btrim(name)) between 1 and 80),
  constraint plans_description_length check (char_length(description) <= 500),
  constraint plans_sort_order_range check (sort_order between 0 and 10000)
);

create table if not exists public.plan_entitlements (
  plan_code text not null references public.plans(code) on delete cascade,
  entitlement_key text not null,
  value_type text not null,
  boolean_value boolean,
  integer_value bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_code, entitlement_key),
  constraint plan_entitlements_known_key check (
    entitlement_key in (
      'can_upload_media',
      'max_storage_bytes',
      'max_media_files',
      'max_story_routes',
      'advanced_export'
    )
  ),
  constraint plan_entitlements_value_type check (
    value_type in ('boolean', 'integer')
  ),
  constraint plan_entitlements_typed_value check (
    (value_type = 'boolean' and boolean_value is not null and integer_value is null)
    or
    (value_type = 'integer' and boolean_value is null and integer_value is not null and integer_value >= 0)
  )
);

create table if not exists public.user_subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  plan_code text not null references public.plans(code) on delete restrict,
  status text not null default 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_subscriptions_status_values check (
    status in ('trialing', 'active', 'past_due', 'canceled')
  ),
  constraint user_subscriptions_period_order check (
    current_period_start is null
    or current_period_end is null
    or current_period_end > current_period_start
  ),
  constraint user_subscriptions_cancel_state check (
    status = 'canceled' or canceled_at is null
  )
);

create index if not exists user_subscriptions_plan_status_idx
  on public.user_subscriptions(plan_code, status, current_period_end);

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at
before update on public.plans
for each row execute function public.set_updated_at();

drop trigger if exists plan_entitlements_set_updated_at on public.plan_entitlements;
create trigger plan_entitlements_set_updated_at
before update on public.plan_entitlements
for each row execute function public.set_updated_at();

drop trigger if exists user_subscriptions_set_updated_at on public.user_subscriptions;
create trigger user_subscriptions_set_updated_at
before update on public.user_subscriptions
for each row execute function public.set_updated_at();

insert into public.plans (code, name, description, sort_order)
values
  ('free', 'Free', '保留完整的故事记录核心能力与基础媒体空间。', 10),
  ('supporter', 'Supporter', '为长期记录者预留更大的媒体与故事线路容量。', 20),
  ('creator', 'Creator', '为持续公开创作与大型地图预留更高容量。', 30)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order;

insert into public.plan_entitlements (
  plan_code, entitlement_key, value_type, boolean_value, integer_value
)
values
  ('free', 'can_upload_media', 'boolean', true, null),
  ('free', 'max_storage_bytes', 'integer', null, 524288000),
  ('free', 'max_media_files', 'integer', null, 1000),
  ('free', 'max_story_routes', 'integer', null, 100),
  ('free', 'advanced_export', 'boolean', true, null),
  ('supporter', 'can_upload_media', 'boolean', true, null),
  ('supporter', 'max_storage_bytes', 'integer', null, 5368709120),
  ('supporter', 'max_media_files', 'integer', null, 10000),
  ('supporter', 'max_story_routes', 'integer', null, 500),
  ('supporter', 'advanced_export', 'boolean', true, null),
  ('creator', 'can_upload_media', 'boolean', true, null),
  ('creator', 'max_storage_bytes', 'integer', null, 21474836480),
  ('creator', 'max_media_files', 'integer', null, 50000),
  ('creator', 'max_story_routes', 'integer', null, 2000),
  ('creator', 'advanced_export', 'boolean', true, null)
on conflict (plan_code, entitlement_key) do update
set value_type = excluded.value_type,
    boolean_value = excluded.boolean_value,
    integer_value = excluded.integer_value;

create or replace function private.resolve_user_plan_code(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select subscription.plan_code
      from public.user_subscriptions subscription
      join public.plans plan on plan.code = subscription.plan_code
      where subscription.user_id = p_user_id
        and plan.is_active
        and (
          (
            subscription.status in ('trialing', 'active')
            and (
              subscription.current_period_end is null
              or subscription.current_period_end > now()
            )
          )
          or (
            subscription.status = 'canceled'
            and subscription.current_period_end is not null
            and subscription.current_period_end > now()
          )
        )
      limit 1
    ),
    'free'
  );
$$;

create or replace function private.get_boolean_entitlement(
  p_user_id uuid,
  p_entitlement_key text,
  p_default boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select entitlement.boolean_value
      from public.plan_entitlements entitlement
      where entitlement.plan_code = private.resolve_user_plan_code(p_user_id)
        and entitlement.entitlement_key = p_entitlement_key
        and entitlement.value_type = 'boolean'
    ),
    p_default
  );
$$;

create or replace function private.get_integer_entitlement(
  p_user_id uuid,
  p_entitlement_key text,
  p_default bigint default 0
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select entitlement.integer_value
      from public.plan_entitlements entitlement
      where entitlement.plan_code = private.resolve_user_plan_code(p_user_id)
        and entitlement.entitlement_key = p_entitlement_key
        and entitlement.value_type = 'integer'
    ),
    p_default
  );
$$;

create or replace function public.get_my_commercial_access()
returns table (
  plan_code text,
  plan_name text,
  plan_description text,
  subscription_status text,
  current_period_end timestamptz,
  can_upload_media boolean,
  max_storage_bytes bigint,
  max_media_files bigint,
  max_story_routes bigint,
  advanced_export boolean,
  story_count bigint,
  active_route_count bigint,
  storage_bytes bigint,
  media_file_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  resolved_plan text;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  resolved_plan := private.resolve_user_plan_code(actor);

  return query
  select
    plan.code,
    plan.name::text,
    plan.description::text,
    subscription.status,
    subscription.current_period_end,
    private.get_boolean_entitlement(actor, 'can_upload_media', false),
    private.get_integer_entitlement(actor, 'max_storage_bytes', 0),
    private.get_integer_entitlement(actor, 'max_media_files', 0),
    private.get_integer_entitlement(actor, 'max_story_routes', 0),
    private.get_boolean_entitlement(actor, 'advanced_export', false),
    (select count(*) from public.map_entries entry where entry.user_id = actor),
    (
      select count(*)
      from public.story_routes route
      where route.created_by = actor and route.archived_at is null
    ),
    (
      select coalesce(sum(asset.size_bytes + asset.thumbnail_size_bytes), 0)::bigint
      from public.entry_media_assets asset
      where asset.user_id = actor and asset.status in ('pending', 'ready')
    ),
    (
      select count(*)
      from public.entry_media_assets asset
      where asset.user_id = actor and asset.status in ('pending', 'ready')
    )
  from public.plans plan
  left join public.user_subscriptions subscription
    on subscription.user_id = actor
    and subscription.plan_code = plan.code
  where plan.code = resolved_plan;
end;
$$;

create or replace function public.get_my_story_media_usage()
returns table (
  used_bytes bigint,
  quota_bytes bigint,
  file_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum(asset.size_bytes + asset.thumbnail_size_bytes), 0)::bigint,
    private.get_integer_entitlement((select auth.uid()), 'max_storage_bytes', 0),
    count(*)::integer
  from public.entry_media_assets asset
  where asset.user_id = (select auth.uid())
    and asset.status in ('pending', 'ready');
$$;

create or replace function public.reserve_entry_media_asset(
  p_user_id uuid,
  p_entry_id uuid,
  p_source_mime_type text,
  p_size_bytes bigint,
  p_thumbnail_size_bytes bigint,
  p_width integer,
  p_height integer
)
returns public.entry_media_assets
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := p_user_id;
  asset_id uuid := gen_random_uuid();
  current_bytes bigint;
  current_files bigint;
  max_bytes bigint;
  max_files bigint;
  reserved public.entry_media_assets%rowtype;
begin
  if actor is null or public.is_account_restricted(actor) then
    raise exception using errcode = '42501', message = 'media owner unavailable';
  end if;
  if not private.get_boolean_entitlement(actor, 'can_upload_media', false) then
    raise exception using errcode = '42501', message = 'media upload entitlement required';
  end if;
  if p_source_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_size_bytes not between 1 and 6291456
    or p_thumbnail_size_bytes not between 1 and 2097152
    or p_width not between 1 and 20000
    or p_height not between 1 and 20000
  then
    raise exception using errcode = '22023', message = 'invalid media metadata';
  end if;
  if not exists (
    select 1 from public.map_entries entry
    where entry.id = p_entry_id
      and entry.user_id = actor
      and entry.moderation_status = 'active'
      and (
        entry.visibility <> 'group'
        or exists (
          select 1 from public.group_members membership
          where membership.group_id = entry.group_id
            and membership.user_id = actor
            and membership.status = 'active'
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'entry media owner required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor::text, 8142301)
  );

  select
    coalesce(sum(asset.size_bytes + asset.thumbnail_size_bytes), 0)::bigint,
    count(*)::bigint
  into current_bytes, current_files
  from public.entry_media_assets asset
  where asset.user_id = actor and asset.status in ('pending', 'ready');

  max_bytes := private.get_integer_entitlement(actor, 'max_storage_bytes', 0);
  max_files := private.get_integer_entitlement(actor, 'max_media_files', 0);

  if (
    select count(*) from public.entry_media_assets asset
    where asset.entry_id = p_entry_id and asset.status in ('pending', 'ready')
  ) >= 10 then
    raise exception using errcode = '23514', message = 'entry media limit reached';
  end if;
  if current_files >= max_files then
    raise exception using errcode = '23514', message = 'story media file quota reached';
  end if;
  if current_bytes + p_size_bytes + p_thumbnail_size_bytes > max_bytes then
    raise exception using errcode = '23514', message = 'story media storage quota reached';
  end if;

  insert into public.entry_media_assets (
    id, entry_id, user_id, storage_path, thumbnail_path, source_mime_type,
    width, height, size_bytes, thumbnail_size_bytes
  ) values (
    asset_id, p_entry_id, actor,
    actor::text || '/' || p_entry_id::text || '/' || asset_id::text || '.webp',
    actor::text || '/' || p_entry_id::text || '/' || asset_id::text || '-thumb.webp',
    p_source_mime_type, p_width, p_height, p_size_bytes, p_thumbnail_size_bytes
  ) returning * into reserved;

  return reserved;
end;
$$;

create or replace function private.enforce_story_route_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_routes bigint;
  max_routes bigint;
begin
  if new.archived_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.archived_at is null
    and old.created_by = new.created_by
  then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.created_by::text, 8142302)
  );

  max_routes := private.get_integer_entitlement(
    new.created_by,
    'max_story_routes',
    0
  );
  select count(*) into current_routes
  from public.story_routes route
  where route.created_by = new.created_by
    and route.archived_at is null
    and route.id <> new.id;

  if current_routes >= max_routes then
    raise exception using errcode = '23514', message = 'story route quota reached';
  end if;
  return new;
end;
$$;

drop trigger if exists story_routes_enforce_entitlement_quota on public.story_routes;
create trigger story_routes_enforce_entitlement_quota
before insert or update of archived_at, created_by on public.story_routes
for each row execute function private.enforce_story_route_quota();

alter table public.plans enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.user_subscriptions enable row level security;

drop policy if exists "active_plans_are_public" on public.plans;
create policy "active_plans_are_public"
on public.plans for select to anon, authenticated
using (is_active);

drop policy if exists "active_plan_entitlements_are_public" on public.plan_entitlements;
create policy "active_plan_entitlements_are_public"
on public.plan_entitlements for select to anon, authenticated
using (
  exists (
    select 1 from public.plans plan
    where plan.code = plan_entitlements.plan_code and plan.is_active
  )
);

drop policy if exists "users_read_own_subscription" on public.user_subscriptions;
create policy "users_read_own_subscription"
on public.user_subscriptions for select to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.plans from public, anon, authenticated;
revoke all on table public.plan_entitlements from public, anon, authenticated;
revoke all on table public.user_subscriptions from public, anon, authenticated;
grant select on table public.plans to anon, authenticated;
grant select on table public.plan_entitlements to anon, authenticated;
grant select on table public.user_subscriptions to authenticated;

revoke all on function private.resolve_user_plan_code(uuid) from public, anon, authenticated;
revoke all on function private.get_boolean_entitlement(uuid, text, boolean) from public, anon, authenticated;
revoke all on function private.get_integer_entitlement(uuid, text, bigint) from public, anon, authenticated;
revoke all on function private.enforce_story_route_quota() from public, anon, authenticated;
revoke all on function public.get_my_commercial_access() from public, anon, authenticated;
grant execute on function public.get_my_commercial_access() to authenticated;

revoke all on function public.get_my_story_media_usage() from public, anon, authenticated;
grant execute on function public.get_my_story_media_usage() to authenticated;
revoke all on function public.reserve_entry_media_asset(uuid, uuid, text, bigint, bigint, integer, integer)
from public, anon, authenticated;
grant execute on function public.reserve_entry_media_asset(uuid, uuid, text, bigint, bigint, integer, integer)
to service_role;

comment on table public.plans is
  'Public product plan catalog. Application behavior must use entitlements, not plan-name branches.';
comment on table public.plan_entitlements is
  'Typed feature and quota values for each product plan.';
comment on table public.user_subscriptions is
  'Server-managed user plan assignment. No payment provider is connected by this migration.';
comment on function public.get_my_commercial_access() is
  'Returns the authenticated user current entitlements and exact owned-resource usage.';
comment on function private.enforce_story_route_quota() is
  'Serializes new or restored route writes and enforces max_story_routes.';

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 202608290004_v14_product_completeness.sql
-- ============================================================
-- v1.4 product completeness: privacy-bounded feedback intake and simple
-- operational feature flags. No flag is an authorization boundary.
--
-- Rollback note: remove application callers and the evaluated-flags RPC before
-- dropping these tables. Product feedback should be exported before rollback.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regprocedure('public.set_updated_at()') is null
    or to_regprocedure('public.consume_server_rate_limit(text,text,integer,integer)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'product completeness requires the v1.4 security migration';
  end if;
end;
$$;

create table if not exists public.product_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  category text not null,
  message varchar(2000) not null,
  current_route varchar(240) not null,
  app_version varchar(80) not null,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_feedback_category_values check (
    category in ('bug', 'feature', 'content', 'other')
  ),
  constraint product_feedback_message_not_blank check (
    char_length(btrim(message)) between 1 and 2000
  ),
  constraint product_feedback_route_safe check (
    char_length(current_route) between 1 and 240
    and current_route like '/%'
    and current_route !~ '[[:cntrl:]?#]'
  ),
  constraint product_feedback_version_safe check (
    char_length(btrim(app_version)) between 1 and 80
    and app_version !~ '[[:cntrl:]]'
  ),
  constraint product_feedback_status_values check (
    status in ('new', 'reviewing', 'resolved', 'dismissed')
  )
);

create index if not exists product_feedback_status_created_idx
  on public.product_feedback(status, created_at desc, id desc);
create index if not exists product_feedback_user_created_idx
  on public.product_feedback(user_id, created_at desc, id desc)
  where user_id is not null;

drop trigger if exists product_feedback_set_updated_at on public.product_feedback;
create trigger product_feedback_set_updated_at
before update on public.product_feedback
for each row execute function public.set_updated_at();

create table if not exists public.feature_flags (
  key text primary key,
  description varchar(500) not null default '',
  enabled boolean not null default false,
  rollout_percentage smallint not null default 0,
  authenticated_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_flags_key_format check (
    char_length(key) between 2 and 64
    and key ~ '^[a-z][a-z0-9_]{1,63}$'
  ),
  constraint feature_flags_description_length check (char_length(description) <= 500),
  constraint feature_flags_rollout_range check (rollout_percentage between 0 and 100)
);

create table if not exists public.feature_flag_overrides (
  flag_key text not null references public.feature_flags(key) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  enabled boolean not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (flag_key, user_id)
);

create index if not exists feature_flag_overrides_user_flag_idx
  on public.feature_flag_overrides(user_id, flag_key);

drop trigger if exists feature_flags_set_updated_at on public.feature_flags;
create trigger feature_flags_set_updated_at
before update on public.feature_flags
for each row execute function public.set_updated_at();

drop trigger if exists feature_flag_overrides_set_updated_at on public.feature_flag_overrides;
create trigger feature_flag_overrides_set_updated_at
before update on public.feature_flag_overrides
for each row execute function public.set_updated_at();

insert into public.feature_flags (
  key,
  description,
  enabled,
  rollout_percentage,
  authenticated_only
)
values
  ('media_upload', '故事图片上传界面。权限与配额仍由数据库单独强制。', true, 100, true),
  ('notifications', '站内通知中心与通知偏好。', true, 100, true),
  ('subscriptions', '未来套餐升级和支付入口。当前保持关闭。', false, 0, true),
  ('creator_features', '未来 Creator 专属展示能力。当前保持关闭。', false, 0, true)
on conflict (key) do update
set description = excluded.description,
    authenticated_only = excluded.authenticated_only;

create or replace function public.get_evaluated_feature_flags()
returns table (
  flag_key text,
  enabled boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select auth.uid() as user_id
  )
  select
    flag.key,
    coalesce(
      override.enabled,
      case
        when not flag.enabled then false
        when flag.authenticated_only and actor.user_id is null then false
        when flag.rollout_percentage = 100 then true
        when flag.rollout_percentage = 0 then false
        when actor.user_id is null then false
        else mod(
          abs(
            pg_catalog.hashtextextended(
              actor.user_id::text || ':' || flag.key,
              8142303
            )::numeric
          ),
          100
        ) < flag.rollout_percentage
      end,
      false
    ) as enabled
  from public.feature_flags flag
  cross join actor
  left join public.feature_flag_overrides override
    on override.flag_key = flag.key
    and override.user_id = actor.user_id
  order by flag.key;
$$;

alter table public.product_feedback enable row level security;
alter table public.feature_flags enable row level security;
alter table public.feature_flag_overrides enable row level security;

drop policy if exists "product_feedback_has_no_browser_rows" on public.product_feedback;
create policy "product_feedback_has_no_browser_rows"
on public.product_feedback for select to anon, authenticated
using (false);

drop policy if exists "feature_flags_have_no_direct_browser_rows" on public.feature_flags;
create policy "feature_flags_have_no_direct_browser_rows"
on public.feature_flags for select to anon, authenticated
using (false);

drop policy if exists "feature_flag_overrides_have_no_browser_rows" on public.feature_flag_overrides;
create policy "feature_flag_overrides_have_no_browser_rows"
on public.feature_flag_overrides for select to anon, authenticated
using (false);

revoke all on table public.product_feedback from public, anon, authenticated;
revoke all on table public.feature_flags from public, anon, authenticated;
revoke all on table public.feature_flag_overrides from public, anon, authenticated;

revoke all on function public.get_evaluated_feature_flags()
from public, anon, authenticated;
grant execute on function public.get_evaluated_feature_flags()
to anon, authenticated;

comment on table public.product_feedback is
  'Rate-limited product feedback. The app never automatically attaches story bodies, auth tokens or screenshots.';
comment on table public.feature_flags is
  'Operational UI rollout controls. Feature flags never grant database authorization.';
comment on table public.feature_flag_overrides is
  'Trusted-operator per-user rollout overrides. Rows are never exposed to browser roles.';
comment on function public.get_evaluated_feature_flags() is
  'Returns only evaluated booleans for the current auth identity; it accepts no user-id parameter.';

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 20260830085143_v14_governance_notification_entity_fix.sql
-- ============================================================
-- Keep the notification entity contract compatible with governance events.
-- Account moderation points to the affected public profile without exposing
-- authentication data. Existing notification rows remain valid.

do $$
begin
  if to_regclass('public.notifications') is null
    or to_regclass('public.account_moderation') is null
  then
    raise exception using
      errcode = '55000',
      message = 'governance notification fix requires notifications and governance migrations';
  end if;
end;
$$;

alter table public.notifications
  drop constraint if exists notifications_entity_values;

alter table public.notifications
  add constraint notifications_entity_values check (
    entity_type is null or entity_type in (
      'entry', 'entry_participant', 'group', 'group_invitation',
      'story_route', 'account', 'profile', 'export', 'system'
    )
  ) not valid;

alter table public.notifications
  validate constraint notifications_entity_values;

comment on constraint notifications_entity_values on public.notifications is
  'Notification targets, including public profiles referenced by account moderation events.';

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 202609020001_v14_post_launch_fk_indexes.sql
-- ============================================================
-- Story-and-Place v1.4 post-launch hardening.
--
-- PostgreSQL does not automatically index the referencing side of foreign
-- keys. These indexes keep joins, parent updates and account/data cleanup from
-- degrading into full-table scans as production data grows. Nullable audit
-- references use partial indexes so null-only rows do not consume index space.

set lock_timeout = '5s';
set statement_timeout = '10min';

create index if not exists account_moderation_restricted_by_idx
  on public.account_moderation (restricted_by)
  where restricted_by is not null;

create index if not exists app_admins_created_by_idx
  on public.app_admins (created_by)
  where created_by is not null;

create index if not exists entry_comments_moderated_by_idx
  on public.entry_comments (moderated_by)
  where moderated_by is not null;

create index if not exists entry_comments_user_id_idx
  on public.entry_comments (user_id);

create index if not exists entry_drafts_published_entry_id_idx
  on public.entry_drafts (published_entry_id)
  where published_entry_id is not null;

create index if not exists entry_likes_user_id_idx
  on public.entry_likes (user_id);

create index if not exists entry_participants_invited_by_idx
  on public.entry_participants (invited_by)
  where invited_by is not null;

create index if not exists entry_tags_added_by_idx
  on public.entry_tags (added_by)
  where added_by is not null;

create index if not exists feature_flag_overrides_created_by_idx
  on public.feature_flag_overrides (created_by)
  where created_by is not null;

create index if not exists group_invitations_inviter_id_idx
  on public.group_invitations (inviter_id);

create index if not exists groups_archived_by_idx
  on public.groups (archived_by)
  where archived_by is not null;

create index if not exists map_entries_moderated_by_idx
  on public.map_entries (moderated_by)
  where moderated_by is not null;

create index if not exists moderation_audit_logs_admin_user_id_idx
  on public.moderation_audit_logs (admin_user_id)
  where admin_user_id is not null;

create index if not exists moderation_audit_logs_report_id_idx
  on public.moderation_audit_logs (report_id)
  where report_id is not null;

create index if not exists notification_email_outbox_actor_id_idx
  on public.notification_email_outbox (actor_id)
  where actor_id is not null;

create index if not exists notifications_actor_id_idx
  on public.notifications (actor_id)
  where actor_id is not null;

create index if not exists reports_reviewed_by_idx
  on public.reports (reviewed_by)
  where reviewed_by is not null;

create index if not exists story_routes_archived_by_idx
  on public.story_routes (archived_by)
  where archived_by is not null;

create index if not exists story_routes_featured_by_idx
  on public.story_routes (featured_by)
  where featured_by is not null;

create index if not exists story_routes_moderated_by_idx
  on public.story_routes (moderated_by)
  where moderated_by is not null;

create index if not exists tags_created_by_idx
  on public.tags (created_by)
  where created_by is not null;

create index if not exists user_experience_preferences_first_story_id_idx
  on public.user_experience_preferences (first_story_id)
  where first_story_id is not null;

notify pgrst, 'reload schema';

-- ============================================================
-- AUTH PROFILE BACKFILL
-- ============================================================
-- drop schema public cascade 会保留 auth.users，但会重建 profiles。
-- 这里为已有登录账户补建公开资料。有效且唯一的 metadata 昵称保持不变；
-- 无效昵称使用匿名稳定名称，重复昵称追加 UUID 前八位。

with profile_candidates as (
  select
    auth_user.id,
    auth_user.created_at,
    case
      when char_length(
        public.format_display_name(
          auth_user.raw_user_meta_data ->> 'display_name'
        )
      ) between 1 and 80
      then public.format_display_name(
        auth_user.raw_user_meta_data ->> 'display_name'
      )
      else
        '地图旅人-' ||
        left(replace(auth_user.id::text, '-', ''), 8)
    end as base_display_name
  from auth.users as auth_user
),
ranked_profiles as (
  select
    candidate.*,
    row_number() over (
      partition by public.normalize_display_name(
        candidate.base_display_name
      )
      order by candidate.created_at asc, candidate.id asc
    ) as duplicate_rank
  from profile_candidates as candidate
),
profiles_to_restore as (
  select
    ranked.id,
    ranked.created_at,
    case
      when ranked.duplicate_rank = 1 then ranked.base_display_name
      else
        left(ranked.base_display_name, 71) ||
        '-' ||
        left(replace(ranked.id::text, '-', ''), 8)
    end as display_name
  from ranked_profiles as ranked
)
insert into public.profiles (
  id,
  username,
  display_name,
  created_at,
  updated_at
)
select
  restored.id,
  'traveler-' || replace(restored.id::text, '-', ''),
  restored.display_name,
  coalesce(restored.created_at, now()),
  now()
from profiles_to_restore as restored
on conflict (id) do nothing;

do $$
begin
  if exists (
    select 1
    from auth.users as auth_user
    left join public.profiles as profile
      on profile.id = auth_user.id
    where profile.id is null
  ) then
    raise exception using
      errcode = '55000',
      message = 'one or more auth users could not be restored to public.profiles';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;

-- 最终摘要；SQL Editor 应显示所有对象存在，并给出保留的登录账户数量。
select
  to_regclass('public.profiles') is not null as profiles_ready,
  to_regclass('public.map_entries') is not null as map_entries_ready,
  to_regclass('public.groups') is not null as groups_ready,
  to_regclass('public.story_routes') is not null as story_routes_ready,
  to_regclass('public.entry_participants') is not null as entry_participants_ready,
  to_regclass('public.tags') is not null as tags_ready,
  to_regclass('public.entry_drafts') is not null as entry_drafts_ready,
  to_regclass('public.account_deletion_requests') is not null as account_deletion_requests_ready,
  to_regclass('public.notifications') is not null as notifications_ready,
  to_regclass('public.notification_preferences') is not null as notification_preferences_ready,
  to_regclass('public.entry_media_assets') is not null as entry_media_assets_ready,
  to_regclass('public.media_cleanup_queue') is not null as media_cleanup_queue_ready,
  to_regclass('public.app_admins') is not null as app_admins_ready,
  to_regclass('public.moderation_audit_logs') is not null as moderation_audit_logs_ready,
  to_regclass('public.product_events') is not null as product_events_ready,
  to_regclass('public.plans') is not null as plans_ready,
  to_regclass('public.plan_entitlements') is not null as plan_entitlements_ready,
  to_regclass('public.user_subscriptions') is not null as user_subscriptions_ready,
  to_regclass('public.product_feedback') is not null as product_feedback_ready,
  to_regclass('public.feature_flags') is not null as feature_flags_ready,
  to_regclass('public.feature_flag_overrides') is not null as feature_flag_overrides_ready,
  (
    select count(*)::integer
    from public.profiles
  ) as restored_profile_count;
