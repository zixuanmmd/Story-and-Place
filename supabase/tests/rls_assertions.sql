-- 可执行 RLS/列权限断言。仅在本地 Supabase 测试数据库执行；整个脚本最终 rollback。
-- 运行：supabase db reset && psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_assertions.sql

begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition, false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'rls-a@example.invalid', crypt('test-password-a', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"测试用户 A"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'rls-b@example.invalid', crypt('test-password-b', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"测试用户 B"}',
  now(), now(), '', '', '', ''
);

insert into public.map_entries (
  id, user_id, title, content, latitude, longitude,
  occurred_year, time_precision, time_label, visibility
) values
(
  'a0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'A 公开', '公开内容', 30, 120, 2024, 'year', '2024 年', 'public'
),
(
  'a0000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'A 私密', '私密内容', 31, 121, 2024, 'year', '2024 年', 'private'
),
(
  'b0000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000002',
  'B 私密', '私密内容', 32, 122, 2024, 'year', '2024 年', 'private'
);

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.map_entries
    where id in (
      'a0000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000002',
      'b0000000-0000-4000-8000-000000000003'
    )
  ),
  '匿名用户必须只能读取 1 条公开记录'
);
select pg_temp.assert_true(
  not exists (select 1 from public.map_entries where visibility = 'private'),
  '匿名用户不得读取私密记录'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  exists (
    select 1 from public.map_entries
    where id = 'a0000000-0000-4000-8000-000000000002'
  ),
  'A 必须能读取自己的私密记录'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.map_entries
    where id = 'b0000000-0000-4000-8000-000000000003'
  ),
  'A 不得读取 B 的私密记录'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
declare affected integer;
begin
  update public.map_entries
  set title = 'B 不应能更新 A'
  where id = 'a0000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'ASSERTION FAILED: B 修改了 A 的记录'; end if;

  delete from public.map_entries
  where id = 'a0000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'ASSERTION FAILED: B 删除了 A 的记录'; end if;
end;
$$;

do $$
begin
  begin
    insert into public.map_entries (
      user_id, title, content, latitude, longitude,
      occurred_year, time_precision, time_label, visibility
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '伪造 A', '不应写入', 0, 0, 2026, 'year', '2026 年', 'private'
    );
    raise exception 'ASSERTION FAILED: B 伪造 A 的 user_id 成功';
  exception when insufficient_privilege or check_violation then
    null;
  end;
end;
$$;

do $$
begin
  begin
    update public.map_entries
    set created_at = now()
    where id = 'b0000000-0000-4000-8000-000000000003';
    raise exception 'ASSERTION FAILED: 作者修改了 created_at';
  exception when insufficient_privilege then
    null;
  end;

  begin
    update public.map_entries
    set user_id = '10000000-0000-4000-8000-000000000001'
    where id = 'b0000000-0000-4000-8000-000000000003';
    raise exception 'ASSERTION FAILED: 作者修改了 user_id';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

rollback;
