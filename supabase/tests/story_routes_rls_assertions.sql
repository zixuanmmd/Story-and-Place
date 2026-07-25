-- Run after all migrations in a disposable local Supabase database.
-- psql must stop on the first failed assertion:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/story_routes_rls_assertions.sql

begin;

do $$
begin
  assert to_regclass('public.story_routes') is not null,
    'story_routes table must exist';
  assert to_regclass('public.story_route_items') is not null,
    'story_route_items table must exist';
  assert to_regprocedure(
    'public.save_story_route(uuid,text,text,text,uuid,boolean,jsonb)'
  ) is not null, 'save_story_route RPC must exist';
  assert (
    select relrowsecurity
    from pg_class
    where oid = 'public.story_routes'::regclass
  ), 'story_routes RLS must be enabled';
  assert (
    select relrowsecurity
    from pg_class
    where oid = 'public.story_route_items'::regclass
  ), 'story_route_items RLS must be enabled';
  assert not has_table_privilege('anon', 'public.story_route_items', 'INSERT'),
    'anonymous users must not insert route nodes';
  assert not has_table_privilege('authenticated', 'public.story_route_items', 'INSERT'),
    'authenticated clients must use the save RPC';
  assert has_function_privilege(
    'authenticated',
    'public.save_story_route(uuid,text,text,text,uuid,boolean,jsonb)',
    'EXECUTE'
  ), 'authenticated users need the save RPC';
  assert not has_function_privilege(
    'anon',
    'public.save_story_route(uuid,text,text,text,uuid,boolean,jsonb)',
    'EXECUTE'
  ), 'anonymous users must not save routes';
end;
$$;

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
  '71000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'route-a@example.invalid', crypt('route-a', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"路线测试 A"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '72000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'route-b@example.invalid', crypt('route-b', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"路线测试 B"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '73000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
  'route-c@example.invalid', crypt('route-c', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"路线测试 C"}',
  now(), now(), '', '', '', ''
);

select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into public.groups (id, slug, name, visibility, created_by)
values (
  '74000000-0000-4000-8000-000000000004',
  'story-route-test-group',
  '路线测试群组',
  'public',
  '71000000-0000-4000-8000-000000000001'
);
insert into public.group_members (group_id, user_id, role, status, joined_at)
values (
  '74000000-0000-4000-8000-000000000004',
  '72000000-0000-4000-8000-000000000002',
  'admin',
  'active',
  now()
);

insert into public.map_entries (
  id, user_id, title, content, latitude, longitude,
  occurred_year, time_precision, time_label, visibility, group_id,
  place_category_slug
) values
(
  '75000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  '公开节点一', '公开内容一', 31, 121,
  2020, 'year', '2020 年', 'public', null, 'street'
),
(
  '75000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000001',
  '公开节点二', '公开内容二', 32, 122,
  2021, 'year', '2021 年', 'public', null, 'landmark'
),
(
  '75000000-0000-4000-8000-000000000003',
  '71000000-0000-4000-8000-000000000001',
  '私密节点', '不可泄露', 33, 123,
  2022, 'year', '2022 年', 'private', null, 'home'
),
(
  '75000000-0000-4000-8000-000000000004',
  '71000000-0000-4000-8000-000000000001',
  '群组节点一', '成员内容一', 34, 124,
  2023, 'year', '2023 年', 'group',
  '74000000-0000-4000-8000-000000000004', 'school'
),
(
  '75000000-0000-4000-8000-000000000005',
  '71000000-0000-4000-8000-000000000001',
  '群组节点二', '成员内容二', 35, 125,
  2024, 'year', '2024 年', 'group',
  '74000000-0000-4000-8000-000000000004', 'nature'
);

select public.save_story_route(
  null::uuid, '公开路线', '', 'public', null, true,
  '[
    {"entry_id":"75000000-0000-4000-8000-000000000001","position":1,"note":""},
    {"entry_id":"75000000-0000-4000-8000-000000000002","position":2,"note":""}
  ]'::jsonb
);
select public.save_story_route(
  null::uuid, '私密草稿', '', 'private', null, false,
  '[
    {"entry_id":"75000000-0000-4000-8000-000000000003","position":1,"note":""}
  ]'::jsonb
);
select public.save_story_route(
  null::uuid, '群组路线', '', 'group',
  '74000000-0000-4000-8000-000000000004', true,
  '[
    {"entry_id":"75000000-0000-4000-8000-000000000004","position":1,"note":""},
    {"entry_id":"75000000-0000-4000-8000-000000000005","position":2,"note":""}
  ]'::jsonb
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert_true(
  (select count(*) from public.story_routes) = 1,
  'anonymous users should read only the published public route'
);
select pg_temp.assert_true(
  (select count(*) from public.story_route_items) = 2,
  'anonymous users should read only public route nodes'
);
select pg_temp.assert_true(
  (select count(*) from public.get_timeline_entries(
    'user', '71000000-0000-4000-8000-000000000001',
    'asc', null, null, null, null, null, null, true, 0, 51
  )) = 2,
  'public user timeline must not return private or group records'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"72000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  exists (select 1 from public.story_routes where title = '群组路线'),
  'active member B should read the group route'
);
select pg_temp.assert_true(
  (select count(*) from public.get_timeline_entries(
    'group', '74000000-0000-4000-8000-000000000004',
    'asc', null, null, null, null, null, null, true, 0, 51
  )) = 2,
  'active member B should read the group timeline'
);
do $$
begin
  begin
    insert into public.story_route_items (route_id, entry_id, position)
    select id, '75000000-0000-4000-8000-000000000003', 3
    from public.story_routes where title = '群组路线';
    raise exception 'ASSERTION FAILED: direct route-node insert was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_story_route(
      (select id from public.story_routes where title = '群组路线'),
      '伪造修改', '', 'private', null, false,
      '[{"entry_id":"75000000-0000-4000-8000-000000000003","position":1,"note":""}]'
    );
    raise exception 'ASSERTION FAILED: group admin B edited A route body';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select public.leave_group('74000000-0000-4000-8000-000000000004');
select pg_temp.assert_true(
  not exists (select 1 from public.story_routes where title = '群组路线'),
  'B must lose group-route access immediately after leaving'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.story_route_items i
    join public.story_routes r on r.id = i.route_id
    where r.title = '群组路线'
  ),
  'B must lose group-route node access immediately after leaving'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"73000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  not exists (select 1 from public.story_routes where title in ('群组路线', '私密草稿')),
  'non-member C must not read private or group routes'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
update public.map_entries
set visibility = 'private'
where id = '75000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(
  exists (
    select 1 from public.story_routes
    where title = '公开路线'
      and visibility = 'private'
      and privacy_downgraded_at is not null
  ),
  'public route must automatically become private after a node is restricted'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert_true(
  not exists (select 1 from public.story_routes where title = '公开路线'),
  'downgraded public route must disappear from anonymous reads'
);

rollback;
