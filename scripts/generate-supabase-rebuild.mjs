import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationNames = [
  "202607220001_initial_schema.sql",
  "202607220002_privacy_time_integrity.sql",
  "202607230001_groups_social_categories.sql",
  "202607240001_unique_display_names_and_schema_refresh.sql",
  "202607250001_timelines_story_routes.sql",
  "202607250002_group_membership_hardening.sql",
  "202607250003_group_creator_select_policy.sql",
  "202607260001_entry_participants_tags.sql",
  "202607300001_entry_rpc_group_membership.sql",
  "202607300002_entry_rls_helper_execute.sql",
];
const outputPath = resolve(
  projectRoot,
  "supabase/rebuild/current_schema_rebuild.sql",
);

const prelude = `-- 故事情感地图：当前代码对应的完整 Supabase 重建 Query
-- 生成来源：supabase/migrations 中按版本排序的全部 migration。
--
-- 危险操作：
--   1. 删除 public schema 中的全部应用表、函数、策略和测试数据。
--   2. 保留 auth.users 登录账户。
--   3. 重建完成后，从 auth.users 补建 public.profiles。
--
-- 仅用于确认可以丢弃当前 public schema 数据的测试环境。
-- 整个重建位于一个事务中；任何一步失败都会整体回滚。

begin;

drop schema if exists public cascade;
create schema public authorization postgres;

comment on schema public is 'standard public schema';

grant usage on schema public
to postgres, anon, authenticated, service_role;
grant all on schema public
to postgres, service_role;

alter default privileges for role postgres in schema public
grant all on tables to postgres, service_role;
alter default privileges for role postgres in schema public
grant all on sequences to postgres, service_role;
alter default privileges for role postgres in schema public
grant all on functions to postgres, service_role;
`;

const backfill = `
-- ============================================================
-- AUTH PROFILE BACKFILL
-- ============================================================
-- drop schema public cascade 会保留 auth.users，但会重建 profiles。
-- 这里为已有登录账户补建公开资料。有效且唯一的 metadata 昵称保持不变；
-- 无效昵称使用匿名稳定名称，重复昵称追加 UUID 前八位。

with profile_candidates as (
  select
    auth_user.id,
    auth_user.created_at,
    case
      when char_length(
        public.format_display_name(
          auth_user.raw_user_meta_data ->> 'display_name'
        )
      ) between 1 and 80
      then public.format_display_name(
        auth_user.raw_user_meta_data ->> 'display_name'
      )
      else
        '地图旅人-' ||
        left(replace(auth_user.id::text, '-', ''), 8)
    end as base_display_name
  from auth.users as auth_user
),
ranked_profiles as (
  select
    candidate.*,
    row_number() over (
      partition by public.normalize_display_name(
        candidate.base_display_name
      )
      order by candidate.created_at asc, candidate.id asc
    ) as duplicate_rank
  from profile_candidates as candidate
),
profiles_to_restore as (
  select
    ranked.id,
    ranked.created_at,
    case
      when ranked.duplicate_rank = 1 then ranked.base_display_name
      else
        left(ranked.base_display_name, 71) ||
        '-' ||
        left(replace(ranked.id::text, '-', ''), 8)
    end as display_name
  from ranked_profiles as ranked
)
insert into public.profiles (
  id,
  display_name,
  created_at,
  updated_at
)
select
  restored.id,
  restored.display_name,
  coalesce(restored.created_at, now()),
  now()
from profiles_to_restore as restored
on conflict (id) do nothing;

do $$
begin
  if exists (
    select 1
    from auth.users as auth_user
    left join public.profiles as profile
      on profile.id = auth_user.id
    where profile.id is null
  ) then
    raise exception using
      errcode = '55000',
      message = 'one or more auth users could not be restored to public.profiles';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;

-- 最终摘要；SQL Editor 应显示所有对象存在，并给出保留的登录账户数量。
select
  to_regclass('public.profiles') is not null as profiles_ready,
  to_regclass('public.map_entries') is not null as map_entries_ready,
  to_regclass('public.groups') is not null as groups_ready,
  to_regclass('public.story_routes') is not null as story_routes_ready,
  to_regclass('public.entry_participants') is not null as entry_participants_ready,
  to_regclass('public.tags') is not null as tags_ready,
  (
    select count(*)::integer
    from public.profiles
  ) as restored_profile_count;
`;

const sections = migrationNames.map((migrationName) => {
  const migrationPath = resolve(
    projectRoot,
    "supabase/migrations",
    migrationName,
  );
  const sql = readFileSync(migrationPath, "utf8").trim();
  return `\n-- ============================================================\n-- MIGRATION: ${migrationName}\n-- ============================================================\n${sql}\n`;
});

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `${prelude}${sections.join("")}${backfill}`,
  "utf8",
);

console.log(
  `Generated ${outputPath} from ${migrationNames.length} migrations.`,
);
