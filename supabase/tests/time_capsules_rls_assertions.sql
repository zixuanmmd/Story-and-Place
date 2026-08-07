-- Time Capsule RLS, RPC, social-feed and route privacy assertions.
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
  'a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'capsule-a@example.invalid', crypt('capsule-a', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"胶囊测试 A"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'a2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'capsule-b@example.invalid', crypt('capsule-b', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"胶囊测试 B"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'a3000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
  'capsule-c@example.invalid', crypt('capsule-c', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"胶囊测试 C"}',
  now(), now(), '', '', '', ''
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  (
    select unlock_at > now()
    from public.create_entry_v11(
      jsonb_build_object(
        'title', 'RPC 创建未来胶囊',
        'content', '验证 owner-only 写入边界',
        'latitude', 30,
        'longitude', 120,
        'occurred_year', 2026,
        'time_precision', 'year',
        'time_label', '2026 年',
        'visibility', 'private',
        'group_id', null,
        'place_category_slug', 'other',
        'allow_comments', true,
        'unlock_at', (now() + interval '30 days')::text
      ),
      '{}'::text[]
    )
  ),
  'v11 create RPC must persist a future unlock instant'
);

do $$
begin
  begin
    perform public.create_entry_v11(
      jsonb_build_object(
        'title', '非法过去胶囊',
        'content', '不应创建',
        'latitude', 30,
        'longitude', 120,
        'occurred_year', 2026,
        'time_precision', 'year',
        'time_label', '2026 年',
        'visibility', 'private',
        'group_id', null,
        'place_category_slug', 'other',
        'allow_comments', true,
        'unlock_at', (now() - interval '1 minute')::text
      ),
      '{}'::text[]
    );
    raise exception 'ASSERTION FAILED: past capsule was created';
  exception when check_violation then
    null;
  end;
end;
$$;

insert into public.map_entries (
  id, user_id, title, content, latitude, longitude,
  occurred_year, time_precision, time_label, visibility, unlock_at
) values
(
  'a4000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000001',
  '未来的公开故事', '解锁前不得泄露', 31, 121,
  2035, 'year', '2035 年', 'public', now() + interval '30 days'
),
(
  'a5000000-0000-4000-8000-000000000005',
  'a1000000-0000-4000-8000-000000000001',
  '普通公开故事', '用于路线测试', 32, 122,
  2026, 'year', '2026 年', 'public', null
);

select public.set_entry_tags(
  'a4000000-0000-4000-8000-000000000004',
  array['希望']
);
select public.invite_entry_participant(
  'a4000000-0000-4000-8000-000000000004',
  'a2000000-0000-4000-8000-000000000002',
  array['content']
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  exists (
    select 1 from public.map_entries
    where id = 'a4000000-0000-4000-8000-000000000004'
  ),
  'creator must read a future capsule'
);
select pg_temp.assert_true(
  exists (
    select 1 from public.get_social_feed_v11(null, null, 50)
    where id = 'a4000000-0000-4000-8000-000000000004'
  ),
  'creator feed may contain the creator future capsule'
);

do $$
begin
  begin
    update public.map_entries
    set unlock_at = now() + interval '60 days'
    where id = 'a4000000-0000-4000-8000-000000000004';
    raise exception 'ASSERTION FAILED: direct client unlock_at update succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

do $$
begin
  begin
    perform public.save_story_route(
      null,
      '不得公开未来节点',
      '',
      'public',
      null,
      true,
      jsonb_build_array(
        jsonb_build_object(
          'entry_id', 'a4000000-0000-4000-8000-000000000004',
          'position', 1,
          'note', ''
        ),
        jsonb_build_object(
          'entry_id', 'a5000000-0000-4000-8000-000000000005',
          'position', 2,
          'note', ''
        )
      )
    );
    raise exception 'ASSERTION FAILED: future capsule entered a public route';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
insert into public.follows (follower_id, following_id)
values (
  'a2000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000001'
);
select public.respond_entry_participant_invitation(
  'a4000000-0000-4000-8000-000000000004',
  true
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.map_entries
    where id = 'a4000000-0000-4000-8000-000000000004'
  ),
  'accepted participant must not read a future capsule'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.get_social_feed_v11(null, null, 50)
    where id = 'a4000000-0000-4000-8000-000000000004'
  ),
  'follower feed must not leak a future capsule'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.get_visible_tags('emotion', 0, 51)
    where semantic_key = 'hope'
  ),
  'future capsule tags must not leak to an accepted participant'
);

do $$
begin
  begin
    perform public.update_entry_v11(
      'a4000000-0000-4000-8000-000000000004',
      '{"content":"提前共同编辑"}'::jsonb,
      null
    );
    raise exception 'ASSERTION FAILED: participant edited a future capsule';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert_true(
  not exists (
    select 1 from public.map_entries
    where id = 'a4000000-0000-4000-8000-000000000004'
  ),
  'anonymous user must not read a future public capsule'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.get_public_emotion_entries('hope', 0, 51)
    where id = 'a4000000-0000-4000-8000-000000000004'
  ),
  'public emotion page must not leak a future capsule'
);

reset role;
update public.map_entries
set unlock_at = now() - interval '1 second'
where id = 'a4000000-0000-4000-8000-000000000004';

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert_true(
  exists (
    select 1 from public.map_entries
    where id = 'a4000000-0000-4000-8000-000000000004'
  ),
  'public capsule must become readable automatically after unlock'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  public.can_edit_entry_field(
    'a4000000-0000-4000-8000-000000000004',
    'content'
  ),
  'accepted participant delegated editing must resume after unlock'
);
select pg_temp.assert_true(
  public.can_interact_entry('a4000000-0000-4000-8000-000000000004'),
  'public capsule interactions must resume after unlock'
);

rollback;
