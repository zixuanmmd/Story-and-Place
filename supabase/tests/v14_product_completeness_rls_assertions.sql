-- Run only against a disposable local Supabase database after all migrations.
-- Verifies feedback isolation and identity-derived feature-flag evaluation.

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
  if to_regclass('public.product_feedback') is null
    or to_regclass('public.feature_flags') is null
    or to_regclass('public.feature_flag_overrides') is null
    or to_regprocedure('public.get_evaluated_feature_flags()') is null
  then
    raise exception 'product completeness objects are missing';
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.product_feedback'::regclass)
    or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.feature_flags'::regclass)
    or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.feature_flag_overrides'::regclass)
  then
    raise exception 'product completeness tables must have RLS enabled';
  end if;
  if pg_catalog.has_table_privilege('anon', 'public.product_feedback', 'SELECT')
    or pg_catalog.has_table_privilege('authenticated', 'public.product_feedback', 'INSERT')
    or pg_catalog.has_table_privilege('authenticated', 'public.feature_flags', 'SELECT')
    or pg_catalog.has_table_privilege('authenticated', 'public.feature_flag_overrides', 'SELECT')
  then
    raise exception 'browser table grants are too broad';
  end if;
  if not pg_catalog.has_function_privilege('anon', 'public.get_evaluated_feature_flags()', 'EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated', 'public.get_evaluated_feature_flags()', 'EXECUTE')
  then
    raise exception 'feature flag RPC grants are invalid';
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
  'a1470000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'completeness-a@example.invalid', crypt('test-password-a', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"完整性测试 A"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'b1470000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'completeness-b@example.invalid', crypt('test-password-b', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"完整性测试 B"}',
  now(), now(), '', '', '', ''
);

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert_true(
  (select count(*) = 4 and bool_and(not enabled) from public.get_evaluated_feature_flags()),
  'anonymous evaluation must hide all authenticated-only launch flags'
);

do $$
begin
  begin
    perform 1 from public.feature_flags;
    raise exception 'anonymous unexpectedly read raw feature flags';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1470000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select enabled from public.get_evaluated_feature_flags() where flag_key = 'media_upload'),
  'A must receive the globally enabled media flag'
);
select pg_temp.assert_true(
  not (select enabled from public.get_evaluated_feature_flags() where flag_key = 'subscriptions'),
  'A must not receive the disabled subscriptions flag before override'
);

do $$
begin
  begin
    insert into public.product_feedback (
      user_id, category, message, current_route, app_version
    ) values (
      'a1470000-0000-4000-8000-000000000001',
      'bug', 'forbidden direct write', '/', 'test'
    );
    raise exception 'authenticated browser unexpectedly inserted feedback directly';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
insert into public.feature_flag_overrides (
  flag_key, user_id, enabled, created_by
) values (
  'subscriptions',
  'a1470000-0000-4000-8000-000000000001',
  true,
  'a1470000-0000-4000-8000-000000000001'
);
insert into public.product_feedback (
  user_id, category, message, current_route, app_version
) values (
  'a1470000-0000-4000-8000-000000000001',
  'feature', '安全的反馈测试', '/help', 'test'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1470000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select enabled from public.get_evaluated_feature_flags() where flag_key = 'subscriptions'),
  'A override must enable subscriptions only for A'
);

do $$
begin
  begin
    perform 1 from public.product_feedback;
    raise exception 'A unexpectedly read product feedback rows';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b1470000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  not (select enabled from public.get_evaluated_feature_flags() where flag_key = 'subscriptions'),
  'B must not inherit A feature flag override'
);

rollback;
