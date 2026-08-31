# Disaster Recovery / 灾难恢复（v1.4 草案）

本文档定义 Story-and-Place 的备份、恢复与验证流程。它不声称 Supabase Free 项目已经自动满足这些目标，也不授权对 Production 执行恢复。生产恢复只能由明确指定的维护者在变更窗口内执行。

## 恢复目标

- 目标 RPO：数据库与 Storage 最多丢失 24 小时数据。
- 目标 RTO：确认事故后 8 小时内恢复只读或完整服务。
- 当前状态：这是运营目标，不是 SLA。Supabase Free 不提供可替代自主管理的每日备份保证；正式上线前必须落实定时导出和异地保存。

## 备份范围

### Database

每日至少一次使用受控运维身份执行逻辑备份，包含 schema、数据、RLS、函数、触发器和 grants。备份文件加密后存入与 Supabase 项目不同的账户或区域，并保存 SHA-256 校验值。迁移仓库只能重建 schema，不能替代用户数据备份。

推荐命令由维护者在受控终端运行，不应放进浏览器或应用运行时：

```bash
supabase db dump --linked --data-only -f backup/database-data.sql
supabase db dump --linked --schema public -f backup/database-schema.sql
```

命令选项应先在 Preview/测试项目按当前 Supabase CLI 版本确认。不得对 Production 使用 `supabase db reset`。

### Storage

Supabase 数据库备份不包含 Storage 对象。启用媒体功能后，必须另行导出：

- bucket 配置与 Storage RLS migration；
- 每个对象的 bucket、path、size、MIME、etag/checksum 清单；
- 实际对象副本，保留与数据库媒体记录一致的路径；
- orphan 清理日志和最后一次成功同步时间。

当前测试项目已经创建私密 `story-media` bucket，并通过数据库迁移维护 Storage RLS。备份演练必须同时验证数据库中的 `entry_media_assets` / `media_cleanup_queue` 记录、对象清单和实际对象副本；只备份数据库不视为媒体恢复完成。

媒体孤儿清理由 Vercel Cron 每日调用 `/api/media/cleanup`。恢复后必须重新配置 `CRON_SECRET`、`MEDIA_CLEANUP_SECRET` 与服务端 Supabase secret，并先在空队列或隔离项目中验证任务，再恢复定时调度。

### Configuration

保存一份不含 secret 值的配置清单：

- Supabase project ref、region、Postgres major version；
- Auth Provider、Confirm Email、SMTP、Auth rate limit、CAPTCHA 与 redirect URL；
- Vercel项目、域名、Node 版本、函数区域；
- 环境变量名称、作用域（Development/Preview/Production）与最后轮换时间；
- DNS、定时任务、监控告警和负责人。

真实密钥只保存在密码管理器和托管平台，不进入备份清单、日志或仓库。

## 恢复职责

- Incident Lead：确认事故等级、批准恢复目标与对外状态。
- Database Operator：创建新隔离项目、恢复数据库并验证 RLS。
- Application Operator：配置 Preview、执行应用冒烟测试，得到批准后切换流量。
- Security Reviewer：复核 secrets 轮换、权限边界、审计记录和数据泄露范围。

同一人可以在小团队承担多个角色，但每次生产切换至少需要第二人复核目标项目和域名。

## 恢复流程（非破坏性优先）

1. 冻结写入或将应用置为维护/只读状态，记录事故时间线。
2. 不覆盖原项目；创建隔离的恢复项目。
3. 核对备份时间、SHA-256、Postgres/Supabase 版本与 migration 基线。
4. 先按 migration 顺序恢复 schema，再导入数据；禁止 reset 原生产库。
5. 单独恢复 Storage 对象和清单，检查私密对象仍不可匿名读取。
6. 配置新的 Auth redirect、服务端变量与域名；轮换可能暴露的 secret。
7. 执行下方验证矩阵。在验证完成前，不切换 Production 流量。
8. 通过审批后先发布 Preview，再进行短时只读 Production 验证，最后恢复写入。
9. 保存恢复记录、差异、丢失窗口和后续改进项。

## 验证矩阵

- migration 数量和顺序与目标版本一致；生成的 rebuild 文件来自同一清单。
- profiles、map_entries、story_routes、groups 数量与备份摘要相符。
- 匿名用户只能读取公开、已发布且已解锁内容。
- A/B/C 验证私密、群组、共同经历与字段级编辑权限。
- 草稿、未解锁时间胶囊不进入搜索、Explore、公开主页或 metadata。
- service role 不在客户端 bundle、页面源代码、日志或导出文件中。
- 健康检查只返回 `ok/degraded`，不返回连接信息。
- 启用媒体后：公开、私密、群组、草稿和时间胶囊的 signed URL 权限分别验证。
- 数据导出与账号删除只在 Preview 用专用测试账户验证。

## 定期演练

- 每日：检查数据库/Storage 备份任务状态和大小异常。
- 每周：校验备份 checksum，并运行 `npm run dr:validate` 检查仓库恢复材料。
- 每季度：在隔离测试项目完整恢复一次，记录实际 RPO/RTO。
- 重大 migration、Auth 或 Storage 策略变更后：追加一次权限回归演练。

`npm run dr:validate` 仅检查本地恢复计划、migration/rebuild 一致性与 `.env.example` 的 secret 占位，不连接 Supabase、不导入数据库，也不修改任何远端资源。

## 回滚注意事项

新增 migration 采用前向修复，不自动回滚。若发布失败，先回滚应用到兼容旧 schema 的版本；数据库修复通过新的增量 migration 完成。不要 DROP、TRUNCATE 或反向执行可能丢数据的 SQL。
