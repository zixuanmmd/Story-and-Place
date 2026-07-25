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
