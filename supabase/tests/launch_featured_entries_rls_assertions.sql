-- Curated story privacy and write-boundary assertions.
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
) values (
  '00000000-0000-0000-0000-000000000000',
  'f1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'featured-a@example.invalid', crypt('featured-a', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Featured A"}',
  now(), now(), '', '', '', ''
);

insert into public.map_entries (
  id, user_id, title, content, latitude, longitude,
  occurred_year, time_precision, time_label, visibility, unlock_at, created_at
) values
(
  'f2000000-0000-4000-8000-000000000002',
  'f1000000-0000-4000-8000-000000000001',
  '可精选公开故事', '允许匿名读取', 30, 104,
  2025, 'year', '2025 年', 'public', null, now()
),
(
  'f3000000-0000-4000-8000-000000000003',
  'f1000000-0000-4000-8000-000000000001',
  '不能精选的私密故事', '不得进入精选', 31, 105,
  2025, 'year', '2025 年', 'private', null, now()
),
(
  'f4000000-0000-4000-8000-000000000004',
  'f1000000-0000-4000-8000-000000000001',
  '不能精选的未来胶囊', '解锁前不得进入精选', 32, 106,
  2035, 'year', '2035 年', 'public', now() + interval '30 days', now()
);

update public.map_entries
set featured_at = now()
where id in (
  'f2000000-0000-4000-8000-000000000002',
  'f3000000-0000-4000-8000-000000000003',
  'f4000000-0000-4000-8000-000000000004'
);

select pg_temp.assert_true(
  (select featured_at is not null from public.map_entries where id = 'f2000000-0000-4000-8000-000000000002'),
  'eligible public story should retain its curated state'
);
select pg_temp.assert_true(
  (select featured_at is null from public.map_entries where id = 'f3000000-0000-4000-8000-000000000003'),
  'private story must be automatically unfeatured'
);
select pg_temp.assert_true(
  (select featured_at is null from public.map_entries where id = 'f4000000-0000-4000-8000-000000000004'),
  'future capsule must be automatically unfeatured'
);

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert_true(
  (select count(*) = 1 from public.get_featured_public_entries(6)),
  'anonymous discovery must receive only eligible curated public stories'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  not has_column_privilege('authenticated', 'public.map_entries', 'featured_at', 'UPDATE'),
  'ordinary authenticated clients must not update featured_at'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.get_featured_public_entries(6)),
  'owner login must not broaden curated discovery to private or future stories'
);

rollback;
