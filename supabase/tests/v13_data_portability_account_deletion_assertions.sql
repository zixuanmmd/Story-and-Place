-- v1.3 export and account-deletion permission assertions.
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
  'f1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'portable-a@example.invalid', crypt('portable-a', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"导出测试 A"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'f2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'portable-b@example.invalid', crypt('portable-b', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"导出测试 B"}',
  now(), now(), '', '', '', ''
);

insert into public.map_entries (
  id, user_id, title, content, place_name, latitude, longitude,
  occurred_year, time_precision, time_label, visibility, unlock_at
) values
(
  'f3000000-0000-4000-8000-000000000003',
  'f1000000-0000-4000-8000-000000000001',
  '可匿名保留', '公开正文', '成都', 30.66, 104.06,
  2026, 'year', '2026 年', 'public', null
),
(
  'f4000000-0000-4000-8000-000000000004',
  'f1000000-0000-4000-8000-000000000001',
  '删除的私密故事', '私密正文', '家中', 30.67, 104.07,
  2025, 'year', '2025 年', 'private', null
),
(
  'f5000000-0000-4000-8000-000000000005',
  'f1000000-0000-4000-8000-000000000001',
  '未来胶囊', '参与者不能导出', '未来', 30.68, 104.08,
  2035, 'year', '2035 年', 'private', now() + interval '30 days'
);

insert into public.entry_participants (
  entry_id, user_id, invited_by, status, editable_fields, responded_at
) values
(
  'f4000000-0000-4000-8000-000000000004',
  'f2000000-0000-4000-8000-000000000002',
  'f1000000-0000-4000-8000-000000000001',
  'accepted', '{}', now()
),
(
  'f5000000-0000-4000-8000-000000000005',
  'f2000000-0000-4000-8000-000000000002',
  'f1000000-0000-4000-8000-000000000001',
  'accepted', '{}', now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  jsonb_array_length(public.export_my_story_data() -> 'owned_entries') = 3,
  'owner export must include all owned entries including its own future capsule'
);
select pg_temp.assert_true(
  public.export_my_story_data()::text not like '%portable-a@example.invalid%',
  'export must not contain auth email'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  jsonb_array_length(public.export_my_story_data() -> 'participant_entries') = 1,
  'participant export must include readable collaboration but exclude future capsule'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $$
begin
  begin
    perform public.export_my_story_data();
    raise exception 'ASSERTION FAILED: anonymous export execution must be denied';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
create temporary table deletion_state (id uuid);
grant select, insert on table pg_temp.deletion_state to authenticated;
grant select on table pg_temp.deletion_state to service_role;
insert into pg_temp.deletion_state
select public.begin_account_deletion('preserve_public');

do $$
begin
  begin
    perform public.finalize_account_deletion(
      (select id from pg_temp.deletion_state),
      'f1000000-0000-4000-8000-000000000001'
    );
    raise exception 'ASSERTION FAILED: authenticated user must not finalize deletion';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role service_role;
select public.finalize_account_deletion(
  (select id from pg_temp.deletion_state),
  'f1000000-0000-4000-8000-000000000001'
);

reset role;
select pg_temp.assert_true(
  exists (
    select 1 from public.profiles
    where id = 'f1000000-0000-4000-8000-000000000001'
      and deleted_at is not null and avatar_url is null and bio is null
  ),
  'profile must become an anonymous tombstone'
);
select pg_temp.assert_true(
  exists (select 1 from public.map_entries where id = 'f3000000-0000-4000-8000-000000000003')
  and not exists (select 1 from public.map_entries where id in (
    'f4000000-0000-4000-8000-000000000004',
    'f5000000-0000-4000-8000-000000000005'
  )),
  'preserve_public must retain public entry and delete private entries'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.entry_participants
    where user_id = 'f2000000-0000-4000-8000-000000000002'
      and entry_id in (
        'f4000000-0000-4000-8000-000000000004',
        'f5000000-0000-4000-8000-000000000005'
      )
  ),
  'deleted owner entries must cascade without deleting participant profile'
);
select pg_temp.assert_true(
  exists (select 1 from public.profiles where id = 'f2000000-0000-4000-8000-000000000002'),
  'account deletion must not delete another participant account'
);

rollback;
