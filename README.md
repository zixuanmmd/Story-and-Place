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
   - `supabase/migrations/202607240001_unique_display_names_and_schema_refresh.sql`
   - `supabase/migrations/202607250001_timelines_story_routes.sql`
   - `supabase/migrations/202607250002_group_membership_hardening.sql`
   - `supabase/migrations/202607250003_group_creator_select_policy.sql`
   - `supabase/migrations/202607260001_entry_participants_tags.sql`
3. 在开发期按需配置邮箱确认和 `http://localhost:3000` 回调地址。
4. 从项目 API 设置复制 Project URL 与 anon/publishable key。

已安装 Supabase CLI 时可执行：

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

第二份 migration 是向后兼容的时间与写权限升级。第三份 migration 新增群组、成员、邀请、关注、点赞、评论、举报和 12 个稳定地点分类，并把记录可见性扩展为 `group`。第四份 migration 增加昵称规范化唯一索引、可用性 RPC、注册触发器升级和 PostgREST schema cache 刷新。第五份 migration 新增时间线安全查询、故事路线、路线节点、分享权限和自动隐私降级保护。第六、七份 migration 加固群主不变量和群组创建后的读取策略。第八份 migration 新增共同经历邀请、字段级受控编辑、数据库编辑日志、自由标签、权限安全的标签聚合和相应 Realtime publication。旧记录不会被删除或重写，其地点分类安全回填为 `other`。

## 新增页面

- `/groups`、`/groups/new`：群组目录与创建。
- `/groups/[slug]`：群组地图与记录列表。
- `/groups/[slug]/members`、`/groups/[slug]/settings`：成员角色与群组资料管理。
- `/groups/invitations`：接受或拒绝邀请。
- `/feed`：按创建时间倒序的权限安全信息流，每页 20 条。
- `/users/[id]`：用户公开主页、关注状态与公开记录。
- `/timeline`：当前用户的个人故事时间线，每页 50 条。
- `/users/[id]/timeline`、`/groups/[slug]/timeline`：公开用户时间线与成员专属群组时间线。
- `/routes`、`/routes/new`：路线列表和路线编辑器。
- `/routes/[shareSlug]`、`/routes/[shareSlug]/edit`：权限安全的路线分享与编辑。
- `/entry-invitations`：接受或拒绝共同经历邀请。
- `/tags/[slug]`：只聚合当前访问者有权读取的标签记录。

## 环境变量

