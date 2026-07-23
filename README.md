# 故事情感地图

“故事情感地图”是一个以地图为主体的时空记录与基础社交应用。用户可以留下公开、私密或群组故事，创建公开/私密群组，关注作者，并在有权访问的记录下点赞、评论与举报。私密数据和群组内容的最终边界由 Supabase PostgreSQL Row Level Security（RLS）、受限 RPC 和列级权限强制执行。

## 技术栈

- Next.js App Router、React、TypeScript 严格模式
- Tailwind CSS
- Leaflet、react-leaflet、OpenStreetMap
- Supabase Auth、PostgreSQL、RLS
- Zod、React Hook Form、Vitest
- Lucide React（受控地点分类 SVG 图标注册表）

## 本地安装与启动

要求 Node.js 20.9 或更高版本：

```bash
npm install
cp .env.example .env.local
npm run dev
```

浏览器访问 <http://localhost:3000>。生产构建的本地启动方式：

```bash
npm run build
npm start
```

## Supabase 配置与 migration

1. 新建 Supabase 项目，在 Authentication 中启用邮箱认证。
2. 按文件名顺序执行全部 migration：
   - `supabase/migrations/202607220001_initial_schema.sql`
   - `supabase/migrations/202607220002_privacy_time_integrity.sql`
   - `supabase/migrations/202607230001_groups_social_categories.sql`
3. 在开发期按需配置邮箱确认和 `http://localhost:3000` 回调地址。
4. 从项目 API 设置复制 Project URL 与 anon/publishable key。

已安装 Supabase CLI 时可执行：

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

第二份 migration 是向后兼容的时间与写权限升级。第三份 migration 新增群组、成员、邀请、关注、点赞、评论、举报和 12 个稳定地点分类，并把记录可见性扩展为 `group`。旧记录不会被删除或重写，其地点分类安全回填为 `other`。

## 新增页面

- `/groups`、`/groups/new`：群组目录与创建。
- `/groups/[slug]`：群组地图与记录列表。
- `/groups/[slug]/members`、`/groups/[slug]/settings`：成员角色与群组资料管理。
- `/groups/invitations`：接受或拒绝邀请。
- `/feed`：按创建时间倒序的权限安全信息流，每页 20 条。
- `/users/[id]`：用户公开主页、关注状态与公开记录。

## 环境变量

`.env.local`：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
# 旧 Supabase 项目也可以改用：NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Publishable key 与 legacy anon key 二选一即可；项目优先读取 publishable key。不要提交 `.env.local`，也不要在浏览器端加入 Supabase `service_role` key。`NEXT_PUBLIC_SITE_URL` 部署后应改为正式站点 origin。

## 常用检查命令

```bash
npm test
npm run lint
npm run build
npm audit
npm audit --omit=dev
npm outdated
```

从本地 Supabase 生成数据库类型快照：

```bash
supabase gen types typescript --local > types/database.generated.ts
```

生成后应对照 migration 更新/替换 `types/database.ts`，并在 CI 中检查差异，防止手写类型长期漂移。

## 隐私状态隔离

前端数据状态按认证作用域保存：未登录为 `anon`，登录为当前 `user.id`。只有状态作用域与当前身份完全一致时，记录才会参与渲染；身份切换会用 React `key` 同步卸载地图详情、编辑器和删除目标。

查询还携带身份快照和单调请求序号。A 的旧请求即使晚于 B 返回，也会被拒绝写入。退出时先清空本地 session 视图，因此匿名重新查询失败也不会恢复 A 的私密记录。这只是防止客户端残留；数据库 RLS 仍是不可绕过的最终边界。

## 时间字段语义

`map_entries` 同时保存：

- `time_precision`：`exact`、`date`、`month`、`year`、`approximate`。
- `time_label`：用户可直接阅读的原始时间表达。
- `occurred_local`：`timestamp without time zone`，仅表示用户填写的事件当地墙上时间，不按查看者时区转换。
- `occurred_timezone`：可选 IANA 时区，例如 `Asia/Shanghai`；空值表示未知。
- `occurred_at`：旧版精确记录的兼容 UTC 字段。新版客户端不在时区语义不充分时生成它。
- `occurred_date`、`occurred_year`：用于筛选的派生字段；数据库触发器按时间精度规范化。

精确时间使用逐字段日历校验，拒绝不存在的日期、非闰年 2 月 29 日、24 点及非法分钟。编辑优先读取 `occurred_local`；旧数据只在现有 `time_label` 符合本项目旧格式时无损恢复，不根据查看者当前时区猜测。日期筛选优先采用事件当地日期。

