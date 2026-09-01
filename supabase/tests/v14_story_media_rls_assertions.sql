-- Run only against a disposable local Supabase database after all migrations.
-- This script verifies story-media RLS for anonymous, owner, group member and outsider identities.

\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition, false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.entry_media_assets') is null
    or to_regclass('public.media_cleanup_queue') is null
  then
    raise exception 'story media tables are missing';
  end if;
  if not (
    select relrowsecurity from pg_catalog.pg_class
    where oid = 'public.entry_media_assets'::regclass
  ) or not (
    select relrowsecurity from pg_catalog.pg_class
    where oid = 'public.media_cleanup_queue'::regclass
  ) then
    raise exception 'story media tables must have RLS enabled';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.entry_media_assets', 'INSERT')
    or pg_catalog.has_table_privilege('authenticated', 'public.entry_media_assets', 'UPDATE')
    or pg_catalog.has_table_privilege('authenticated', 'public.entry_media_assets', 'DELETE')
    or pg_catalog.has_table_privilege('authenticated', 'public.media_cleanup_queue', 'SELECT')
  then
    raise exception 'browser media privileges are too broad';
  end if;
  if pg_catalog.has_function_privilege('authenticated', 'public.claim_story_media_cleanup(integer)', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'public.reserve_entry_media_asset(uuid,uuid,text,bigint,bigint,integer,integer)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', 'public.reserve_entry_media_asset(uuid,uuid,text,bigint,bigint,integer,integer)', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'public.complete_entry_media_asset_delete(uuid)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', 'public.complete_entry_media_asset_delete(uuid)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', 'public.claim_story_media_cleanup(integer)', 'EXECUTE')
  then
    raise exception 'cleanup worker grants are invalid';
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
  'media-a@example.invalid', crypt('test-password-a', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"媒体测试 A"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'b2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'media-b@example.invalid', crypt('test-password-b', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"媒体测试 B"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'c3000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
  'media-c@example.invalid', crypt('test-password-c', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"媒体测试 C"}',
  now(), now(), '', '', '', ''
);

insert into public.groups (id, slug, name, visibility, created_by)
values (
  'd4000000-0000-4000-8000-000000000004',
  'media-rls-group',
  '媒体权限群组',
  'private',
  'a1000000-0000-4000-8000-000000000001'
);
-- The group creation trigger already inserts A as owner. Add only B here so
-- the assertion remains compatible with the production group lifecycle.
insert into public.group_members (group_id, user_id, role, status, joined_at)
values (
  'd4000000-0000-4000-8000-000000000004',
  'b2000000-0000-4000-8000-000000000002',
  'member',
  'active',
  now()
);

-- Group-entry validation derives the actor from the JWT even during fixture
-- setup. Establish A as the author so the test exercises the real write path.
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
insert into public.map_entries (
  id, user_id, title, content, latitude, longitude,
  time_precision, time_label, visibility, group_id, unlock_at
) values
('e5000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000001', '公开媒体', '公开正文', 30, 104, 'approximate', '曾经', 'public', null, null),
('e6000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000001', '私密媒体', '私密正文', 30, 104, 'approximate', '曾经', 'private', null, null),
('e7000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000001', '群组媒体', '群组正文', 30, 104, 'approximate', '曾经', 'group', 'd4000000-0000-4000-8000-000000000004', null),
('e8000000-0000-4000-8000-000000000008', 'a1000000-0000-4000-8000-000000000001', '未解锁媒体', '未来正文', 30, 104, 'approximate', '未来', 'public', null, now() + interval '1 day');
select set_config('request.jwt.claims', '{}', true);

insert into public.entry_media_assets (
  id, entry_id, user_id, storage_path, thumbnail_path,
  source_mime_type, width, height, size_bytes, thumbnail_size_bytes,
  status, sort_order, is_cover
) values
('f5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001/e5000000-0000-4000-8000-000000000005/f5000000-0000-4000-8000-000000000005.webp', 'a1000000-0000-4000-8000-000000000001/e5000000-0000-4000-8000-000000000005/f5000000-0000-4000-8000-000000000005-thumb.webp', 'image/jpeg', 100, 100, 100, 50, 'ready', 0, true),
('f6000000-0000-4000-8000-000000000006', 'e6000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001/e6000000-0000-4000-8000-000000000006/f6000000-0000-4000-8000-000000000006.webp', 'a1000000-0000-4000-8000-000000000001/e6000000-0000-4000-8000-000000000006/f6000000-0000-4000-8000-000000000006-thumb.webp', 'image/png', 100, 100, 100, 50, 'ready', 0, true),
('f7000000-0000-4000-8000-000000000007', 'e7000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001/e7000000-0000-4000-8000-000000000007/f7000000-0000-4000-8000-000000000007.webp', 'a1000000-0000-4000-8000-000000000001/e7000000-0000-4000-8000-000000000007/f7000000-0000-4000-8000-000000000007-thumb.webp', 'image/webp', 100, 100, 100, 50, 'ready', 0, true),
('f8000000-0000-4000-8000-000000000008', 'e8000000-0000-4000-8000-000000000008', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001/e8000000-0000-4000-8000-000000000008/f8000000-0000-4000-8000-000000000008.webp', 'a1000000-0000-4000-8000-000000000001/e8000000-0000-4000-8000-000000000008/f8000000-0000-4000-8000-000000000008-thumb.webp', 'image/jpeg', 100, 100, 100, 50, 'ready', 0, true);

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert_true(
  (select count(*) = 1 from public.entry_media_assets),
  'anonymous must read public unlocked media only'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.assert_true(
  (select count(*) = 4 from public.entry_media_assets),
  'A must read all four authorized media rows'
);

do $$
begin
  begin
    insert into public.entry_media_assets (
      entry_id, user_id, storage_path, thumbnail_path,
      source_mime_type, width, height, size_bytes, thumbnail_size_bytes
    ) values (
      'e5000000-0000-4000-8000-000000000005',
      'a1000000-0000-4000-8000-000000000001',
      'forbidden.webp', 'forbidden-thumb.webp', 'image/jpeg', 1, 1, 1, 1
    );
    raise exception 'authenticated role unexpectedly inserted media directly';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select pg_temp.assert_true(
  (select count(*) = 2 from public.entry_media_assets),
  'B must read public and active-group media only'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.entry_media_assets
    where entry_id = 'e8000000-0000-4000-8000-000000000008'
  ),
  'locked capsule media must not leak'
);

do $$
begin
  begin
    perform public.reserve_entry_media_asset(
      'b2000000-0000-4000-8000-000000000002',
      'e5000000-0000-4000-8000-000000000005',
      'image/jpeg', 100, 50, 100, 100
    );
    raise exception 'authenticated browser executed server media reservation';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select pg_temp.assert_true(
  (select count(*) = 1 from public.entry_media_assets),
  'C must read only public unlocked media'
);

rollback;
