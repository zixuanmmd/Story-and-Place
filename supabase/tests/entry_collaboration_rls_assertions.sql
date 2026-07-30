-- Entry collaboration, field permissions, logs, tags and privacy assertions.
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
  '81000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'collab-a@example.invalid', crypt('collab-a', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"协作测试 A"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '82000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'collab-b@example.invalid', crypt('collab-b', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"协作测试 B"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '83000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
  'collab-c@example.invalid', crypt('collab-c', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"协作测试 C"}',
  now(), now(), '', '', '', ''
);

select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into public.groups (id, slug, name, visibility, created_by)
values (
  '84000000-0000-4000-8000-000000000004',
  'entry-collaboration-test',
  '共同经历测试群组',
  'private',
  '81000000-0000-4000-8000-000000000001'
);
insert into public.group_members (group_id, user_id, role, status, joined_at)
values (
  '84000000-0000-4000-8000-000000000004',
  '82000000-0000-4000-8000-000000000002',
  'member',
  'active',
  now()
);

insert into public.map_entries (
  id, user_id, title, content, latitude, longitude,
  occurred_year, time_precision, time_label, visibility
) values (
  '85000000-0000-4000-8000-000000000005',
  '81000000-0000-4000-8000-000000000001',
  '私密共同经历',
  '接受前不可读取',
  30,
  120,
  2026,
  'year',
  '2026 年',
  'private'
);

select public.invite_entry_participant(
  '85000000-0000-4000-8000-000000000005',
  '82000000-0000-4000-8000-000000000002',
  array['content', 'tags']
);

select public.update_entry(
  '85000000-0000-4000-8000-000000000005',
  '{"content":"接受邀请前的所有者编辑"}'::jsonb,
  null
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.map_entries
    where id = '85000000-0000-4000-8000-000000000005'
  ),
  'pending participant must not read a private entry'
);

select public.respond_entry_participant_invitation(
  '85000000-0000-4000-8000-000000000005',
  true
);
select pg_temp.assert_true(
  exists (
    select 1 from public.map_entries
    where id = '85000000-0000-4000-8000-000000000005'
  ),
  'accepted participant must read the private entry'
);

select public.update_entry(
  '85000000-0000-4000-8000-000000000005',
  '{"content":"B 已共同编辑"}'::jsonb,
  array['共同经历', '只对可见用户聚合']
);
select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.entry_edit_logs
    where entry_id = '85000000-0000-4000-8000-000000000005'
      and editor_id = '82000000-0000-4000-8000-000000000002'
  ),
  'accepted participant must read only compliant post-acceptance edit logs'
);

do $$
begin
  begin
    perform public.update_entry(
      '85000000-0000-4000-8000-000000000005',
      '{"visibility":"public"}'::jsonb,
      null
    );
    raise exception 'ASSERTION FAILED: participant changed visibility';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

do $$
declare
  affected integer;
begin
  delete from public.map_entries
  where id = '85000000-0000-4000-8000-000000000005';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'ASSERTION FAILED: participant deleted an entry';
  end if;
end;
$$;

select pg_temp.assert_true(
  exists (
    select 1
    from public.get_visible_tag_summary(
      (
        select slug
        from public.tags
        where normalized_name = '共同经历'
      )
    )
  ),
  'accepted participant must see readable tag aggregation'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (
    select count(*) = 3
    from public.entry_edit_logs
    where entry_id = '85000000-0000-4000-8000-000000000005'
  ),
  'entry owner must read both owner and accepted-participant edit logs'
);

