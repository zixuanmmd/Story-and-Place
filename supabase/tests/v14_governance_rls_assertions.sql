-- Run only against a disposable local Supabase database after all migrations.
-- Verifies admin isolation, public-only moderation access and account restrictions.
\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition, false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.app_admins') is null
    or to_regclass('public.account_moderation') is null
    or to_regclass('public.moderation_audit_logs') is null
  then
    raise exception 'governance tables are missing';
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.app_admins'::regclass)
    or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.account_moderation'::regclass)
    or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.moderation_audit_logs'::regclass)
  then
    raise exception 'governance tables must have RLS enabled';
  end if;
  if not pg_catalog.has_function_privilege('anon', 'public.is_app_admin()', 'EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated', 'public.is_app_admin()', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.admin_get_dashboard()', 'EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated', 'public.admin_get_dashboard()', 'EXECUTE')
  then
    raise exception 'admin helper or RPC grants are invalid';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.app_admins', 'INSERT')
    or pg_catalog.has_table_privilege('authenticated', 'public.account_moderation', 'UPDATE')
    or pg_catalog.has_table_privilege('authenticated', 'public.moderation_audit_logs', 'INSERT')
  then
    raise exception 'browser governance table privileges are too broad';
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
  'a1400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'governance-a@example.invalid', crypt('test-password-a', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"治理测试 A"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'b1400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'governance-b@example.invalid', crypt('test-password-b', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"治理测试 B"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'c1400000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
  'governance-admin@example.invalid', crypt('test-password-c', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"治理管理员 C"}',
  now(), now(), '', '', '', ''
);

insert into public.app_admins (user_id)
values ('c1400000-0000-4000-8000-000000000003');

insert into public.map_entries (
  id, user_id, title, content, latitude, longitude,
  time_precision, time_label, visibility
) values
('a1410000-0000-4000-8000-000000000011', 'a1400000-0000-4000-8000-000000000001', 'A 公开故事', '公开正文', 30, 104, 'approximate', '曾经', 'public'),
('a1420000-0000-4000-8000-000000000012', 'a1400000-0000-4000-8000-000000000001', 'A 私密故事', '私密正文', 30, 104, 'approximate', '曾经', 'private'),
('b1410000-0000-4000-8000-000000000013', 'b1400000-0000-4000-8000-000000000002', 'B 公开故事', '公开正文', 30, 104, 'approximate', '曾经', 'public');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1400000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.assert_true(not public.is_app_admin(), 'A must not be an admin');
select pg_temp.assert_true((select count(*) = 0 from public.app_admins), 'A must not enumerate admins');
do $$
begin
  begin
    perform public.admin_get_dashboard();
    raise exception 'A unexpectedly opened admin dashboard';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1400000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select pg_temp.assert_true(public.is_app_admin(), 'C must be an admin');
select pg_temp.assert_true((public.admin_get_dashboard() ->> 'total_users')::integer >= 3, 'admin dashboard must return aggregate counts');
select pg_temp.assert_true(
  not exists (select 1 from public.map_entries where id = 'a1420000-0000-4000-8000-000000000012'),
  'admin must not read another user private story'
);
select public.admin_moderate_entry(
  'a1410000-0000-4000-8000-000000000011', 'restricted', '测试限制'
);
select pg_temp.assert_true(
  exists (select 1 from public.map_entries where id = 'a1410000-0000-4000-8000-000000000011' and moderation_status = 'restricted'),
  'admin must retain public moderation visibility'
);
select pg_temp.assert_true(
  exists (select 1 from public.moderation_audit_logs where target_id = 'a1410000-0000-4000-8000-000000000011'),
  'moderation action must be audited'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert_true(
  not exists (select 1 from public.map_entries where id = 'a1410000-0000-4000-8000-000000000011'),
  'anonymous must not read restricted public story'
);
select pg_temp.assert_true(
  exists (select 1 from public.map_entries where id = 'b1410000-0000-4000-8000-000000000013'),
  'anonymous must still read active public story'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1400000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.assert_true(
  exists (select 1 from public.map_entries where id = 'a1410000-0000-4000-8000-000000000011'),
  'owner must retain access to own moderated story'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1400000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select public.admin_set_account_restriction(
  'b1400000-0000-4000-8000-000000000002', true, '测试账号限制'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert_true(
  not exists (select 1 from public.profiles where id = 'b1400000-0000-4000-8000-000000000002'),
  'restricted profile must disappear from public reads'
);
select pg_temp.assert_true(
  not exists (select 1 from public.map_entries where id = 'b1410000-0000-4000-8000-000000000013'),
  'restricted account public story must disappear'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1400000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select pg_temp.assert_true(
  exists (select 1 from public.profiles where id = 'b1400000-0000-4000-8000-000000000002'),
  'restricted user must retain own settings profile read'
);
do $$
begin
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason)
    values (
      'b1400000-0000-4000-8000-000000000002',
      'entry', 'a1410000-0000-4000-8000-000000000011', 'spam'
    );
    raise exception 'restricted account unexpectedly created UGC';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
