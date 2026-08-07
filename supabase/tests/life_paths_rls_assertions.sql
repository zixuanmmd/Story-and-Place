-- Life Path public-boundary and username assertions.
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
  'b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'life-path-a@example.invalid', crypt('life-path-a', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Life Path A"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'b2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'life-path-b@example.invalid', crypt('life-path-b', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Life Path B"}',
  now(), now(), '', '', '', ''
);

select pg_temp.assert_true(
  (select username = 'traveler-' || replace(id::text, '-', '')
   from public.profiles
   where id = 'b1000000-0000-4000-8000-000000000001'),
  'new auth profile must receive a database-generated stable username'
);

insert into public.map_entries (
  id, user_id, title, content, latitude, longitude,
  occurred_year, time_precision, time_label, visibility, unlock_at
) values
(
  'b3000000-0000-4000-8000-000000000003',
  'b1000000-0000-4000-8000-000000000001',
  '成都公开故事', '公开且已解锁', 30.67, 104.06,
  2012, 'year', '2012 年', 'public', null
),
(
  'b4000000-0000-4000-8000-000000000004',
  'b1000000-0000-4000-8000-000000000001',
  '北京公开故事', '公开且已解锁', 39.90, 116.40,
  2024, 'year', '2024 年', 'public', null
),
(
  'b5000000-0000-4000-8000-000000000005',
  'b1000000-0000-4000-8000-000000000001',
  '未来公开胶囊', '解锁前不得进入人生轨迹', 31.23, 121.47,
  2035, 'year', '2035 年', 'public', now() + interval '30 days'
),
(
  'b6000000-0000-4000-8000-000000000006',
  'b1000000-0000-4000-8000-000000000001',
  '私密故事', '不得进入人生轨迹', 29.56, 106.55,
  2018, 'year', '2018 年', 'private', null
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);

select pg_temp.assert_true(
  exists (
    select 1
    from public.resolve_public_profile(
      'traveler-b1000000000040008000000000000001'
    )
    where id = 'b1000000-0000-4000-8000-000000000001'
  ),
  'anonymous visitor must resolve a profile by public username'
);
select pg_temp.assert_true(
  (select count(*) = 2
   from public.get_public_life_path_entries(
     'b1000000-0000-4000-8000-000000000001', 0, 201
   )),
  'anonymous Life Path must include only unlocked public entries'
);
select pg_temp.assert_true(
  (select array_agg(occurred_year order by occurred_year)
     = array[2012, 2024]
   from public.get_public_life_path_entries(
     'b1000000-0000-4000-8000-000000000001', 0, 201
   )),
  'Life Path must retain chronological public ordering'
);
select pg_temp.assert_true(
  exists (
    select 1
    from public.get_public_life_path_summary(
      'b1000000-0000-4000-8000-000000000001'
    ) summary
    where summary.public_story_count = 2
      and summary.earliest_year = 2012
      and summary.latest_year = 2024
      and summary.distinct_place_count = 2
  ),
  'public summary must not count private or future entries'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  (select count(*) = 2
   from public.get_public_life_path_entries(
     'b1000000-0000-4000-8000-000000000001', 0, 201
   )),
  'even the owner public Life Path must exclude private and future entries'
);

do $$
begin
  begin
    update public.profiles
    set username = 'forged-handle'
    where id = 'b1000000-0000-4000-8000-000000000001';
    raise exception 'ASSERTION FAILED: client updated database-controlled username';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 2
   from public.get_public_life_path_entries(
     'b1000000-0000-4000-8000-000000000001', 0, 201
   )),
  'ordinary authenticated users must see the same public-only Life Path'
);

rollback;