`.env.local`：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
# 旧 Supabase 项目也可以改用：NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION=true
```

Publishable key 与 legacy anon key 二选一即可；项目优先读取 publishable key。不要提交 `.env.local`，也不要在浏览器端加入 Supabase `service_role` key。`NEXT_PUBLIC_SITE_URL` 部署后应改为正式站点 origin。

## 测试环境免邮箱验证

临时、小范围测试时，可以让新用户注册后直接得到 Supabase session，无需打开邮箱。这个能力必须同时配置 Supabase 服务端和本地前端预期：

1. 打开 Supabase Dashboard。
2. 进入 `Authentication → Sign In / Providers → Email`；部分界面显示为 `Authentication → Providers → Email`。
3. 开启 Email Provider。
4. 开启 `Allow new users to sign up`。
5. 关闭 `Confirm Email`。Supabase 当前文档将它放在 Email Provider 的 provider-specific configuration 中。
6. 在 `.env.local` 中设置：

   ```dotenv
   NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION=false
   ```

7. 重启开发服务器。
8. 使用一个新的测试邮箱和未占用昵称注册，确认注册后直接回到原本准备访问的站内页面，导航栏显示用户名称，刷新页面后登录状态仍然存在。

前端环境变量不能关闭 Supabase 的邮箱确认，必须同时修改 Supabase Dashboard 配置。环境变量只控制前端预期、页面提示和配置不一致时的错误说明；真正的邮箱确认行为始终由 Supabase Auth 决定。变量缺失或任何非 `false` 值都会采用安全默认值 `true`。

该设置只适合临时、小范围测试。正式公开测试或生产环境应重新开启 `Confirm Email`，把 `NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION` 设为 `true` 或删除，并配置自定义 SMTP，避免依赖 Supabase 默认邮件发送额度。

关闭确认开关不会保证已有的未确认账户自动变为已确认，也不要为此自动删除现有用户。旧测试账户仍无法登录时，应在 Supabase Dashboard 中人工检查该账户的确认状态，或换一个新的测试邮箱重新注册。

已经注册的邮箱应直接登录，不要再次注册。测试模式下 Supabase 通常返回 `email_exists`、`user_already_exists` 或 `User already registered`；页面会保留邮箱、清空密码并显示“前往登录”。如果 Supabase 为防止邮箱枚举返回没有有效 email identity 的模糊用户对象，页面只提示“这个邮箱可能已经注册过”，不会查询 `auth.users` 或 public profiles 来推断邮箱。

## 昵称唯一性

昵称由数据库执行最终唯一约束。比较规则是：

- 去除首尾空白；
- 连续空白折叠为一个普通空格；
- 英文字母按大小写不敏感比较；
- 中文原文保持显示；
- 规范化后必须为 1 至 80 个字符。

因此 `山音`、` 山音 ` 视为同一昵称，`Zixuan`、`zixuan` 也视为同一昵称。注册页和设置页会先调用只返回 boolean 的 `is_display_name_available(candidate)`，但最终仍由 `profiles_display_name_normalized_uidx` 防止并发重复。

第四份 migration 会先整理历史数据：每个冲突组中最早创建的账户保留原昵称，后续账户增加稳定的“序号＋UUID 前 6 位”后缀；不会删除账户。执行后可验证规范化昵称没有重复：

```sql
select public.normalize_display_name(display_name), count(*)
from public.profiles
group by public.normalize_display_name(display_name)
having count(*) > 1;
```

结果应为 0 行。可用下面的查询查看可能由兼容迁移增加后缀的昵称：

```sql
select id, display_name, created_at
from public.profiles
where display_name ~ '-[0-9]+-[0-9a-f]{6}(-[0-9]+)?$'
order by created_at, id;
```

## 当前测试项目数据库初始化

本地环境指向 Supabase project ref `bmzsabgzzrwekghdceyj`。2026-07-25 的匿名只读检查确认 `profiles`、`groups` 和昵称可用性 RPC 已存在，说明第三、第四份 migration 已可由 PostgREST 读取；`story_routes` 和 `story_route_items` 仍返回 `PGRST205`，第五份时间线/路线 migration 尚未执行。当前机器没有 Supabase CLI、Docker 或 `psql`，因此没有自动推送。

远程项目若仍停留在当时检查状态，需要在 SQL Editor 按顺序执行尚未应用的增量 migration：

1. `supabase/migrations/202607250001_timelines_story_routes.sql`
2. `supabase/migrations/202607250002_group_membership_hardening.sql`
3. `supabase/migrations/202607250003_group_creator_select_policy.sql`
4. `supabase/migrations/202607260001_entry_participants_tags.sql`

不要在远程项目执行 `supabase db reset`，也不要重复手工回放已经执行的旧 migration。第五份 migration 会检查前置群组结构，缺失时明确失败，避免部分功能看似成功但数据库边界没有建立；第六份必须在第五份成功后执行。执行后可验证：

```sql
select
  to_regclass('public.groups') as groups_table,
  to_regclass('public.group_members') as members_table,
  to_regclass('public.group_invitations') as invitations_table;

select public.is_display_name_available('一个尚未使用的测试昵称');

select
  to_regclass('public.story_routes') as routes_table,
  to_regclass('public.story_route_items') as route_items_table,
  to_regprocedure(
    'public.get_timeline_entries(text,uuid,text,text,text[],uuid,text,integer,integer,boolean,integer,integer)'
  ) as timeline_rpc,
  to_regprocedure('public.ensure_group_has_active_owner()') as owner_guard;
