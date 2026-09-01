-- Run only against a disposable local Supabase database after all migrations.
-- This script is transactional and rolls back all users and notifications.

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
declare
  protected_function text;
begin
  if to_regclass('public.notifications') is null
    or to_regclass('public.notification_preferences') is null
    or to_regclass('public.notification_email_outbox') is null
  then
    raise exception 'notification tables are missing';
  end if;

  if not (
    select relrowsecurity from pg_catalog.pg_class
    where oid = 'public.notifications'::regclass
  ) or not (
    select relrowsecurity from pg_catalog.pg_class
    where oid = 'public.notification_preferences'::regclass
  ) or not (
    select relrowsecurity from pg_catalog.pg_class
    where oid = 'public.notification_email_outbox'::regclass
  ) then
    raise exception 'all notification tables must have RLS enabled';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.notifications', 'SELECT')
    or pg_catalog.has_table_privilege('authenticated', 'public.notifications', 'INSERT')
    or pg_catalog.has_table_privilege('authenticated', 'public.notifications', 'UPDATE')
    or pg_catalog.has_table_privilege('authenticated', 'public.notification_email_outbox', 'SELECT')
  then
    raise exception 'browser notification table privileges are too broad';
  end if;

  foreach protected_function in array array[
    'public.sync_due_time_capsule_notifications(integer)',
    'public.claim_notification_email_outbox(integer)',
    'public.finish_notification_email_outbox(uuid,boolean,text)'
  ]
  loop
    if pg_catalog.has_function_privilege('anon', protected_function, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated', protected_function, 'EXECUTE')
    then
      raise exception 'browser role can execute service-only function %', protected_function;
    end if;
    if not pg_catalog.has_function_privilege('service_role', protected_function, 'EXECUTE') then
      raise exception 'service_role cannot execute function %', protected_function;
    end if;
  end loop;
end;
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
(
  '00000000-0000-0000-0000-000000000000',
  '91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'notifications-a@example.invalid', crypt('test-password-a', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"通知测试 A"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '92000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'notifications-b@example.invalid', crypt('test-password-b', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"通知测试 B"}',
  now(), now(), '', '', '', ''
);

insert into public.notifications (
  id, user_id, type, category, payload, dedupe_key
) values
(
  '93000000-0000-4000-8000-000000000003',
  '91000000-0000-4000-8000-000000000001',
  'product_update', 'product_updates', '{}', 'assertion-a'
),
(
  '94000000-0000-4000-8000-000000000004',
  '92000000-0000-4000-8000-000000000002',
  'product_update', 'product_updates', '{}', 'assertion-b'
);

set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $$
begin
  begin
    perform count(*) from public.notifications;
    raise exception 'anon unexpectedly read notifications';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  (select count(*) = 1 from public.notifications),
  'A must read exactly one own notification'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.notifications
    where user_id = '92000000-0000-4000-8000-000000000002'
  ),
  'A must not read B notifications'
);

do $$
begin
  begin
    update public.notifications
    set read_at = now()
    where id = '93000000-0000-4000-8000-000000000003';
    raise exception 'authenticated role unexpectedly updated notification directly';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select public.mark_notification_read('93000000-0000-4000-8000-000000000003');
select pg_temp.assert_true(
  exists (
    select 1 from public.notifications
    where id = '93000000-0000-4000-8000-000000000003'
      and read_at is not null
  ),
  'A must mark own notification as read through RPC'
);

do $$
begin
  begin
    perform public.mark_notification_read('94000000-0000-4000-8000-000000000004');
    raise exception 'A marked B notification as read';
  exception when no_data_found then
    null;
  end;
end;
$$;

do $$
begin
  begin
    perform public.set_notification_preference('security', 'off');
    raise exception 'security preference must reject off';
  exception when check_violation then
    null;
  end;
end;
$$;

select public.set_notification_preference('collaboration', 'email');

reset role;
select private.enqueue_user_notification(
  '91000000-0000-4000-8000-000000000001',
  'entry_invitation_received',
  'collaboration',
  null,
  'entry',
  '95000000-0000-4000-8000-000000000005',
  '{"entry_title":"安全摘要"}',
  'assertion-email'
);

select pg_temp.assert_true(
  exists (
    select 1 from public.notification_email_outbox
    where user_id = '91000000-0000-4000-8000-000000000001'
      and status = 'pending'
      and sent_at is null
  ),
  'email preference must queue pending outbox without claiming delivery'
);

rollback;
