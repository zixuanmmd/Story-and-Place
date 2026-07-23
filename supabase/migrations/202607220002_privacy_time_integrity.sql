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
