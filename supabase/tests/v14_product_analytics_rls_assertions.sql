-- Run only against a disposable local Supabase database after all migrations.
-- Verifies pseudonymous ingestion, no raw browser reads and admin-only metrics.
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
  if to_regclass('public.product_events') is null
    or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.product_events'::regclass)
  then
    raise exception 'product_events table or RLS is missing';
  end if;
  if not pg_catalog.has_function_privilege(
      'anon', 'public.track_product_event(uuid,uuid,text,jsonb)', 'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'authenticated', 'public.track_product_event(uuid,uuid,text,jsonb)', 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'anon', 'public.admin_get_product_analytics(timestamptz,timestamptz)', 'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'authenticated', 'public.admin_get_product_analytics(timestamptz,timestamptz)', 'EXECUTE'
    )
  then
    raise exception 'analytics RPC grants are invalid';
  end if;
  if pg_catalog.has_table_privilege('anon', 'public.product_events', 'SELECT')
    or pg_catalog.has_table_privilege('authenticated', 'public.product_events', 'SELECT')
    or pg_catalog.has_table_privilege('anon', 'public.product_events', 'INSERT')
    or pg_catalog.has_table_privilege('authenticated', 'public.product_events', 'INSERT')
  then
    raise exception 'raw event table privileges are too broad';
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
  'a1500000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'analytics-a@example.invalid', crypt('test-password-a', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"分析测试 A"}',
  now() - interval '10 days', now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'c1500000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
  'analytics-admin@example.invalid', crypt('test-password-c', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"分析管理员 C"}',
  now() - interval '10 days', now(), '', '', '', ''
);

insert into public.app_admins (user_id)
values ('c1500000-0000-4000-8000-000000000003');

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select public.track_product_event(
  'a1510000-0000-4000-8000-000000000011',
  'a1520000-0000-4000-8000-000000000012',
  'explore_opened',
  '{"source":"explore-page"}'::jsonb
);

reset role;
select pg_temp.assert_true(
  (select user_id is null from public.product_events where id = 'a1510000-0000-4000-8000-000000000011'),
  'anonymous event must not have a user id'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.track_product_event(
  'a1530000-0000-4000-8000-000000000013',
  'a1520000-0000-4000-8000-000000000012',
  'session_started',
  '{"source":"auth-provider"}'::jsonb
);

reset role;
select pg_temp.assert_true(
  (select user_id = 'a1500000-0000-4000-8000-000000000001'
   from public.product_events where id = 'a1530000-0000-4000-8000-000000000013'),
  'authenticated event must derive user id from auth.uid'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.track_product_event(
      'a1540000-0000-4000-8000-000000000014',
      'a1520000-0000-4000-8000-000000000012',
      'search_used',
      '{"query":"private search term"}'::jsonb
    );
    raise exception 'unsafe analytics payload unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.admin_get_product_analytics(now() - interval '30 days', now());
    raise exception 'non-admin unexpectedly read aggregate analytics';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1500000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select pg_temp.assert_true(
  jsonb_typeof(public.admin_get_product_analytics(now() - interval '30 days', now())) = 'object',
  'admin aggregate analytics must return an object'
);

rollback;
