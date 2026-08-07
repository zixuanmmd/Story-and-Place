-- Emotion-tag RLS and public-page privacy assertions.
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
  '91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'emotion-a@example.invalid', crypt('emotion-a', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"情绪测试 A"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '92000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'emotion-b@example.invalid', crypt('emotion-b', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"情绪测试 B"}',
  now(), now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '93000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
  'emotion-c@example.invalid', crypt('emotion-c', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"情绪测试 C"}',
  now(), now(), '', '', '', ''
);

select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into public.map_entries (
  id, user_id, title, content, latitude, longitude,
  occurred_year, time_precision, time_label, visibility
) values
(
  '94000000-0000-4000-8000-000000000004',
  '91000000-0000-4000-8000-000000000001',
  '公开的孤独', '公共情绪页可以读取', 30, 120,
  2026, 'year', '2026 年', 'public'
),
(
  '95000000-0000-4000-8000-000000000005',
  '91000000-0000-4000-8000-000000000001',
  '私密的孤独', '公共情绪页绝不能读取', 31, 121,
  2026, 'year', '2026 年', 'private'
);

select public.set_entry_tags(
  '94000000-0000-4000-8000-000000000004',
  array['孤独']
);
select public.set_entry_tags(
  '95000000-0000-4000-8000-000000000005',
  array['孤独']
);
select public.invite_entry_participant(
  '95000000-0000-4000-8000-000000000005',
  '92000000-0000-4000-8000-000000000002',
  '{}'::text[]
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.get_public_emotion_entries('loneliness', 0, 51)
  ),
  'anonymous emotion page must return public entries only'
);
select pg_temp.assert_true(
  (
    select entry_count = 1
    from public.get_public_emotion_summary('loneliness')
  ),
  'anonymous emotion count must exclude private entries'
);
select pg_temp.assert_true(
  (
    select entry_count = 1
    from public.get_visible_tags('emotion', 0, 51)
    where semantic_key = 'loneliness'
  ),
  'anonymous typed tag count must include only readable entries'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.get_public_emotion_entries('loneliness', 0, 51)
  ),
  'unrelated authenticated user must not discover a private emotion entry'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select public.respond_entry_participant_invitation(
  '95000000-0000-4000-8000-000000000005',
  true
);
select pg_temp.assert_true(
  (
    select entry_count = 2
    from public.get_visible_tags('emotion', 0, 51)
    where semantic_key = 'loneliness'
  ),
  'accepted participant may count a readable private emotion entry'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.get_public_emotion_entries('loneliness', 0, 51)
  ),
  'public emotion page must remain public-only for an accepted participant'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (
    select entry_count = 2
    from public.get_visible_tags('emotion', 0, 51)
    where semantic_key = 'loneliness'
  ),
  'owner typed tag count may include the owner private entry'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.get_public_emotion_entries('loneliness', 0, 51)
  ),
  'owner still must not see a private entry on the public emotion page'
);

rollback;
