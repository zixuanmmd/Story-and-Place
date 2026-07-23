-- RLS 人工验证脚本（在本地 Supabase 或测试项目中执行）
--
-- 准备：
-- 1. 通过应用注册两个测试账户 A、B，并确保 profiles 已由触发器建立。
-- 2. 让 A 创建一条 public 和一条 private 记录；让 B 创建一条 private 记录。
-- 3. 记录两个用户 UUID 及三条记录 UUID。
--
-- Supabase SQL Editor 默认以高权限角色运行，会绕过 RLS，因此不能直接代表客户端。
-- 请在不同会话中使用下列方式模拟客户端角色，并替换占位 UUID。

begin;

-- 未登录访客：只能读取公开记录。
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select id, user_id, visibility from public.map_entries order by created_at;
-- 预期：只出现 public；任何 private 都不出现。

rollback;

begin;

-- 登录为用户 A：替换为 A 的真实 UUID。
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',
  true
);

select id, user_id, visibility from public.map_entries order by created_at;
-- 预期：出现全部 public 和 A 自己的 private；不出现 B 的 private。

-- 将下面 UUID 替换成 B 的 private 记录：预期更新 0 行。
update public.map_entries
set title = '不应成功'
where id = '00000000-0000-0000-0000-00000000000b';

-- 将下面 UUID 替换成 B 的 private 记录：预期删除 0 行。
delete from public.map_entries
where id = '00000000-0000-0000-0000-00000000000b';

-- 将 user_id 替换成 B 的 UUID：预期触发 RLS 错误，无法伪造作者。
insert into public.map_entries (
  user_id, title, content, latitude, longitude,
  occurred_year, time_precision, time_label, visibility
) values (
  '00000000-0000-0000-0000-00000000000b',
  '伪造作者测试', '这条记录不应插入', 0, 0,
  2026, 'year', '2026 年', 'private'
);

rollback;

-- 推荐再通过两个浏览器无痕窗口完成 README 中的端到端验证矩阵。
