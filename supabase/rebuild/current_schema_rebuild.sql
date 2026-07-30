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
  display_name,
  created_at,
  updated_at
)
select
  restored.id,
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
  (
    select count(*)::integer
    from public.profiles
  ) as restored_profile_count;