```

群组目录不会把查询错误转换成空数组：加载失败时只显示错误和重试按钮；只有所有查询真实成功且结果为空时才显示空状态。

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

## 故事时间线

时间线通过 `get_timeline_entries` 由数据库完成作用域、RLS、筛选、稳定排序和每页 50 条的分页，浏览器不会先取回无权内容再隐藏。排序优先使用 `occurred_year`、`occurred_date` 和 `occurred_local`；仅当“大致时间”的显示文本包含边界清楚的四位年份时才参与对应年份分组。无法可靠判断年份的记录独立放在“时间未定”，不会被伪造成 1 月 1 日。

- `/timeline` 只对登录用户开放，读取自己的记录和已接受的共同经历；群组记录仍要求有效成员资格。
- `/users/[id]/timeline` 永远只查询该用户的公开记录。
- `/groups/[slug]/timeline` 只对当前有效成员开放，只查询该群组的 `group` 记录。
- 地图标记与时间线卡片双向选中；筛选参数经过白名单和 Zod 校验。
- 退出登录由认证作用域 `key` 立即卸载全部状态；成员退出/被移除时 Realtime 会立即清除对应群组节点。

## 故事路线、连线与分享权限

“故事路线”是独立实体，不修改原始地图记录。`story_route_items` 只保存 `entry_id`、位置和最多 500 字的路线注记，不复制标题、正文、地点或坐标。路线草稿允许 1 个节点，发布至少 2 个，最多 200 个；保存、重排和归档通过受限 RPC 原子执行，普通客户端没有路线节点表的直接写权限。

| 路线可见性 | 可用节点 | 可读者 |
| --- | --- | --- |
| public | 作者自己的公开记录 | 匿名用户和登录用户 |
| private | 作者自己的可见记录，或作者当前有权读取的群组记录 | 仅路线作者；群组资格失效后对应节点不可见 |
| group | 同一群组的群组记录，及作者自己的公开记录 | 当前有效群组成员 |

数据库读取路线节点时会同时检查“路线是否可读”和“原始记录当前是否可读”。公开路线中的公开记录一旦改为私密或群组，触发器立即把包含它的公开路线降为私密并记录 `privacy_downgraded_at`。原记录被删除时节点通过外键安全移除；剩余节点不足 2 个时路线自动撤回发布。群组资格或记录权限变化导致的不可用节点只显示数量提示，不返回标题、正文或坐标。

路线地图使用项目内受控 SVG 分类图标、编号、可见性外形和虚线连线；跨国际日期变更线的线段会在 ±180° 拆开，相同坐标使用确定性的轻微视觉偏移。分享地址优先使用 `NEXT_PUBLIC_SITE_URL`；若部署时仍误留为 localhost，浏览器会改用当前页面 origin，Vercel 元数据也会回退到实际部署域名。分享优先使用 Web Share API，失败时回退到剪贴板。公开路线可以生成标题和说明预览；群组或私密路线的服务端元数据统一使用安全通用文案。

## RLS 与客户端写权限

`map_entries`：

- `SELECT`：任何人可读公开记录；作者可读自己的全部记录；accepted 共同经历者可读对应私密记录；有效群组成员可读对应群组记录。
- `INSERT`：只允许登录用户，且 `user_id = auth.uid()`。
- `UPDATE`、`DELETE`：只允许作者本人。
- `group` 记录必须关联一个未归档群组，作者必须是有效成员；其他可见性不允许残留 `group_id`。
- 客户端不能写 `id`、`created_at`、`updated_at`、`occurred_at`；记录创建后也不能修改 `user_id`。
- 列级 `GRANT` 与不可变字段触发器构成双层保护；时间触发器维护可推导字段并验证 IANA 时区。
- 共同经历者只能通过 `update_entry` RPC 修改明确授权的逻辑字段，不能修改可见性、`group_id`、评论设置或删除记录；每次实际变化由数据库触发器写入不可直接修改的 `entry_edit_logs`。

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

| 可见性 | 匿名 | 作者 | accepted 共同经历者 | 其他登录用户 | 有效群组成员 |
| --- | --- | --- | --- | --- | --- |
| public | 可读 | 可读 | 可读 | 可读 | 可读 |
| private | 不可读 | 可读 | 可读 | 不可读 | 不因成员身份授权 |
| group | 不可读 | 需有效成员资格 | 还需有效成员资格 | 不可读 | 可读 |

群组成员、角色、邀请响应、群主转移、评论软删除和群组评论管理都通过受限 RPC 变更。权限辅助函数使用 `security definer`、空 `search_path` 和完整 schema 名，避免 `group_members` RLS 自递归；客户端没有成员表的直接写权限。关注关系永不授予私密或群组记录权限。点赞、评论及其聚合只能随可见记录读取，成员失效后关联社交信息也不可见。

`group_members`、`map_entries`、`entry_participants`、`entry_tags` 和 `entry_edit_logs` 被加入 Supabase Realtime publication。地图、时间线、路线、群组详情、我的记录、信息流、邀请和标签页面收到可见变更后重新执行权限查询；成员退出、参与权限撤销后会清除已经失权的本地内容。账户切换仍通过身份 `key` 整体卸载旧作用域。

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

该脚本还会断言群主重复调用公开群组加入 RPC 后仍保持 owner。第六份 migration 的延迟约束会在事务结束前拒绝任何让群组失去最后一个有效 owner 的写入。

`supabase/tests/display_name_uniqueness_assertions.sql` 断言注册触发器规范化昵称、本人可保留原昵称，以及数据库表达式唯一索引阻止大小写和空白变体：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/display_name_uniqueness_assertions.sql
```

