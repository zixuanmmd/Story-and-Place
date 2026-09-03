# v1.4 上线后加固记录

更新日期：2026-09-03

## 当前生产基线

- Production commit：`f6f6e927676893e618cf8c4c1c9d99f9a9d073f3`
- Supabase project ref：`bmzsabgzzrwekghdceyj`
- `/api/health`：App、Database、Media 均为 `ok`
- v1.4 七组事务型 SQL/RLS 断言已在目标数据库通过，回滚后无测试数据残留
- `202609020001_v14_post_launch_fk_indexes.sql` 已应用；远端记录为 `20260903030934_v14_post_launch_fk_indexes`
- 外键索引目录断言为 22/22 valid/ready，Performance Advisor 的未覆盖外键提示为 0
- 合并后 Production 构建成功，首页、Explore、Search、独立故事页与健康接口冒烟通过，验证窗口未发现 runtime error
- 2026-09-03 使用三个一次性 Production 测试身份完成 19 项真实 RLS/RPC 冒烟断言；测试账户、故事、群组与通知均按精确 ID 清理，清理后测试资料残留为 0

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

### 已知风险接受：泄露密码保护暂缓开启

Supabase Advisor 仍报告 `auth_leaked_password_protection`。该设置不应通过数据库 migration 猜测修改。项目维护者于 2026-09-03 决定在当前小范围测试阶段暂缓开启；文档不得把它描述为已经解决。

在扩大公开注册、开始收费或进入下一轮正式安全审查前，应重新评估并在 Supabase Dashboard 的 Authentication 密码安全设置中启用 **Leaked password protection**，随后使用测试账号验证：

- 常见泄露密码被拒绝；
- 合法强密码注册、重置和登录保持正常；
- 错误提示不会暴露 Supabase 内部信息。

### 本次代码处理：外键覆盖索引

`202609020001_v14_post_launch_fk_indexes.sql` 为 Advisor 报告的 22 个未覆盖外键增加索引。19 个可空审计/生命周期字段使用 `WHERE column IS NOT NULL` 的部分索引，三个非空关系字段使用普通 B-tree 索引。

该 migration 只增加索引，不改变 RLS、函数授权、约束或业务数据。它已于 2026-09-03 应用到 Production；Supabase Management API 生成的远端版本为 `20260903030934_v14_post_launch_fk_indexes`。本地文件名与远端记录的对应关系必须保留，避免后续维护者误判为未执行。

应用后已运行：

```text
supabase/tests/v14_post_launch_hardening_assertions.sql
```

断言只读取 PostgreSQL catalog，不写入业务数据。

## 暂不处理的性能提示

- `unused_index`：生产流量和观察窗口仍太小，不能据此删除时间、搜索、通知或治理索引。
- `multiple_permissive_policies`：`public.groups` 的两个 SELECT policy 当前分别覆盖创建者兜底和公共/成员/邀请可见性。合并策略会影响隐私语义，应放入独立 migration 并重新跑群组多身份 RLS 测试。

## 2026-09-03 发布执行记录

1. Preview 构建、健康检查和代码质量门禁通过。
2. Production 执行前确认最大相关表约 3 MB，数据库无活跃会话和锁等待。
3. 应用 `202609020001_v14_post_launch_fk_indexes.sql`，远端记录为 `20260903030934_v14_post_launch_fk_indexes`。
4. Catalog 断言确认 22/22 索引均存在且 valid/ready。
5. 重新运行 Security/Performance Advisor，未覆盖外键提示归零；没有因本次索引变更新增安全问题。
6. PR #4 squash 合并为 `f6f6e927676893e618cf8c4c1c9d99f9a9d073f3`，Vercel Production 部署 READY。
7. Production 首页、Explore、Search、独立故事页和 `/api/health` 冒烟通过；不要因为新索引立即显示为 unused 就删除它们。

## 2026-09-03 上线前收口复核

- Production 多身份 RLS/RPC：19/19 通过。覆盖匿名、所有者、未授权用户、已接受共同经历者、退出后的群组成员与普通非管理员用户。
- 隔离结论：匿名和未授权用户不能读取私密故事；共同经历邀请接受前不授予正文读取权；撤销协作或退出群组后权限立即失效；普通用户不能调用管理员 Dashboard RPC；B 不能读取 A 的通知。
- 字段级编辑：仅授予 `time` 的共同经历者可以修改时间整体，不能修改正文或可见性。
- 写入边界：B 不能伪造 A 的 `user_id`，不能直接修改或删除 A 的故事。
- 清理结论：三个一次性账户及其测试故事、群组和通知均已删除，未发现测试资料残留。
- 应用质量门禁：108 个测试文件、536 项测试全部通过；ESLint 零警告、TypeScript 检查、Production build 均通过。
- 依赖审计：`npm audit --omit=dev` 为 0 个漏洞；当前 Next.js 保持 `16.3.3`，未在本次文档收口中升级。
- 灾备材料：`npm run dr:validate` 通过，确认 36 份 migration 与恢复文档一致；该命令是非联网 dry-run，不等同于真实数据库或 Storage 恢复演练。
- 服务端 secret：生产 `/api/health` 的 Media 检查为 `ok`，证明部署运行时可使用服务端 Supabase 管理客户端访问私密 Storage；源码与 Git 跟踪文件中未发现带 `NEXT_PUBLIC_` 前缀的 service role/secret/token 配置。
- Vercel 运行状态：近 7 天聚合未发现 runtime error；近 24 小时日志只出现 200/304，没有 4xx/5xx。观察窗口内没有 `/api/media/cleanup` 调用记录，因此每日 Cron 的最新一次成功执行仍需在下一次调度后复核。
- 备份状态：仓库已具备恢复目标、职责、验证矩阵和 dry-run 校验；Supabase 实际备份任务、异地数据库导出与 Storage 对象副本仍需由运维人员在 Dashboard/备份存储中确认，不能仅凭本地脚本声明完成。
