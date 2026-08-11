-- v1.3 owner-only drafts, optimistic concurrency and publication assertions.
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
  'e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'draft-a@example.invalid', crypt('draft-a', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"草稿测试 A"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'e2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'draft-b@example.invalid', crypt('draft-b', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"草稿测试 B"}',
  now(), now(), '', '', '', ''
);

create temporary table draft_test_state (id uuid, revision bigint);
grant select, insert, update on table pg_temp.draft_test_state to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
insert into pg_temp.draft_test_state
select saved.id, saved.revision
from public.save_entry_draft(
  null,
  null,
  '{
    "version": 1,
    "values": {
      "title": "未发布故事", "content": "只在草稿中出现的正文",
      "place_name": "人民公园", "latitude": 30.66, "longitude": 104.06,
      "time_precision": "year", "time_value": "2026", "occurred_timezone": "",
      "visibility": "private", "group_id": "", "place_category_slug": "nature",
      "allow_comments": true, "unlock_at": ""
    }
  }'::jsonb,
  '草稿标签', 0, 'e3000000-0000-4000-8000-000000000003'
) saved;

select pg_temp.assert_true(
  (select count(*) = 1 from public.entry_drafts),
  'owner must read the draft'
);
select pg_temp.assert_true(
  not exists (select 1 from public.map_entries where title = '未发布故事'),
  'draft content must not appear in the published entry table'
);

do $$
begin
  begin
    insert into public.entry_drafts (
      user_id, payload, client_instance_id
    ) values (
      'e1000000-0000-4000-8000-000000000001', '{}'::jsonb,
      'e3000000-0000-4000-8000-000000000003'
    );
    raise exception 'ASSERTION FAILED: authenticated direct insert must be denied';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e2000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  not exists (select 1 from public.entry_drafts),
  'another authenticated user must not discover the draft'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $$
begin
  begin
    perform 1 from public.entry_drafts;
    raise exception 'ASSERTION FAILED: anonymous draft table access must be denied';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
do $$
declare
  state pg_temp.draft_test_state%rowtype;
  saved public.entry_drafts%rowtype;
begin
  select * into state from pg_temp.draft_test_state;
  select * into saved from public.save_entry_draft(
    state.id, null,
    '{
      "version": 1,
      "values": {
        "title": "未发布故事（新版）", "content": "新版正文",
        "place_name": "人民公园", "latitude": 30.66, "longitude": 104.06,
        "time_precision": "year", "time_value": "2026", "occurred_timezone": "",
        "visibility": "private", "group_id": "", "place_category_slug": "nature",
        "allow_comments": true, "unlock_at": ""
      }
    }'::jsonb,
    '草稿标签', state.revision, 'e3000000-0000-4000-8000-000000000003'
  );
  update pg_temp.draft_test_state set revision = saved.revision;
end;
$$;

do $$
declare
  state pg_temp.draft_test_state%rowtype;
begin
  select * into state from pg_temp.draft_test_state;
  begin
    perform public.save_entry_draft(
      state.id, null,
      (select payload from public.entry_drafts where id = state.id),
      '过期请求', state.revision - 1,
      'e4000000-0000-4000-8000-000000000004'
    );
    raise exception 'ASSERTION FAILED: stale revision must be rejected';
  exception when serialization_failure then
    null;
  end;
end;
$$;

select public.publish_entry_draft(
  state.id,
  state.revision,
  '{
    "title": "正式故事", "content": "正式正文", "place_name": "人民公园",
    "latitude": 30.66, "longitude": 104.06, "occurred_local": null,
    "occurred_timezone": null, "occurred_date": "2026-01-01", "occurred_year": 2026,
    "time_precision": "year", "time_label": "2026 年", "visibility": "private",
    "group_id": null, "place_category_slug": "nature", "allow_comments": true,
    "unlock_at": null
  }'::jsonb,
  array['草稿标签']
)
from pg_temp.draft_test_state state;

select pg_temp.assert_true(
  exists (select 1 from public.map_entries where title = '正式故事'),
  'explicit publish must create the map entry'
);

reset role;
select pg_temp.assert_true(
  exists (
    select 1 from public.entry_drafts
    where status = 'published' and payload is null and tag_input = ''
  ),
  'published drafts must clear unpublished text'
);

rollback;
