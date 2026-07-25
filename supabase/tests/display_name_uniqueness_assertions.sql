-- 在已执行全部 migration 的本地 Supabase 测试库中运行：
-- psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
--   -f supabase/tests/display_name_uniqueness_assertions.sql

begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then
    raise exception 'assertion failed: %', message;
  end if;
end;
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
(
  '71000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'display-name-a@example.test', 'test',
  now(), '{"provider":"email","providers":["email"]}',
  '{"display_name":"  Zixuan   Story  "}', now(), now()
),
(
  '71000000-0000-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'display-name-b@example.test', 'test',
  now(), '{"provider":"email","providers":["email"]}',
  '{"display_name":"另一个昵称"}', now(), now()
);

select pg_temp.assert_true(
  (select display_name = 'Zixuan Story'
   from public.profiles
   where id = '71000000-0000-4000-8000-000000000001'),
  'registration trigger must store the canonical display name'
);

select pg_temp.assert_true(
  not public.is_display_name_available(' zixuan story '),
  'anonymous comparison must reject trim/case variants'
);

set local role authenticated;
set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000001';

select pg_temp.assert_true(
  public.is_display_name_available('ZIXUAN   STORY'),
  'current user must be able to retain their own normalized display name'
);

do $$
begin
  begin
    update public.profiles
    set display_name = 'zixuan story'
    where id = '71000000-0000-4000-8000-000000000002';
    raise exception 'expected unique_violation was not raised';
  exception
    when unique_violation then
      null;
  end;
end;
$$;

reset role;

select pg_temp.assert_true(
  not exists (
    select public.normalize_display_name(display_name)
    from public.profiles
    group by public.normalize_display_name(display_name)
    having count(*) > 1
  ),
  'normalized display names must remain unique'
);

rollback;
