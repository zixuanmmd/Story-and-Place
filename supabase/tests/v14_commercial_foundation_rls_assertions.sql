-- Run only against a disposable local Supabase database after all migrations.
-- Verifies plan visibility, subscription isolation and entitlement quota writes.

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
  if to_regclass('public.plans') is null
    or to_regclass('public.plan_entitlements') is null
    or to_regclass('public.user_subscriptions') is null
    or to_regprocedure('public.get_my_commercial_access()') is null
  then
    raise exception 'commercial foundation objects are missing';
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.plans'::regclass)
    or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.plan_entitlements'::regclass)
    or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.user_subscriptions'::regclass)
  then
    raise exception 'commercial foundation tables must have RLS enabled';
  end if;
  if not pg_catalog.has_table_privilege('anon', 'public.plans', 'SELECT')
    or not pg_catalog.has_table_privilege('authenticated', 'public.plan_entitlements', 'SELECT')
    or pg_catalog.has_table_privilege('anon', 'public.user_subscriptions', 'SELECT')
    or pg_catalog.has_table_privilege('authenticated', 'public.user_subscriptions', 'INSERT')
    or pg_catalog.has_table_privilege('authenticated', 'public.user_subscriptions', 'UPDATE')
    or pg_catalog.has_table_privilege('authenticated', 'public.user_subscriptions', 'DELETE')
  then
    raise exception 'commercial table grants are invalid';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.get_my_commercial_access()', 'EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated', 'public.get_my_commercial_access()', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'private.resolve_user_plan_code(uuid)', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'private.get_integer_entitlement(uuid,text,bigint)', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'private.enforce_story_route_quota()', 'EXECUTE')
  then
    raise exception 'commercial function grants are invalid';
  end if;
end;
$$;

insert into public.plans (code, name, description, sort_order)
values ('test_low', 'Test Low', 'Disposable quota-test plan.', 999);

insert into public.plan_entitlements (
  plan_code, entitlement_key, value_type, boolean_value, integer_value
)
values
  ('test_low', 'can_upload_media', 'boolean', true, null),
  ('test_low', 'max_storage_bytes', 'integer', null, 1000000),
  ('test_low', 'max_media_files', 'integer', null, 1),
  ('test_low', 'max_story_routes', 'integer', null, 1),
  ('test_low', 'advanced_export', 'boolean', true, null);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
(
  '00000000-0000-0000-0000-000000000000',
  'a1400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'commercial-a@example.invalid', crypt('test-password-a', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"商业测试 A"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'b1400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'commercial-b@example.invalid', crypt('test-password-b', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"商业测试 B"}',
  now(), now(), '', '', '', ''
);

insert into public.user_subscriptions (
  user_id, plan_code, status, current_period_start, current_period_end
)
values (
  'a1400000-0000-4000-8000-000000000001',
  'test_low',
  'active',
  now(),
  now() + interval '30 days'
);

insert into public.map_entries (
  id, user_id, title, content, latitude, longitude,
  time_precision, time_label, visibility
) values (
  'e1400000-0000-4000-8000-000000000001',
  'a1400000-0000-4000-8000-000000000001',
  '配额测试故事', '不包含敏感测试数据', 30, 104,
  'approximate', '曾经', 'private'
);

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert_true(
  (select count(*) = 4 from public.plans),
  'anonymous must read only the four active plan catalog rows'
);

do $$
begin
  begin
    perform public.get_my_commercial_access();
    raise exception 'anonymous unexpectedly executed authenticated usage RPC';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1400000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.user_subscriptions),
  'A must read only A subscription'
);
select pg_temp.assert_true(
  (select plan_code = 'test_low' and max_story_routes = 1 from public.get_my_commercial_access()),
  'A usage RPC must resolve the entitlement-backed test plan'
);

do $$
begin
  begin
    update public.user_subscriptions
    set plan_code = 'creator'
    where user_id = 'a1400000-0000-4000-8000-000000000001';
    raise exception 'authenticated browser unexpectedly changed a subscription';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b1400000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.user_subscriptions),
  'B must not read A subscription'
);
select pg_temp.assert_true(
  (select plan_code = 'free' from public.get_my_commercial_access()),
  'B without a subscription must resolve to free entitlements'
);

reset role;
insert into public.story_routes (
  id, created_by, title, description, visibility
) values (
  'a1410000-0000-4000-8000-000000000001',
  'a1400000-0000-4000-8000-000000000001',
  '第一条配额路线', '', 'private'
);

do $$
begin
  begin
    insert into public.story_routes (
      id, created_by, title, description, visibility
    ) values (
      'a1420000-0000-4000-8000-000000000002',
      'a1400000-0000-4000-8000-000000000001',
      '第二条配额路线', '', 'private'
    );
    raise exception 'second active route unexpectedly exceeded quota';
  exception when check_violation then
    null;
  end;
end;
$$;

set local role service_role;
select public.reserve_entry_media_asset(
  'a1400000-0000-4000-8000-000000000001',
  'e1400000-0000-4000-8000-000000000001',
  'image/jpeg', 100, 50, 100, 100
);

do $$
begin
  begin
    perform public.reserve_entry_media_asset(
      'a1400000-0000-4000-8000-000000000001',
      'e1400000-0000-4000-8000-000000000001',
      'image/jpeg', 100, 50, 100, 100
    );
    raise exception 'second media reservation unexpectedly exceeded file quota';
  exception when check_violation then
    null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1400000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (
    select active_route_count = 1
      and media_file_count = 1
      and storage_bytes = 150
    from public.get_my_commercial_access()
  ),
  'usage RPC must report exact owned route and media usage'
);

rollback;