`supabase/tests/story_routes_rls_assertions.sql` 检查路线表、RLS、受限 RPC 和“客户端不得直接写路线节点”的权限契约：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/story_routes_rls_assertions.sql
```

`supabase/tests/entry_collaboration_rls_assertions.sql` 断言 pending 参与者不能读取私密事件、accepted 后才可读取和按字段编辑、参与者不能改变访问设置或删除、群组邀请要求有效成员、审计日志由数据库生成，以及标签聚合不会泄露私密关联：

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/entry_collaboration_rls_assertions.sql
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
13. 在 `/timeline` 选择至少两条记录创建公开路线；公开路线只能接受公开节点，匿名窗口可打开分享链接。
14. 把其中一个公开节点改为私密；原分享链接应立即不再向匿名用户返回路线或地点数据。
15. 创建群组路线；非成员只能看到通用无权限页面，成员退出后路线节点应立即不可读。
16. 使用跨 ±180° 的两个地点验证路线不会画出横跨整张世界地图的错误长线。
17. A 邀请 B 参与私密记录；B 接受前不能读取内容，接受后只能修改获授权字段，不能改变可见性、群组、评论设置或删除。
18. B 接受后修改正文和标签，A/B 能看到数据库编辑日志；C 和匿名用户看不到私密标签聚合。
19. 群组记录只能邀请有效成员；成员离组后即使参与状态仍为 accepted，也不能继续读取或编辑。

## 查询上限与透明度

地图和“我的记录”每次读取 `500 + 1` 条：第 501 条只用于判断截断，页面只渲染最近 500 条并明确提示“搜索、筛选和排序可能不完整”，不会无限读取全部数据。

后续查询设计：

1. 按地图边界请求，不再先取全局最近记录。
2. 用更新时间与 ID 做 keyset pagination，避免大 offset。
3. 使用 PostGIS 空间索引和视野范围查询。
4. 对低缩放级别使用服务端标记聚合。
5. 使用 PostgreSQL `tsvector`/全文索引取代客户端全文筛选。

## 错误处理与监控

Supabase/Auth/PostgreSQL 已知错误按 code/status 映射为中文提示；未知错误只显示统一安全文案，不向用户暴露表名、SQL、约束名、堆栈或 Supabase 内部消息。开发环境会从 `reportOperationalError` 记录经过白名单筛选的 code、status、message、details、hint 和操作名，不记录密码、access token、refresh token 或密钥；生产监控应统一在该入口接入 Sentry 等服务。应用和动态地图均有可恢复错误边界。

## 浏览器安全与移动端导航

Next.js 为全部页面返回 CSP、`frame-ancestors 'none'`、`X-Frame-Options: DENY`、`Referrer-Policy`、`Permissions-Policy`、COOP 和 `nosniff`。CSP 只允许项目自身、Supabase 连接、HTTPS 图片与必要的 Leaflet/Next.js 运行资源。新设置的用户和群组头像必须使用 HTTPS；旧 HTTP 图片会被 CSP 阻止加载，修改资料时应换成 HTTPS 地址。

760px 以下使用明确的“菜单”按钮打开纵向导航，不再依赖不可见的横向滚动；页面根节点禁止横向溢出，地图筛选和新建记录按钮保持在 320px 视口内。登录、注册互相切换时会保留经过白名单校验的 `next`，支持记录详情、群组、用户主页、时间线和故事路线，同时继续拒绝外部 URL 与异常编码。

## 依赖安全状态（2026-07-25）

当前官方稳定版 `next@16.2.11` 的生产依赖审计仍报告：

- `sharp@0.34.5`：2 个 high，来自 libvips 的 CVE-2026-33327、CVE-2026-33328、CVE-2026-35590、CVE-2026-35591；修复版本要求 `sharp >= 0.35.0`。
- Next.js 内置 `postcss@8.4.31`：1 个 high，审计包含 GHSA-qx2v-qp2m-jg93 与 GHSA-6g55-p6wh-862q。

共计 3 个 high。`npm audit fix --force` 当前建议降级到不兼容的 `next@9.3.3`，因此没有执行；也没有用未经 Next.js 官方兼容声明的 overrides 强行替换内部依赖。本项仍是上线风险：正式发布前必须升级到携带安全 `sharp`/`postcss` 的稳定 Next.js，并重新确认 `npm audit --omit=dev` 为可接受状态，不能把当前状态描述为“漏洞已解决”。

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

- 本轮环境没有 Supabase CLI、Docker 或 `psql`，所以第五、六份 migration 与全部 SQL/RLS 断言尚未在隔离 Supabase 数据库实际执行。
- 当前远程 Supabase 已能读取群组结构与昵称 RPC，但尚未执行第五、六份 migration，因此时间线、故事路线、群主完整性约束和收紧后的 RPC ACL 在人工执行前不会生效；页面不会用空数组或伪造数据掩盖缺失结构。
- 没有 A/B/C 测试账户，因此多账户浏览器 E2E 需要在 migration 执行后的测试项目中人工或 CI 执行。
- 同坐标记录暂未聚合，可通过筛选结果列表逐条打开。
- OpenStreetMap 公共瓦片适合开发和低流量 MVP；生产流量需遵守其政策并评估合规瓦片服务。
- 头像仅支持 URL；评论为平铺分页，不支持回复树；未实现私信、即时聊天、完整管理员后台和商业化功能。
- 公开群组成员列表当前可由访客读取；私密群组成员列表只对有效成员开放。
- 群组目录、群组记录、成员、邀请和评论使用“时间＋稳定 ID”的复合 keyset cursor，并在追加页面时去重；群组地图仍按页限制读取，不会一次加载全部数据。
- 时间线当前使用 offset 分页；数据量增长后应迁移为由“时间是否未定＋事件年份＋当地时间＋创建时间＋ID”组成的 keyset cursor。
- 路线编辑器只在选择群组路线时加载其他成员的群组记录；私密路线编辑器默认只列作者自己的记录，已有且仍有权限的群组节点继续兼容。
- 删除是永久操作，只有二次确认，没有回收站。

## 下一阶段建议

优先顺序是：执行并验证第五、六份 migration；在 Supabase 测试项目关闭 Confirm Email 后完成 A/B/C 浏览器 E2E；升级到修复间接漏洞的稳定 Next.js；把路线隐私降级和 RLS 集成测试放入 CI；将时间线与路线列表的 offset 分页继续迁移为复合 keyset cursor；完成 PostGIS、服务端标记聚合和 PostgreSQL 全文搜索；然后再建设路线封面、审核后台、通知、数据导出、监控告警和专用瓦片服务。
