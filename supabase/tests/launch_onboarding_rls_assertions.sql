-- v1.2 onboarding preference RLS and RPC assertions.
-- Run only in a disposable local Supabase database after all migrations.

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
  'c1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'onboarding-a@example.invalid', crypt('onboarding-a', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"引导测试 A"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'c2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'onboarding-b@example.invalid', crypt('onboarding-b', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"引导测试 B"}',
  now(), now(), '', '', '', ''
);

insert into public.map_entries (
  id, user_id, title, content, latitude, longitude,
  occurred_year, time_precision, time_label, visibility
) values (
  'c3000000-0000-4000-8000-000000000003',
  'c1000000-0000-4000-8000-000000000001',
  '第一个故事', '只用于完成引导', 30.67, 104.06,
  2026, 'year', '2026 年', 'private'
);

insert into public.entry_participants (
  entry_id, user_id, invited_by, status, editable_fields, responded_at
) values (
  'c3000000-0000-4000-8000-000000000003',
  'c2000000-0000-4000-8000-000000000002',
  'c1000000-0000-4000-8000-000000000001',
  'accepted', array['content'], now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.set_onboarding_preferences(array['life', 'travel'], 'save');
select pg_temp.assert_true(
  exists (
    select 1 from public.user_experience_preferences
    where user_id = 'c1000000-0000-4000-8000-000000000001'
      and onboarding_status = 'pending'
      and interests = array['life', 'travel']
  ),
  'A must read the preferences A saved through the RPC'
);
select public.complete_onboarding('c3000000-0000-4000-8000-000000000003');
select pg_temp.assert_true(
  exists (
    select 1 from public.user_experience_preferences
    where onboarding_status = 'completed'
      and first_story_id = 'c3000000-0000-4000-8000-000000000003'
  ),
  'A must complete onboarding with an A-owned story'
);

do $$
begin
  begin
    insert into public.user_experience_preferences(user_id)
    values ('c1000000-0000-4000-8000-000000000001');
    raise exception 'ASSERTION FAILED: direct preference insert succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c2000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.user_experience_preferences
    where user_id = 'c1000000-0000-4000-8000-000000000001'
  ),
  'B must not read A onboarding preferences'
);

do $$
begin
  begin
    perform public.complete_onboarding('c3000000-0000-4000-8000-000000000003');
    raise exception 'ASSERTION FAILED: accepted collaborator completed onboarding with owner story';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.user_experience_preferences', 'SELECT'),
  'anonymous users must not have onboarding preference table access'
);

rollback;
