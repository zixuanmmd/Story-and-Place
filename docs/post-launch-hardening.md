# v1.4 上线后加固记录

更新日期：2026-09-02

## 当前生产基线

- Production commit：`2ceceba8eda8fde569dec17bb63a0788a5a49bb2`
- Supabase project ref：`bmzsabgzzrwekghdceyj`
- `/api/health`：App、Database、Media 均为 `ok`
- v1.4 七组事务型 SQL/RLS 断言已在目标数据库通过，回滚后无测试数据残留
- Vercel 上线后 24 小时窗口未发现 runtime error

## Supabase Advisor 分类

### 保持现状：默认拒绝表

以下表启用了 RLS、没有浏览器策略，且浏览器角色没有直接业务写权限：

- `private.rate_limit_buckets`
- `public.media_cleanup_queue`
- `public.notification_email_outbox`

这是有意的默认拒绝设计。不要为了消除 `rls_enabled_no_policy` 信息提示而增加允许策略；这些数据只能通过受控的 service-role RPC 或 worker 处理。

### 需要长期收敛：可执行的 SECURITY DEFINER 函数

Advisor 会报告允许 `anon` 或 `authenticated` 执行的 `SECURITY DEFINER` 函数。当前函数分为三类：

1. 匿名公开读取、搜索、标签计数和 feature flag 查询所需的公共 RPC。
2. 被 RLS policy 调用、必须向对应 API role 授予 `EXECUTE` 的权限 helper。
3. 由普通登录角色调用、但函数内部再次验证 owner、成员、字段权限或管理员身份的受控写 RPC。

这些函数已经由 SQL/RLS 断言验证，不能批量撤销 `EXECUTE`，否则会再次造成合法请求返回 `42501`。后续可以把只供 policy 使用的 helper 迁移到未暴露 schema，并逐个保留最小 `USAGE/EXECUTE`；迁移前必须覆盖匿名、普通用户、owner、共同经历者、群组成员和管理员身份矩阵。

### 必须人工完成：泄露密码保护

Supabase Advisor 仍报告 `auth_leaked_password_protection`。该设置不应通过数据库 migration 猜测修改。

在 Supabase Dashboard 的 Authentication 密码安全设置中启用 **Leaked password protection**，随后使用测试账号验证：

- 常见泄露密码被拒绝；
- 合法强密码注册、重置和登录保持正常；
- 错误提示不会暴露 Supabase 内部信息。

### 本次代码处理：外键覆盖索引

`202609020001_v14_post_launch_fk_indexes.sql` 为 Advisor 报告的 22 个未覆盖外键增加索引。19 个可空审计/生命周期字段使用 `WHERE column IS NOT NULL` 的部分索引，三个非空关系字段使用普通 B-tree 索引。

该 migration 只增加索引，不改变 RLS、函数授权、约束或业务数据。应用后运行：

```text
supabase/tests/v14_post_launch_hardening_assertions.sql
```

断言只读取 PostgreSQL catalog，不写入业务数据。

## 暂不处理的性能提示

- `unused_index`：生产流量和观察窗口仍太小，不能据此删除时间、搜索、通知或治理索引。
- `multiple_permissive_policies`：`public.groups` 的两个 SELECT policy 当前分别覆盖创建者兜底和公共/成员/邀请可见性。合并策略会影响隐私语义，应放入独立 migration 并重新跑群组多身份 RLS 测试。

## 发布顺序

1. 在隔离或 Preview 数据库应用 `202609020001_v14_post_launch_fk_indexes.sql`。
2. 运行 catalog 断言与完整 RLS 测试。
3. 运行 `npm test`、`npm run lint`、`npm run typecheck`、`npm run build`。
4. 创建 PR 和 Preview，确认地图、搜索、通知、媒体与管理页无回归。
5. 获得明确授权后再应用 Production migration。
6. 应用后重新运行 Supabase performance advisor；不要删除仍显示为 unused 的现有索引。

