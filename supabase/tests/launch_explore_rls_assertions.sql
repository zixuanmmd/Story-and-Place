-- Public Explore privacy, category and keyset assertions.
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
  'explore-a@example.invalid', crypt('explore-a', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Explore A"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'c2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'explore-b@example.invalid', crypt('explore-b', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Explore B"}',
  now(), now(), '', '', '', ''
);

insert into public.map_entries (
  id, user_id, title, content, latitude, longitude,
  occurred_year, time_precision, time_label, visibility, unlock_at, created_at
) values
(
  'c3000000-0000-4000-8000-000000000003',
  'c1000000-0000-4000-8000-000000000001',
  '公开旅行', '匿名探索页可以读取', 30, 104,
  2025, 'year', '2025 年', 'public', null, now() - interval '1 minute'
),
(
  'c4000000-0000-4000-8000-000000000004',
  'c1000000-0000-4000-8000-000000000001',
  '公开文学', '匿名探索页可以读取', 31, 105,
  2024, 'year', '2024 年', 'public', null, now() - interval '2 minutes'
),
(
  'c5000000-0000-4000-8000-000000000005',
  'c1000000-0000-4000-8000-000000000001',
  '私密旅行', '任何探索调用都不能读取', 32, 106,
  2023, 'year', '2023 年', 'private', null, now() - interval '3 minutes'
),
(
  'c6000000-0000-4000-8000-000000000006',
  'c1000000-0000-4000-8000-000000000001',
  '未来公开旅行', '解锁前不能进入探索页', 33, 107,
  2035, 'year', '2035 年', 'public', now() + interval '30 days', now()
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.set_entry_tags(
  'c3000000-0000-4000-8000-000000000003', array['旅行']
);
select public.set_entry_tags(
  'c4000000-0000-4000-8000-000000000004', array['文学地图']
);
select public.set_entry_tags(
  'c5000000-0000-4000-8000-000000000005', array['旅行']
);
select public.set_entry_tags(
  'c6000000-0000-4000-8000-000000000006', array['旅行']
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);

select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.get_public_explore_entries('all', null, null, 21) entry
    where entry.id in (
      'c3000000-0000-4000-8000-000000000003',
      'c4000000-0000-4000-8000-000000000004',
      'c5000000-0000-4000-8000-000000000005',
      'c6000000-0000-4000-8000-000000000006'
    )
  ),
  'anonymous Explore must return unlocked public entries only'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.get_public_explore_entries('travel', null, null, 21) entry
    where entry.id in (
      'c3000000-0000-4000-8000-000000000003',
      'c4000000-0000-4000-8000-000000000004',
      'c5000000-0000-4000-8000-000000000005',
      'c6000000-0000-4000-8000-000000000006'
    )
  ),
  'travel lens must return only the tagged unlocked public entry'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.get_public_explore_entries('literature', null, null, 21) entry
    where entry.id in (
      'c3000000-0000-4000-8000-000000000003',
      'c4000000-0000-4000-8000-000000000004',
      'c5000000-0000-4000-8000-000000000005',
      'c6000000-0000-4000-8000-000000000006'
    )
  ),
  'literature lens must use its controlled tag vocabulary'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.get_public_explore_entries('unknown', null, null, 21)),
  'unknown category must not broaden discovery'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.get_public_explore_entries(
      'all',
      (select created_at from public.map_entries where id = 'c3000000-0000-4000-8000-000000000003'),
      'c3000000-0000-4000-8000-000000000003', 21
    ) entry
    where entry.id in (
      'c3000000-0000-4000-8000-000000000003',
      'c4000000-0000-4000-8000-000000000004',
      'c5000000-0000-4000-8000-000000000005',
      'c6000000-0000-4000-8000-000000000006'
    )
  ),
  'keyset cursor must return only older public entries'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.get_public_explore_entries('all', null, null, 21) entry
    where entry.id in (
      'c3000000-0000-4000-8000-000000000003',
      'c4000000-0000-4000-8000-000000000004',
      'c5000000-0000-4000-8000-000000000005',
      'c6000000-0000-4000-8000-000000000006'
    )
  ),
  'owner Explore must still exclude owner private and future entries'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c2000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.get_public_explore_entries('all', null, null, 21) entry
    where entry.id in (
      'c3000000-0000-4000-8000-000000000003',
      'c4000000-0000-4000-8000-000000000004',
      'c5000000-0000-4000-8000-000000000005',
      'c6000000-0000-4000-8000-000000000006'
    )
  ),
  'ordinary authenticated users must see the same public-only discovery set'
);

rollback;