## RLS 与客户端写权限

`map_entries`：

- `SELECT`：任何人可读公开记录；作者可读自己的全部记录；有效群组成员可读对应群组记录。
- `INSERT`：只允许登录用户，且 `user_id = auth.uid()`。
- `UPDATE`、`DELETE`：只允许作者本人。
- `group` 记录必须关联一个未归档群组，作者必须是有效成员；其他可见性不允许残留 `group_id`。
- 客户端不能写 `id`、`created_at`、`updated_at`、`occurred_at`；记录创建后也不能修改 `user_id`。
- 列级 `GRANT` 与不可变字段触发器构成双层保护；时间触发器维护可推导字段并验证 IANA 时区。

`profiles` 被明确限定为公开资料表，只允许显示名、头像 URL、简介和审计时间。严禁未来直接加入邮箱、账单、封禁原因或其他私密账户字段；这些字段必须进入单独的、默认不公开且配置独立 RLS 的表。

群组角色矩阵：

| 操作 | owner | admin | member |
| --- | --- | --- | --- |
| 查看与发布群组记录 | 是 | 是 | 是 |
| 邀请成员、移除普通成员 | 是 | 是 | 否 |
| 修改名称、简介、头像 | 是 | 是 | 否 |
| 修改 slug、公开性、成员角色 | 是 | 否 | 否 |
| 转移群主、归档群组 | 是 | 否 | 否 |
| 主动退出 | 转移后 | 是 | 是 |

记录可见性矩阵：

| 可见性 | 匿名 | 作者 | 其他登录用户 | 有效群组成员 | 点赞/评论 |
| --- | --- | --- | --- | --- | --- |
| public | 可读 | 可读 | 可读 | 可读 | 登录后允许 |
| private | 不可读 | 可读 | 不可读 | 不因成员身份授权 | 禁止 |
| group | 不可读 | 可读 | 不可读 | 可读 | 成员允许 |

群组成员、角色、邀请响应、群主转移、评论软删除和群组评论管理都通过受限 RPC 变更。权限辅助函数使用 `security definer`、空 `search_path` 和完整 schema 名，避免 `group_members` RLS 自递归；客户端没有成员表的直接写权限。关注关系永不授予私密或群组记录权限。点赞、评论及其聚合只能随可见记录读取，成员失效后关联社交信息也不可见。

`group_members` 被加入 Supabase Realtime publication。地图、群组详情、我的记录和信息流监听当前用户的成员状态；收到退出或移除事件时，先在本地同步移除对应群组数据并关闭详情，再重新查询。账户切换仍通过身份 `key` 整体卸载旧作用域，旧账户请求不能覆盖新账户状态。

## RLS 集成验证

`supabase/tests/rls_assertions.sql` 会在事务中创建测试账户和数据，并实际断言匿名读取、A/B 私密隔离、跨用户更新/删除、伪造作者以及修改数据库维护字段均成功或失败，最后回滚：

```bash
supabase db reset
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/rls_assertions.sql
```

`supabase/tests/groups_social_rls_assertions.sql` 使用 A/B/C 三个测试身份，断言群组加入/退出、私密邀请、成员移除后的即时失权、角色升级、群主保护、归档写入阻止、私密记录不因关注泄露、点赞/评论权限及举报隔离：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/groups_social_rls_assertions.sql
```

`supabase/tests/rls_manual_verification.sql` 保留了已有人工角色模拟说明。SQL Editor 默认高权限角色会绕过 RLS，不能把普通 SQL Editor 查询当作客户端权限验证。

## 浏览器端到端验证矩阵

1. 准备账户 A、B；A 创建一条公开和一条私密记录。
2. A 退出：私密标记和已打开的私密详情应立即消失，公开记录保留。
3. B 登录：只能看到 A 的公开记录，按 A 的私密记录 ID 访问也应得到“无权限或不存在”。
4. B 直接调用 API 更新、删除 A 的记录或伪造 A 的 `user_id`，必须失败。
5. 未登录填写记录并提交，登录后应恢复通过 Zod 校验的版本化草稿；损坏草稿会被删除。
6. 访问 `/login?next=//evil.example`、`/login?next=/%5Cevil.example` 等地址，登录后必须回到 `/`，不能跳转站外。
7. A 创建公开群组，B 加入；A 发布群组记录后 B 可查看、点赞和评论，C 不可读取。
8. B 退出群组后，群组地图、详情、点赞与评论立即不可见。
9. A 创建私密群组并邀请 B；B 接受后才取得访问权。
10. B 关注 A；信息流只出现 A 的公开记录、B 有权访问的群组记录和 B 自己的记录，不出现 A 的私密记录。
11. 创建/编辑记录时切换地点分类，地图图标立即更新；多分类与群组筛选可以组合。
12. 退出登录后，所有 `private` 和 `group` 内容以及已打开详情立即消失。

