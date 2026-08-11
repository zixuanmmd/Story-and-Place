-- 群组与社交 RLS 自动断言。只在本地/隔离测试数据库执行，最终 rollback。
-- 运行：
--   supabase db reset
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/groups_social_rls_assertions.sql

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
  '11000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'social-a@example.invalid', crypt('test-a', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"群组测试 A"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '22000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'social-b@example.invalid', crypt('test-b', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"群组测试 B"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '33000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
  'social-c@example.invalid', crypt('test-c', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"群组测试 C"}',
  now(), now(), '', '', '', ''
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into public.groups (id, slug, name, visibility, created_by) values
  ('41000000-0000-4000-8000-000000000001', 'rls-public-group', '公开测试群组', 'public', '11000000-0000-4000-8000-000000000001'),
  ('42000000-0000-4000-8000-000000000002', 'rls-private-group', '私密测试群组', 'private', '11000000-0000-4000-8000-000000000001');

insert into public.group_members (group_id, user_id, role, status, joined_at) values
  ('41000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000002', 'member', 'active', now());

insert into public.map_entries (
  id, user_id, title, content, latitude, longitude,
  occurred_year, time_precision, time_label, visibility, group_id, place_category_slug
) values
(
  '51000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  '群组记录', '只有成员可读', 30, 120,
  2026, 'year', '2026 年', 'group',
  '41000000-0000-4000-8000-000000000001', 'school'
),
(
  '52000000-0000-4000-8000-000000000002',
  '11000000-0000-4000-8000-000000000001',
  'A 私密记录', '关注也不可读', 31, 121,
  2026, 'year', '2026 年', 'private', null, 'home'
);

-- A repeated public-group join by the owner must be idempotent and must never
-- demote the only owner.
select public.join_public_group('41000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(
  exists (
    select 1
    from public.group_members
    where group_id = '41000000-0000-4000-8000-000000000001'
      and user_id = '11000000-0000-4000-8000-000000000001'
      and role = 'owner'
      and status = 'active'
  ),
  '群主重复加入公开群组后必须仍然是有效群主'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert_true(
  exists (select 1 from public.groups where id = '41000000-0000-4000-8000-000000000001'),
  '匿名用户应能读取公开群组基本资料'
);
select pg_temp.assert_true(
  not exists (select 1 from public.map_entries where id = '51000000-0000-4000-8000-000000000001'),
  '匿名用户不得读取群组记录'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  exists (select 1 from public.map_entries where id = '51000000-0000-4000-8000-000000000001'),
  '有效成员 B 应能读取群组记录'
);
insert into public.entry_likes (entry_id, user_id)
values ('51000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000002');
insert into public.entry_comments (entry_id, user_id, content)
values ('51000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000002', '成员评论');

do $$
begin
  begin
    insert into public.entry_likes (entry_id, user_id)
    values ('51000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000002');
    raise exception 'ASSERTION FAILED: 重复点赞被接受';
  exception when unique_violation then null;
  end;
  begin
    insert into public.entry_likes (entry_id, user_id)
    values ('52000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002');
    raise exception 'ASSERTION FAILED: private 记录被点赞';
  exception when insufficient_privilege or check_violation then null;
  end;
  begin
    update public.group_members set role = 'admin'
    where group_id = '41000000-0000-4000-8000-000000000001'
      and user_id = '22000000-0000-4000-8000-000000000002';
    raise exception 'ASSERTION FAILED: 普通成员直接修改了角色';
  exception when insufficient_privilege then null;
  end;
end;
$$;

insert into public.follows (follower_id, following_id)
values ('22000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(
  not exists (select 1 from public.map_entries where id = '52000000-0000-4000-8000-000000000002'),
  '关注关系不得授予私密记录访问权'
);

select public.leave_group('41000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(
  not exists (select 1 from public.map_entries where id = '51000000-0000-4000-8000-000000000001'),
  'B 退出后必须立即失去群组记录访问权'
);
select pg_temp.assert_true(
  not exists (select 1 from public.entry_likes where entry_id = '51000000-0000-4000-8000-000000000001'),
  'B 退出后不得继续读取群组点赞'
);
select pg_temp.assert_true(
  not exists (select 1 from public.entry_comments where entry_id = '51000000-0000-4000-8000-000000000001'),
  'B 退出后不得继续读取群组评论'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"33000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  not exists (select 1 from public.map_entries where id = '51000000-0000-4000-8000-000000000001'),
  '非成员 C 不得读取群组记录'
);
do $$
begin
  begin
    insert into public.follows (follower_id, following_id)
    values ('33000000-0000-4000-8000-000000000003', '33000000-0000-4000-8000-000000000003');
    raise exception 'ASSERTION FAILED: 用户关注了自己';
  exception when check_violation or insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.invite_group_member(
  '42000000-0000-4000-8000-000000000002',
  '22000000-0000-4000-8000-000000000002'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select public.respond_group_invitation(
  (select id from public.group_invitations where group_id = '42000000-0000-4000-8000-000000000002' and invitee_id = '22000000-0000-4000-8000-000000000002'),
  true
);
select pg_temp.assert_true(
  public.is_active_group_member('42000000-0000-4000-8000-000000000002'),
  'B 接受私密群组邀请后应成为有效成员'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.change_group_member_role(
  '42000000-0000-4000-8000-000000000002',
  '22000000-0000-4000-8000-000000000002',
  'admin'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
do $$
begin
  begin
    perform public.remove_group_member(
      '42000000-0000-4000-8000-000000000002',
      '11000000-0000-4000-8000-000000000001'
    );
    raise exception 'ASSERTION FAILED: admin 移除了 owner';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.transfer_group_ownership(
  '42000000-0000-4000-8000-000000000002',
  '22000000-0000-4000-8000-000000000002'
);
select pg_temp.assert_true(
  not public.is_group_owner('42000000-0000-4000-8000-000000000002'),
  '转移后 A 不再是 owner'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  public.is_group_owner('42000000-0000-4000-8000-000000000002'),
  '转移后 B 成为 owner'
);
update public.groups
set archived_at = now()
where id = '42000000-0000-4000-8000-000000000002';

do $$
begin
  begin
    insert into public.map_entries (
      user_id, title, content, latitude, longitude,
      occurred_year, time_precision, time_label, visibility, group_id
    ) values (
      '22000000-0000-4000-8000-000000000002',
      '归档后发布', '不应成功', 0, 0,
      2026, 'year', '2026 年', 'group',
      '42000000-0000-4000-8000-000000000002'
    );
    raise exception 'ASSERTION FAILED: 归档群组接受了新记录';
  exception when object_not_in_prerequisite_state or check_violation or insufficient_privilege then null;
  end;
end;
$$;

insert into public.reports (reporter_id, target_type, target_id, reason, description)
values (
  '22000000-0000-4000-8000-000000000002',
  'group',
  '42000000-0000-4000-8000-000000000002',
  'other',
  '测试举报'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"33000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  not exists (select 1 from public.reports),
  '普通用户不得读取其他人的举报'
);

rollback;
