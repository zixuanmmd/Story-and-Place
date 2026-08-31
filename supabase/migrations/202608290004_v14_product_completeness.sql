-- v1.4 product completeness: privacy-bounded feedback intake and simple
-- operational feature flags. No flag is an authorization boundary.
--
-- Rollback note: remove application callers and the evaluated-flags RPC before
-- dropping these tables. Product feedback should be exported before rollback.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regprocedure('public.set_updated_at()') is null
    or to_regprocedure('public.consume_server_rate_limit(text,text,integer,integer)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'product completeness requires the v1.4 security migration';
  end if;
end;
$$;

create table if not exists public.product_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  category text not null,
  message varchar(2000) not null,
  current_route varchar(240) not null,
  app_version varchar(80) not null,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_feedback_category_values check (
    category in ('bug', 'feature', 'content', 'other')
  ),
  constraint product_feedback_message_not_blank check (
    char_length(btrim(message)) between 1 and 2000
  ),
  constraint product_feedback_route_safe check (
    char_length(current_route) between 1 and 240
    and current_route like '/%'
    and current_route !~ '[[:cntrl:]?#]'
  ),
  constraint product_feedback_version_safe check (
    char_length(btrim(app_version)) between 1 and 80
    and app_version !~ '[[:cntrl:]]'
  ),
  constraint product_feedback_status_values check (
    status in ('new', 'reviewing', 'resolved', 'dismissed')
  )
);

create index if not exists product_feedback_status_created_idx
  on public.product_feedback(status, created_at desc, id desc);
create index if not exists product_feedback_user_created_idx
  on public.product_feedback(user_id, created_at desc, id desc)
  where user_id is not null;

drop trigger if exists product_feedback_set_updated_at on public.product_feedback;
create trigger product_feedback_set_updated_at
before update on public.product_feedback
for each row execute function public.set_updated_at();

create table if not exists public.feature_flags (
  key text primary key,
  description varchar(500) not null default '',
  enabled boolean not null default false,
  rollout_percentage smallint not null default 0,
  authenticated_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_flags_key_format check (
    char_length(key) between 2 and 64
    and key ~ '^[a-z][a-z0-9_]{1,63}$'
  ),
  constraint feature_flags_description_length check (char_length(description) <= 500),
  constraint feature_flags_rollout_range check (rollout_percentage between 0 and 100)
);

create table if not exists public.feature_flag_overrides (
  flag_key text not null references public.feature_flags(key) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  enabled boolean not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (flag_key, user_id)
);

create index if not exists feature_flag_overrides_user_flag_idx
  on public.feature_flag_overrides(user_id, flag_key);

drop trigger if exists feature_flags_set_updated_at on public.feature_flags;
create trigger feature_flags_set_updated_at
before update on public.feature_flags
for each row execute function public.set_updated_at();

drop trigger if exists feature_flag_overrides_set_updated_at on public.feature_flag_overrides;
create trigger feature_flag_overrides_set_updated_at
before update on public.feature_flag_overrides
for each row execute function public.set_updated_at();

insert into public.feature_flags (
  key,
  description,
  enabled,
  rollout_percentage,
  authenticated_only
)
values
  ('media_upload', '故事图片上传界面。权限与配额仍由数据库单独强制。', true, 100, true),
  ('notifications', '站内通知中心与通知偏好。', true, 100, true),
  ('subscriptions', '未来套餐升级和支付入口。当前保持关闭。', false, 0, true),
  ('creator_features', '未来 Creator 专属展示能力。当前保持关闭。', false, 0, true)
on conflict (key) do update
set description = excluded.description,
    authenticated_only = excluded.authenticated_only;

create or replace function public.get_evaluated_feature_flags()
returns table (
  flag_key text,
  enabled boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select auth.uid() as user_id
  )
  select
    flag.key,
    coalesce(
      override.enabled,
      case
        when not flag.enabled then false
        when flag.authenticated_only and actor.user_id is null then false
        when flag.rollout_percentage = 100 then true
        when flag.rollout_percentage = 0 then false
        when actor.user_id is null then false
        else mod(
          abs(
            pg_catalog.hashtextextended(
              actor.user_id::text || ':' || flag.key,
              8142303
            )::numeric
          ),
          100
        ) < flag.rollout_percentage
      end,
      false
    ) as enabled
  from public.feature_flags flag
  cross join actor
  left join public.feature_flag_overrides override
    on override.flag_key = flag.key
    and override.user_id = actor.user_id
  order by flag.key;
$$;

alter table public.product_feedback enable row level security;
alter table public.feature_flags enable row level security;
alter table public.feature_flag_overrides enable row level security;

drop policy if exists "product_feedback_has_no_browser_rows" on public.product_feedback;
create policy "product_feedback_has_no_browser_rows"
on public.product_feedback for select to anon, authenticated
using (false);

drop policy if exists "feature_flags_have_no_direct_browser_rows" on public.feature_flags;
create policy "feature_flags_have_no_direct_browser_rows"
on public.feature_flags for select to anon, authenticated
using (false);

drop policy if exists "feature_flag_overrides_have_no_browser_rows" on public.feature_flag_overrides;
create policy "feature_flag_overrides_have_no_browser_rows"
on public.feature_flag_overrides for select to anon, authenticated
using (false);

revoke all on table public.product_feedback from public, anon, authenticated;
revoke all on table public.feature_flags from public, anon, authenticated;
revoke all on table public.feature_flag_overrides from public, anon, authenticated;

revoke all on function public.get_evaluated_feature_flags()
from public, anon, authenticated;
grant execute on function public.get_evaluated_feature_flags()
to anon, authenticated;

comment on table public.product_feedback is
  'Rate-limited product feedback. The app never automatically attaches story bodies, auth tokens or screenshots.';
comment on table public.feature_flags is
  'Operational UI rollout controls. Feature flags never grant database authorization.';
comment on table public.feature_flag_overrides is
  'Trusted-operator per-user rollout overrides. Rows are never exposed to browser roles.';
comment on function public.get_evaluated_feature_flags() is
  'Returns only evaluated booleans for the current auth identity; it accepts no user-id parameter.';

notify pgrst, 'reload schema';
