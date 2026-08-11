-- v1.3 global search permission and non-disclosure assertions.
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
  'd1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'search-a@example.invalid', crypt('search-a', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"搜索测试 A"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'd2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'search-b@example.invalid', crypt('search-b', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"搜索测试 B"}',
  now(), now(), '', '', '', ''
);

insert into public.map_entries (
  id, user_id, title, content, place_name, latitude, longitude,
  occurred_year, time_precision, time_label, visibility, unlock_at
) values
(
  'd3000000-0000-4000-8000-000000000003',
  'd1000000-0000-4000-8000-000000000001',
  '公开秘密地点', '匿名用户可以搜索的正文', '人民公园', 30.66, 104.06,
  2020, 'year', '2020 年', 'public', null
),
(
  'd4000000-0000-4000-8000-000000000004',
  'd1000000-0000-4000-8000-000000000001',
  '私密秘密地点', '只有作者可以搜索的正文', '家中', 30.67, 104.07,
  2021, 'year', '2021 年', 'private', null
),
(
  'd5000000-0000-4000-8000-000000000005',
  'd1000000-0000-4000-8000-000000000001',
  '未来秘密地点', '即使作者也不能通过搜索发现', '未来', 30.68, 104.08,
  2035, 'year', '2035 年', 'private', now() + interval '30 days'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.set_entry_tags(
  'd3000000-0000-4000-8000-000000000003', array['秘密地点']
);
select public.set_entry_tags(
  'd4000000-0000-4000-8000-000000000004', array['秘密地点']
);
select public.set_entry_tags(
  'd5000000-0000-4000-8000-000000000005', array['秘密地点']
);

reset role;
insert into public.story_routes (
  id, created_by, title, description, visibility, share_slug,
  published_at, node_count
) values (
  'd6000000-0000-4000-8000-000000000006',
  'd1000000-0000-4000-8000-000000000001',
  '未来路线秘密', '包含未解锁胶囊', 'private', 'future-search-route', null, 1
);
insert into public.story_route_items (
  id, route_id, entry_id, position, note
) values (
  'd7000000-0000-4000-8000-000000000007',
  'd6000000-0000-4000-8000-000000000006',
  'd5000000-0000-4000-8000-000000000005', 1, ''
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.search_story_and_place(
      '秘密', null, null, null, null, null, null,
      array['entry'], 0, 21
    )
  ),
  'anonymous search must return the unlocked public entry only'
);
select pg_temp.assert_true(
  (
    select subtitle = '1 个可见故事'
    from public.search_story_and_place(
      '秘密', null, null, null, null, null, null,
      array['tag'], 0, 21
    )
    where result_type = 'tag'
  ),
  'anonymous tag aggregation must not count private or future entries'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.search_story_and_place(
      '秘密', null, null, null, null, null, null,
      array['entry'], 0, 21
    )
  ),
  'owner search may return public and own private entries, but not a future capsule'
);
select pg_temp.assert_true(
  not exists (
    select 1
    from public.search_story_and_place(
      '未来路线', null, null, null, null, null, null,
      array['route'], 0, 21
    )
  ),
  'a route containing a future capsule must not enter global search'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d2000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.search_story_and_place(
      '秘密', null, null, null, null, null, null,
      array['entry'], 0, 21
    )
  ),
  'an unrelated authenticated user must not discover private or future entries'
);
select pg_temp.assert_true(
  (
    select max(total_count) = 1
    from public.search_story_and_place(
      '秘密', null, null, null, null, null, null,
      array['entry'], 0, 21
    )
  ),
  'visible result count must be computed after permission filtering'
);

rollback;