## 查询上限与透明度

地图和“我的记录”每次读取 `500 + 1` 条：第 501 条只用于判断截断，页面只渲染最近 500 条并明确提示“搜索、筛选和排序可能不完整”，不会无限读取全部数据。

后续查询设计：

1. 按地图边界请求，不再先取全局最近记录。
2. 用更新时间与 ID 做 keyset pagination，避免大 offset。
3. 使用 PostGIS 空间索引和视野范围查询。
4. 对低缩放级别使用服务端标记聚合。
5. 使用 PostgreSQL `tsvector`/全文索引取代客户端全文筛选。

## 错误处理与监控

Supabase/Auth/PostgreSQL 已知错误按 code/status 映射为中文提示；未知错误只显示统一安全文案，不向用户暴露表名、SQL、约束名、堆栈或 Supabase 内部消息。开发环境会从 `reportOperationalError` 输出原始错误，生产监控应统一在该入口接入 Sentry 等服务。应用和动态地图均有可恢复错误边界。

## 依赖安全状态（2026-07-23）

当前官方稳定版 `next@16.2.11` 的生产依赖审计仍报告：

- `sharp@0.34.5`：2 个 high，来自 libvips 的 CVE-2026-33327、CVE-2026-33328、CVE-2026-35590、CVE-2026-35591；修复版本要求 `sharp >= 0.35.0`。
- Next.js 内置 `postcss@8.4.31`：1 个 moderate，GHSA-qx2v-qp2m-jg93；修复版本要求 `postcss >= 8.5.10`。

`npm audit fix --force` 当前建议降级到不兼容的 `next@9.3.3`，因此没有执行；也没有用未经 Next.js 官方兼容声明的 overrides 强行替换内部依赖。Next.js 16.3 目前只有 preview/canary，不作为生产稳定升级。本项仍是上线风险：正式发布前必须升级到携带安全 `sharp`/`postcss` 的稳定 Next.js，并重新确认 `npm audit --omit=dev` 为可接受状态，不能把当前状态描述为“漏洞已解决”。

## 目录与源码交付清理

`.gitignore` 已排除 `.next`、`node_modules`、`.DS_Store`、`__MACOSX`、`*.tsbuildinfo`、覆盖率、日志和本地环境变量。源码压缩包应排除：

```text
node_modules/
.next/
out/
coverage/
.DS_Store
__MACOSX/
*.tsbuildinfo
.env
.env.local
.env.*.local
```

必须保留 `.env.example`。打包前可用 `find . -name '.DS_Store' -o -name '*.tsbuildinfo'` 检查，不要把真实密钥或构建缓存放入交付物。

## 已知限制

- 本轮环境没有 Supabase CLI、Docker 或 `psql`，所以群组/社交 migration 与新增 RLS 断言尚未在隔离 Supabase 数据库实际执行。
- 当前远程 Supabase 尚未执行第三份 migration，因此浏览器里的新群组/社交流程会在执行 migration 前显示“数据库尚未完成最新升级”。
- 没有 A/B/C 测试账户，因此多账户浏览器 E2E 需要在 migration 执行后的测试项目中人工或 CI 执行。
- 同坐标记录暂未聚合，可通过筛选结果列表逐条打开。
- OpenStreetMap 公共瓦片适合开发和低流量 MVP；生产流量需遵守其政策并评估合规瓦片服务。
- 头像仅支持 URL；评论为平铺分页，不支持回复树；未实现私信、即时聊天、完整管理员后台和商业化功能。
- 公开群组成员列表当前可由访客读取；私密群组成员列表只对有效成员开放。
- 群组地图首版每次最多显示最近 50 条群组记录，成员页最多显示前 100 位，并明确采用后续分页扩展的数据层结构。
- 删除是永久操作，只有二次确认，没有回收站。

## 下一阶段建议

优先顺序是：执行并验证第三份 migration；升级到修复间接漏洞的稳定 Next.js；把 RLS 与 A/B/C 浏览器 E2E 放入 CI；完成地图边界查询、群组成员 keyset pagination、PostGIS、服务端标记聚合和 PostgreSQL 全文搜索；然后再建设审核后台、通知、数据导出、监控告警和专用瓦片服务。