select public.create_entry(
  jsonb_build_object(
    'title', '公开标签权限测试',
    'content', '匿名与登录用户都只能通过可读事件看到标签',
    'latitude', 34,
    'longitude', 124,
    'occurred_year', 2026,
    'time_precision', 'year',
    'time_label', '2026 年',
    'visibility', 'public',
    'group_id', null,
    'place_category_slug', 'other',
    'allow_comments', true
  ),
  array['公开标签']
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"83000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.entry_edit_logs
    where entry_id = '85000000-0000-4000-8000-000000000005'
  ),
  'unrelated user must not read private-entry edit logs'
);
select pg_temp.assert_true(
  exists (
    select 1 from public.tags
    where normalized_name = '公开标签'
  ),
  'authenticated user must query tags backed by readable public entries'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.tags
    where normalized_name in ('共同经历', '只对可见用户聚合')
  ),
  'authenticated user must not see tags backed only by private entries'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert_true(
  exists (
    select 1 from public.tags
    where normalized_name = '公开标签'
  ),
  'anonymous user must query tags backed by readable public entries'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.tags
    where normalized_name in ('共同经历', '只对可见用户聚合')
  ),
  'anonymous user must not see tags backed only by private entries'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"83000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
do $$
begin
  begin
    perform public.create_entry(
      jsonb_build_object(
        'title', '非成员不能创建群组记录',
        'content', 'security-definer RPC 必须校验目标群组资格',
        'latitude', 32,
        'longitude', 122,
        'occurred_year', 2026,
        'time_precision', 'year',
        'time_label', '2026 年',
        'visibility', 'group',
        'group_id', '84000000-0000-4000-8000-000000000004',
        'place_category_slug', 'other',
        'allow_comments', true
      ),
      '{}'::text[]
    );
    raise exception 'ASSERTION FAILED: non-member created a group entry through RPC';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

do $$
declare
  private_entry public.map_entries%rowtype;
begin
  private_entry := public.create_entry(
    jsonb_build_object(
      'title', '目标群组更新校验',
      'content', '先创建私密记录，再尝试移入无权群组',
      'latitude', 33,
      'longitude', 123,
      'occurred_year', 2026,
      'time_precision', 'year',
      'time_label', '2026 年',
      'visibility', 'private',
      'group_id', null,
      'place_category_slug', 'other',
      'allow_comments', true
    ),
    '{}'::text[]
  );
  begin
    perform public.update_entry(
      private_entry.id,
      jsonb_build_object(
        'visibility', 'group',
        'group_id', '84000000-0000-4000-8000-000000000004'
      ),
      null
    );
    raise exception 'ASSERTION FAILED: non-member moved an entry into a group through RPC';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into public.map_entries (
  id, user_id, title, content, latitude, longitude,
  occurred_year, time_precision, time_label, visibility, group_id
) values (
  '86000000-0000-4000-8000-000000000006',
  '81000000-0000-4000-8000-000000000001',
  '群组共同经历',
  '仍要求群组资格',
  31,
  121,
  2026,
  'year',
  '2026 年',
  'group',
  '84000000-0000-4000-8000-000000000004'
);

do $$
begin
  begin
    perform public.invite_entry_participant(
      '86000000-0000-4000-8000-000000000006',
      '83000000-0000-4000-8000-000000000003',
      array['content']
    );
    raise exception 'ASSERTION FAILED: non-member was invited to a group entry';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select public.invite_entry_participant(
  '86000000-0000-4000-8000-000000000006',
  '82000000-0000-4000-8000-000000000002',
  array['content']
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select public.respond_entry_participant_invitation(
  '86000000-0000-4000-8000-000000000006',
  true
);
select pg_temp.assert_true(
  exists (
    select 1 from public.map_entries
    where id = '86000000-0000-4000-8000-000000000006'
  ),
  'accepted group participant must read the entry while membership is active'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.remove_group_member(
  '84000000-0000-4000-8000-000000000004',
  '82000000-0000-4000-8000-000000000002'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.map_entries
    where id = '86000000-0000-4000-8000-000000000006'
  ),
  'accepted group participant must lose access after membership removal'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.revoke_entry_participant(
  '85000000-0000-4000-8000-000000000005',
  '82000000-0000-4000-8000-000000000002'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.map_entries
    where id = '85000000-0000-4000-8000-000000000005'
  ),
  'revoked participant must immediately lose private-entry access'
);

rollback;
